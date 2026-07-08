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

Schema: records use ISO 19115-3 (not 19139). Common namespaces: mdb (root), mri
(identification), cit (citation), gex (extent), gml (geometry/time), gco (basic types).
Frequently-edited fields:
- Resource identifier: cit:identifier/mcc:MD_Identifier/mcc:code
- Creation/publication date: cit:date[cit:CI_DateTypeCode/@codeListValue='creation'|'publication']/cit:CI_Date/cit:date/gco:Date
- Temporal extent: gex:EX_TemporalExtent/gex:extent/gml:TimePeriod/gml:beginPosition|endPosition

Rules:
- Prefer get_record_summary over get_record unless the user asks for full detail.
- Never invent records, UUIDs, tags, extents, or XPaths — search or fetch first, then act on
  the tool result. But if the user already supplies exact values/XPaths/group IDs in their
  request, use them directly rather than re-discovering them with extra reads.
- Draft records return 403 on fetch/export — don't attempt to "verify" a draft afterward.
  Report success/failure from the update call itself; the record stays a draft until the
  user approves/publishes it manually.
- When a request touches several records independently (e.g. one duplicate per year), batch
  the calls per record instead of finishing one record fully before starting the next.
- Before any modifying action, briefly state what you're changing and why, then proceed —
  modifying actions run immediately, without a separate user confirmation step.
- Show titles, UUIDs, and geographic extents clearly. Keep answers concise.`;

const MAX_TOOL_ROUNDS = 100;
/** Cap on tool-result content actually stored in history (the UI preview has its own, smaller cap). */
const TOOL_RESULT_MAX_CHARS = 6000;
/** How many of the most recent user turns to keep; older turns are dropped from history. */
const MAX_HISTORY_TURNS = 20;

/**
 * Keep only the last `maxTurns` user turns. Cuts are made at plain text user
 * messages (role 'user', string content) — the shape `provider.userMessage()`
 * produces — never in the middle of a turn, so a tool_use is never separated
 * from its tool_result.
 */
function windowHistory(messages: unknown[], maxTurns: number): unknown[] {
  const cutPoints: number[] = [];
  messages.forEach((m, i) => {
    const msg = m as { role?: string; content?: unknown };
    if (msg.role === 'user' && typeof msg.content === 'string') cutPoints.push(i);
  });
  if (cutPoints.length <= maxTurns) return messages;
  return messages.slice(cutPoints[cutPoints.length - maxTurns]);
}

interface ChatBody {
  message?: string;
  history?: unknown[];
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

  const messages: unknown[] = windowHistory([...(body.history ?? [])], MAX_HISTORY_TURNS);
  if (body.message?.trim()) {
    messages.push(provider.userMessage(body.message.trim()));
  } else {
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

      // Execute every pending tool immediately (writes run unconfirmed, but audited).
      const results: ToolResult[] = [];
      for (const u of uses) {
        const write = isWriteTool(u.name);
        // Announce the call with its arguments, run it, then send a result preview.
        send({ type: 'tool_call', id: u.id, name: u.name, label: labelFor(u.name), input: u.input });
        const content = await callTool(mcp, u);
        if (write) await audit({ event: 'write_executed', tool: u.name, input: u.input });
        send({ type: 'tool_result', id: u.id, name: u.name, preview: truncate(content, 1500) });
        results.push({ id: u.id, name: u.name, content: truncate(content, TOOL_RESULT_MAX_CHARS) });
      }
      for (const m of provider.toolResultMessages(results)) messages.push(m);

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
