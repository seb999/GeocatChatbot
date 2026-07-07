import type { Request, Response } from 'express';
import { appendFile } from 'node:fs/promises';
import Anthropic from '@anthropic-ai/sdk';
import type {
  MessageParam,
  Tool,
  ToolUseBlock,
  ToolResultBlockParam,
  ContentBlockParam,
} from '@anthropic-ai/sdk/resources/messages';
import { config } from './config.js';
import { McpSession, type McpToolDef } from './mcp/client.js';
import { isWriteTool } from './mcp/writeTools.js';

const SYSTEM_PROMPT = `You are the assistant for the EEA geospatial metadata catalogue (GeoNetwork),
which you reach through catalogue tools.

You can SEARCH and READ records, and also MODIFY them (update titles/fields, manage tags,
duplicate records, manage attachments, run XSL processes).

Rules:
- Prefer get_record_summary over get_record unless the user asks for full detail.
- Never invent records, UUIDs, tags, or extents — search or fetch first, then act on the tool result.
- Before any modifying action, briefly state what you will change and why. Every modifying action
  is confirmed by the user through the app before it runs; if the user declines, acknowledge and stop.
- Show titles, UUIDs, and geographic extents clearly. Keep answers concise.`;

const MAX_TOOL_ROUNDS = 12;

interface Decision {
  tool_use_id: string;
  approve: boolean;
  note?: string;
}

interface ChatBody {
  message?: string;
  history?: MessageParam[];
  decisions?: Decision[];
}

function labelFor(name: string): string {
  const map: Record<string, string> = {
    search_records: 'Searching the catalogue…',
    search_by_extent: 'Searching by map extent…',
    get_record: 'Fetching record…',
    get_record_summary: 'Reading record summary…',
    get_related_records: 'Finding related records…',
    get_attachments: 'Listing attachments…',
    get_tags: 'Reading tags…',
    get_regions: 'Reading regions…',
    list_groups: 'Listing groups…',
    get_sources: 'Reading sources…',
    get_site_info: 'Reading site info…',
    update_record: 'Updating record…',
    update_record_title: 'Updating record title…',
    duplicate_record: 'Duplicating record…',
    add_record_tags: 'Adding tags…',
    delete_record_tags: 'Removing tags…',
    process_record: 'Running process…',
    delete_attachment: 'Deleting attachment…',
  };
  return map[name] ?? `${name.replace(/_/g, ' ')}…`;
}

/** All MCP tools are exposed; writes are gated at runtime (not filtered out). */
function toAnthropicTools(mcpTools: McpToolDef[]): Tool[] {
  return mcpTools.map((t) => ({
    name: t.name,
    description: t.description ?? t.name,
    input_schema: t.inputSchema as Tool['input_schema'],
  }));
}

/** Tail assistant message that still has unanswered tool_use blocks, if any. */
function pendingToolUses(messages: MessageParam[]): ToolUseBlock[] {
  const last = messages[messages.length - 1];
  if (!last || last.role !== 'assistant' || !Array.isArray(last.content)) return [];
  return last.content.filter((b): b is ToolUseBlock => (b as { type?: string }).type === 'tool_use');
}

async function audit(entry: Record<string, unknown>): Promise<void> {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  console.log(`[audit] ${line}`);
  try {
    await appendFile('audit.log', line + '\n');
  } catch {
    /* best effort */
  }
}

