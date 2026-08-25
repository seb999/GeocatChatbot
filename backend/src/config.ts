import 'dotenv/config';

function parseList(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  // LLM providers (keys stay server-side; the UI picks provider + model per request).
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
  openaiApiKey: process.env.OPENAI_API_KEY ?? '',
  openaiModel: process.env.OPENAI_MODEL ?? 'gpt-5',
  // EEA in-house LLM gateway — OpenAI-compatible API, so it reuses the OpenAI
  // provider with a different base URL. Empty key = shown disabled in the UI.
  localApiKey: process.env.EEA_API_KEY ?? '',
  localBaseUrl: process.env.EEA_BASE_URL ?? 'https://llmgw.eea.europa.eu/v1',
  localModel: process.env.EEA_MODEL ?? 'Inhouse-LLM/qwen3.8-27b',
  defaultProvider: (['anthropic', 'openai', 'local'].includes(process.env.LLM_PROVIDER ?? '')
    ? process.env.LLM_PROVIDER
    : 'anthropic') as 'anthropic' | 'openai' | 'local',
  mcpUrl: process.env.GEOCAT_MCP_URL ?? 'https://sdi-mcp.dspx.eu/',
  mcpAuth: process.env.GEOCAT_MCP_AUTH ?? '',
  // SQLite file for user-defined skills (dev-plan/skills-architecture.md).
  // Not durable in the current stateless Dockerfile — mount a volume in prod.
  skillsDbPath: process.env.SKILLS_DB_PATH ?? 'skills.db',
  // Firebase auth gate
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? '',
  allowedEmails: parseList(process.env.ALLOWED_EMAILS),
  allowedDomains: parseList(process.env.ALLOWED_DOMAINS),
} as const;
