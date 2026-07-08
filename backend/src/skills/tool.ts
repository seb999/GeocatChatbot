import type { McpToolDef } from '../mcp/client.js';
import { getBodyByName } from './store.js';

export const LOAD_SKILL_TOOL_NAME = 'load_skill';

/** A local tool (not from MCP) — the catalogue lists name+description in the
 * system prompt; the model calls this to pull a skill's full instructions
 * into context when it looks relevant (dev-plan/skills-architecture.md §3). */
export const LOAD_SKILL_TOOL: McpToolDef = {
  name: LOAD_SKILL_TOOL_NAME,
  description:
    "Load the full instructions for one of the user's saved skills, by name, when it looks relevant to the current request.",
  inputSchema: {
    type: 'object',
    properties: { name: { type: 'string', description: 'Exact skill name, as listed in the system prompt.' } },
    required: ['name'],
  },
};

export function isLoadSkillTool(name: string): boolean {
  return name === LOAD_SKILL_TOOL_NAME;
}

export function runLoadSkill(ownerUid: string, input: unknown): string {
  const name = (input as { name?: unknown } | null)?.name;
  if (typeof name !== 'string' || !name.trim()) {
    return JSON.stringify({ error: 'load_skill requires a "name" string.' });
  }
  const body = getBodyByName(ownerUid, name.trim());
  if (body === undefined) return JSON.stringify({ error: `No saved skill named '${name}'.` });
  return body;
}