export async function chatHandler(req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  const send = (ev: unknown) => res.write(JSON.stringify(ev) + '\n');
  const finish = () => {
    send({ type: 'done' });
    res.end();
  };

  if (!config.anthropicApiKey) {
    send({ type: 'error', message: 'ANTHROPIC_API_KEY not configured on the server.' });
    return finish();
  }

  const body = req.body as ChatBody;
  const decisions = new Map<string, Decision>();
  for (const d of body.decisions ?? []) decisions.set(d.tool_use_id, d);

  const messages: MessageParam[] = [...(body.history ?? [])];
  if (body.message?.trim()) {
    messages.push({ role: 'user', content: body.message.trim() });
  } else if (decisions.size === 0) {
    send({ type: 'error', message: 'Empty message.' });
    return finish();
  }

  // Connect to MCP (graceful degradation).
  let mcp: McpSession | null = null;
  let tools: Tool[] = [];
  try {
    mcp = await McpSession.connect(config.mcpUrl, config.mcpAuth || undefined);
    tools = toAnthropicTools(await mcp.listTools());
  } catch (e) {
    send({ type: 'notice', message: `Catalogue tools unavailable: ${errMsg(e)}` });
  }

  const anthropic = new Anthropic({ apiKey: config.anthropicApiKey });

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const uses = pendingToolUses(messages);

      if (uses.length === 0) {
        // Need a model turn.
        const stream = anthropic.messages.stream({
          model: config.anthropicModel,
          max_tokens: 8192,
          thinking: { type: 'adaptive' },
          system: SYSTEM_PROMPT,
          tools,
          messages,
        });
        stream.on('text', (delta) => send({ type: 'content_delta', text: delta }));
        const final = await stream.finalMessage();
        messages.push({ role: 'assistant', content: final.content as ContentBlockParam[] });

        if (final.stop_reason !== 'tool_use') {
          send({ type: 'history', messages });
          break;
        }
        continue; // next iteration resolves the tool_use blocks
      }

      // There are unresolved tool_use blocks. Gate on undecided writes.
      const undecidedWrites = uses.filter((u) => isWriteTool(u.name) && !decisions.has(u.id));
      if (undecidedWrites.length > 0) {
        send({
          type: 'confirm',
          tools: undecidedWrites.map((u) => ({
            tool_use_id: u.id,
            name: u.name,
            label: labelFor(u.name),
            input: u.input,
          })),
        });
        send({ type: 'history', messages });
        break; // wait for the client to resume with decisions
      }

      // Execute every pending tool: reads auto, writes per decision.
      const results: ToolResultBlockParam[] = [];
      for (const u of uses) {
        if (isWriteTool(u.name)) {
          const d = decisions.get(u.id)!;
          if (!d.approve) {
            await audit({ event: 'write_declined', tool: u.name, input: u.input });
            results.push({
              type: 'tool_result',
              tool_use_id: u.id,
              content: `User declined this action.${d.note ? ' Note: ' + d.note : ''}`,
              is_error: true,
            });
            continue;
          }
          send({ type: 'tool_call', name: u.name, label: labelFor(u.name) });
          const content = await callTool(mcp, u);
          await audit({ event: 'write_executed', tool: u.name, input: u.input });
          results.push({ type: 'tool_result', tool_use_id: u.id, content });
        } else {
          send({ type: 'tool_call', name: u.name, label: labelFor(u.name) });
          const content = await callTool(mcp, u);
          results.push({ type: 'tool_result', tool_use_id: u.id, content });
        }
      }
      messages.push({ role: 'user', content: results });
      decisions.clear(); // consumed; further writes need fresh confirmation

      if (round === MAX_TOOL_ROUNDS - 1) {
        send({ type: 'notice', message: 'Reached the tool-call limit for this turn.' });
        send({ type: 'history', messages });
      }
    }
  } catch (e) {
    if (isBillingError(e)) send({ type: 'billing' });
    else send({ type: 'error', message: errMsg(e) });
  }

  finish();
}

/** Anthropic returns a 400 "credit balance is too low" when the account is out of credit. */
function isBillingError(e: unknown): boolean {
  const msg = (e instanceof Error ? e.message : String(e)).toLowerCase();
  return msg.includes('credit balance') || msg.includes('billing');
}

async function callTool(mcp: McpSession | null, u: ToolUseBlock): Promise<string> {
  if (!mcp) return JSON.stringify({ error: `Tool '${u.name}' unavailable (MCP not connected)` });
  try {
    return await mcp.callTool(u.name, u.input);
  } catch (e) {
    return JSON.stringify({ error: errMsg(e) });
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
