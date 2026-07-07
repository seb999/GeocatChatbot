import 'dotenv/config';

function parseList(v: string | undefined): string[] {
  return (v ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export const config = {
  port: Number(process.env.PORT ?? 8080),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? '',
  anthropicModel: process.env.ANTHROPIC_MODEL ?? 'claude-opus-4-8',
  mcpUrl: process.env.GEOCAT_MCP_URL ?? 'https://sdi-mcp.dspx.eu/',
  mcpAuth: process.env.GEOCAT_MCP_AUTH ?? '',
  // Firebase auth gate
  firebaseProjectId: process.env.FIREBASE_PROJECT_ID ?? '',
  allowedEmails: parseList(process.env.ALLOWED_EMAILS),
  allowedDomains: parseList(process.env.ALLOWED_DOMAINS),
} as const;
