import express from 'express';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from './config.js';
import { McpSession } from './mcp/client.js';
import { isWriteTool } from './mcp/writeTools.js';
import { chatHandler } from './chat.js';
import { catalog } from './providers/index.js';
import { requireAuth, warnIfOpen, type AuthedUser } from './auth.js';
import { createSkill, deleteSkill, listSkills, updateSkill } from './skills/store.js';

const app = express();
app.use(express.json({ limit: '5mb' }));

/** Liveness check (public — no auth). */
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    defaultProvider: config.defaultProvider,
    anthropicKeyConfigured: Boolean(config.anthropicApiKey),
    openaiKeyConfigured: Boolean(config.openaiApiKey),
    authConfigured: Boolean(config.firebaseProjectId),
    mcpUrl: config.mcpUrl,
  });
});

/** Provider + model catalog for the UI pickers, tagging configured providers. */
app.get('/api/models', requireAuth, (_req, res) => {
  res.json({
    ...catalog(),
    defaultProvider: config.defaultProvider,
    defaultModel: config.defaultProvider === 'openai' ? config.openaiModel : config.anthropicModel,
  });
});

/** Who am I — used by the frontend to confirm backend authorization. */
app.get('/api/me', requireAuth, (req: express.Request & { user?: AuthedUser }, res) => {
  res.json(req.user);
});

/** Streaming chat (NDJSON): the Anthropic tool loop over the MCP catalogue. */
app.post('/api/chat', requireAuth, chatHandler);

/**
 * Connect to the eea-geonetwork MCP server and list its tools, tagging each
 * read/write. Graceful degradation — never 500s just because MCP is unreachable.
 */
app.get('/api/mcp-tools', requireAuth, async (_req, res) => {
  if (!config.mcpUrl) {
    return res.json({ connected: false, reason: 'GEOCAT_MCP_URL not configured' });
  }
  try {
    const mcp = await McpSession.connect(config.mcpUrl, config.mcpAuth || undefined);
    const tools = await mcp.listTools();
    res.json({
      connected: true,
      url: config.mcpUrl,
      count: tools.length,
      readCount: tools.filter((t) => !isWriteTool(t.name)).length,
      writeCount: tools.filter((t) => isWriteTool(t.name)).length,
      tools: tools.map((t) => ({
        name: t.name,
        write: isWriteTool(t.name),
        description: t.description,
      })),
    });
  } catch (e) {
    res.json({
      connected: false,
      url: config.mcpUrl,
      error: e instanceof Error ? e.message : String(e),
    });
  }
});

type AuthedRequest = express.Request & { user?: AuthedUser };

/** User-defined skills (dev-plan/skills-architecture.md) — scoped to the caller. */
app.get('/api/skills', requireAuth, (req: AuthedRequest, res) => {
  res.json({ skills: listSkills(req.user!.uid) });
});

app.post('/api/skills', requireAuth, (req: AuthedRequest, res) => {
  try {
    res.status(201).json(createSkill(req.user!.uid, req.body ?? {}));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.put('/api/skills/:id', requireAuth, (req: AuthedRequest, res) => {
  try {
    const skill = updateSkill(req.user!.uid, String(req.params.id), req.body ?? {});
    if (!skill) return res.status(404).json({ error: 'Skill not found.' });
    res.json(skill);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : String(e) });
  }
});

app.delete('/api/skills/:id', requireAuth, (req: AuthedRequest, res) => {
  const ok = deleteSkill(req.user!.uid, String(req.params.id));
  if (!ok) return res.status(404).json({ error: 'Skill not found.' });
  res.status(204).end();
});

// In production the built frontend is served from the same origin (Docker copies
// it to ./public). In dev, Vite serves the UI and proxies /api here, so this is skipped.
const publicDir = process.env.PUBLIC_DIR ?? join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
if (existsSync(publicDir)) {
  app.use(express.static(publicDir));
  // SPA fallback: any non-/api GET returns index.html.
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api/')) {
      res.sendFile(join(publicDir, 'index.html'));
    } else {
      next();
    }
  });
}

app.listen(config.port, () => {
  console.log(`[geocat] backend on http://localhost:${config.port}`);
  console.log(`[geocat] MCP → ${config.mcpUrl}`);
  if (existsSync(publicDir)) console.log(`[geocat] serving frontend from ${publicDir}`);
  warnIfOpen();
});
