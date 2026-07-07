import type { Request, Response } from 'express';
import { appendFile } from 'node:fs/promises';
import { config } from './config.js';
import { McpSession } from './mcp/client.js';
import { isWriteTool } from './mcp/writeTools.js';
import { getProvider, isValidModel, type ProviderId } from './providers/index.js';
import { errMsg, type ToolCall, type ToolResult } from './providers/types.js';

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
  history?: unknown[];
  decisions?: Decision[];
  provider?: string;
  model?: string;
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

async function audit(entry: Record<string, unknown>): Promise<void> {
  const line = JSON.stringify({ ts: new Date().toISOString(), ...entry });
  console.log(`[audit] ${line}`);
  try {
    await appendFile('audit.log', line + '\n');
  } catch {
    /* best effort */
  }
}

/** Resolve provider + model from the request, validated against the catalog. */
function resolveModel(body: ChatBody): { providerId: ProviderId; model: string } {
  const providerId: ProviderId =
    body.provider === 'openai' || body.provider === 'anthropic'
      ? body.provider
      : config.defaultProvider;
  const fallbackModel = providerId === 'openai' ? config.openaiModel : config.anthropicModel;
  const model = body.model && isValidModel(providerId, body.model) ? body.model : fallbackModel;
  return { providerId, model };
}

export async function chatHandler(req: Request, res: Response): Promise<void> {
  res.setHeader('Content-Type', 'application/x-ndjson');
  res.setHeader('Cache-Control', 'no-cache');
  const send = (ev: unknown) => res.write(JSON.stringify(ev) + '\n');
  const finish = () => {
    send({ type: 'done' });
    res.end();
  };

  const body = req.body as ChatBody;
  const { providerId, model } = resolveModel(body);
  const provider = getProvider(providerId)!;

  if (!provider.isConfigured()) {
    send({ type: 'error', message: `${provider.label} API key not configured on the server.` });
    return finish();
  }

  const decisions = new Map<string, Decision>();
  for (const d of body.decisions ?? []) decisions.set(d.tool_use_id, d);

  const messages: unknown[] = [...(body.history ?? [])];
  if (body.message?.trim()) {
    messages.push(provider.userMessage(body.message.trim()));
  } else if (decisions.size === 0) {
    send({ type: 'error', message: 'Empty message.' });
    return finish();
  }

  // Connect to MCP (graceful degradation).
  let mcp: McpSession | null = null;
  let tools: unknown = provider.formatTools([]);
  try {
    mcp = await McpSession.connect(config.mcpUrl, config.mcpAuth || undefined);
    tools = provider.formatTools(await mcp.listTools());
  } catch (e) {
    send({ type: 'notice', message: `Catalogue tools unavailable: ${errMsg(e)}` });
  }

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const uses = provider.pendingToolCalls(messages);

      if (uses.length === 0) {
        // Need a model turn.
        const turn = await provider.streamTurn({
          model,
          system: SYSTEM_PROMPT,
          tools,
          messages,
          onText: (delta) => send({ type: 'content_delta', text: delta }),
        });
        messages.push(turn.assistantMessage);

        if (!turn.needsTools) {
          send({ type: 'history', messages });
          break;
        }
        continue; // next iteration resolves the tool calls
      }

      // There are unresolved tool calls. Gate on undecided writes.
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
      const results: ToolResult[] = [];
      for (const u of uses) {
        const write = isWriteTool(u.name);
        if (write) {
          const d = decisions.get(u.id)!;
          if (!d.approve) {
            await audit({ event: 'write_declined', tool: u.name, input: u.input });
            results.push({
              id: u.id,
              name: u.name,
              content: `User declined this action.${d.note ? ' Note: ' + d.note : ''}`,
              isError: true,
            });
            continue;
          }
        }
        // Announce the call with its arguments, run it, then send a result preview.
        send({ type: 'tool_call', id: u.id, name: u.name, label: labelFor(u.name), input: u.input });
        const content = await callTool(mcp, u);
        if (write) await audit({ event: 'write_executed', tool: u.name, input: u.input });
        send({ type: 'tool_result', id: u.id, name: u.name, preview: truncate(content, 1500) });
        results.push({ id: u.id, name: u.name, content });
      }
      for (const m of provider.toolResultMessages(results)) messages.push(m);
      decisions.clear(); // consumed; further writes need fresh confirmation

      if (round === MAX_TOOL_ROUNDS - 1) {
        send({ type: 'notice', message: 'Reached the tool-call limit for this turn.' });
        send({ type: 'history', messages });
      }
    }
  } catch (e) {
    if (provider.isBillingError(e)) send({ type: 'billing', provider: provider.id, label: provider.label });
    else send({ type: 'error', message: errMsg(e) });
  }

  finish();
}

async function callTool(mcp: McpSession | null, u: ToolCall): Promise<string> {
  if (!mcp) return JSON.stringify({ error: `Tool '${u.name}' unavailable (MCP not connected)` });
  try {
    return await mcp.callTool(u.name, u.input);
  } catch (e) {
    return JSON.stringify({ error: errMsg(e) });
  }
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n) + '\n… (truncated)';
}
