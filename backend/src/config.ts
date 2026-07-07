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
  defaultProvider: (process.env.LLM_PROVIDER === 'openai' ? 'openai' : 'anthropic') as
    | 'anthropic'
    | 'openai',
  mcpUrl: process.env.GEOCAT_MCP_URL ?? 'https://sdi-mcp.dspx.eu/',
  mcpAuth: process.env.GEOCAT_MCP_AUTH ?? '',
  // Firebase auth gate
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? '',
  allowedEmails: parseList(process.env.ALLOWED_EMAILS),
  allowedDomains: parseList(process.env.ALLOWED_DOMAINS),
} as const;
