# Geocat Chatbot — Development Plan

A **standalone conversational assistant** for the EEA geospatial metadata
catalogue (GeoNetwork / "Geocat"). It answers natural-language questions and
performs cataloguing actions by driving the **`eea-geonetwork` MCP server**
(`http://sdi-mcp.dspx.eu/`) through **Claude (Anthropic API, Opus 4.8)**.

It reuses the interaction patterns proven in the `Moneta/` chatbot (NDJSON
streaming, floating chat widget, MCP-as-graceful-degradation, per-user MCP key)
but is a **new, independent application** — not embedded in a larger product —
and is built as a **TypeScript full-stack app** talking to the **Anthropic
Messages API** instead of OpenAI.

---

## 1. Goal & scope

- A chat UI where a cataloguer or data user can ask things like:
  - *"Find datasets about air quality in Northern Italy updated since 2023."*
  - *"Summarise record `abc-123` and show me its related services."*
  - *"Add the 'Air pollution' tag to these three records."* (write — gated)
- Claude plans the work and calls GeoNetwork tools via MCP; the app streams
  Claude's reasoning/answers and shows which tools ran.
- **Read** operations are open; **write** operations (which the MCP server marks
  *"Requires authentication"*) are gated behind explicit user confirmation and a
  GeoNetwork credential.

Non-goals (initially): building/altering the MCP server, replacing the
GeoNetwork UI, bulk/batch cataloguing pipelines.

---

## 2. What already exists

### 2.1 The Moneta chatbot (reference — read-only, do not modify)

`Moneta/backend/Api/Controllers/ChatController.cs` + `Moneta/frontend/src/components/ChatPanel.tsx`
give us a working template. Patterns to carry over:

| Pattern | Where in Moneta | Reuse |
|---|---|---|
| NDJSON event stream (`tool_call` / `content` / `history` / `error` / `done`) | `ChatController.Post` | Keep the wire protocol; port to Node. |
| Floating chat widget, streaming reader, tool badges, running history | `ChatPanel.tsx` | Port near-verbatim (React → React). |
| MCP over Streamable HTTP (JSON-RPC 2.0) | `Infrastructure/McpClient.cs` | Same transport; reimplement in TS (or use the official MCP SDK). |
| Graceful degradation when MCP is down | `ChatController.Post` | Keep — bot still answers, tools just unavailable. |
| Per-user MCP key via request header (`X-Taskman-Key`) | `ChatController.CreateMcpClient` | Becomes the GeoNetwork auth channel (`X-Geonetwork-Auth` or similar). |

**Key differences from Moneta:** Moneta used the OpenAI Chat Completions shape
(`tool_calls`, one-shot JSON) and had DB-backed built-in tools. Geocat uses the
**Anthropic Messages** shape (`tool_use`/`tool_result` content blocks, SSE
`content_block_delta` streaming) and has **no local DB** — all tools come from
the MCP server.

### 2.2 The Geocat MCP server (exists — consume as-is)

Probed live on 2026-07-07:

- **Endpoint:** `http://sdi-mcp.dspx.eu/` (root path), Express behind nginx.
- **Transport:** MCP **Streamable HTTP**, JSON-RPC 2.0, **stateless** (no
  `Mcp-Session-Id` returned on `initialize`). Requires
  `Accept: application/json, text/event-stream`.
- **Identity:** `serverInfo = { name: "eea-geonetwork", version: "2.0.0" }`,
  capabilities: `tools`.
- **Rate limit:** 100 requests / 900 s window (observed `RateLimit-*` headers).
- **HTTPS:** ✅ valid Let's Encrypt certificate installed (`CN=sdi-mcp.dspx.eu`,
  SAN matches, auto-renewing via Certbot). Use `https://sdi-mcp.dspx.eu/`.

**Tool inventory (~27 tools).** Read-only tools are safe to expose freely; write
tools are marked *"Requires authentication"* by the server and must be gated
(§5.1).

*Read-only:* `search_records`, `search_by_extent`, `get_record`,
`get_record_summary`, `get_record_by_id`, `get_record_formatters`,
`export_record`, `get_related_records`, `get_attachments`, `list_groups`,
`get_sources`, `get_site_info`, `get_tags`, `get_regions`.

*Write (auth required — gate):* `update_record`, `update_record_title`,
`duplicate_record`, `add_record_tags`, `delete_record_tags`, `process_record`,
`delete_attachment`, `upload_file_to_record`, `upload_base64_to_record`,
`upload_url_to_record`, `create_upload_link`.

> Note: `upload_file_to_record` only works in local/stdio deployments; for this
> remote server prefer `upload_url_to_record` / `upload_base64_to_record` /
> `create_upload_link`.

---

## 3. Architecture

**TypeScript full-stack**, two processes in dev, one origin in prod.

```
┌──────────────┐   /api/chat (NDJSON)   ┌────────────────────┐   Messages API   ┌───────────┐
│  React (Vite)│ ─────────────────────▶ │  Node backend      │ ───────────────▶ │ Anthropic │
│  ChatPanel   │ ◀───────────────────── │  (Express/Fastify) │ ◀─────────────── │  Opus 4.8 │
└──────────────┘   stream events        │                    │                  └───────────┘
                                        │   tool loop        │   MCP JSON-RPC / Streamable HTTP
                                        │                    │ ───────────────▶ ┌───────────────────┐
                                        └────────────────────┘                  │ eea-geonetwork MCP│
                                                                                │ sdi-mcp.dspx.eu   │
                                                                                └───────────────────┘
```

- **Backend** (`backend/`): Node + TypeScript. Express or Fastify. Holds the
  Anthropic API key (never shipped to the browser), runs the agentic tool loop,
  owns the MCP session, streams NDJSON to the client.
- **Frontend** (`frontend/`): React + Vite + TypeScript. Ports `ChatPanel.tsx`.
  Talks only to `/api/*` (Vite proxy in dev, same-origin in prod).
- **No database** for v1 — conversation history is round-tripped through the
  client (as Moneta does) or held in server memory keyed by a session id.

### 3.1 Why client-side MCP (not the native connector)

Anthropic's Messages API can connect to a remote MCP server itself
(`mcp_servers` + `mcp_toolset`, beta `mcp-client-2025-11-20`). We **do not** use
that for v1:

| | Client-side MCP (chosen) | Native MCP connector |
|---|---|---|
| Write-tool gating / confirmation | Full control in our loop | Claude calls tools server-side; harder to interpose |
| Per-user GeoNetwork auth | Inject per request | Single `authorization_token` on the server def |
| Works over current `http://` | Yes | **No** — requires valid public HTTPS |
| Audit/log every tool call | Yes | Limited |
| Code volume | More (manual loop) | Less |

We revisit the native connector once HTTPS is fixed and if the write-gating
requirements relax.

---

## 4. Backend design

### 4.1 Anthropic Messages tool loop

Use `@anthropic-ai/sdk`. Model `claude-opus-4-8`, `thinking: {type:"adaptive"}`,
stream so long turns don't hit HTTP timeouts.

```
1. Build messages[] = prior history + new user turn.
2. Load tool catalogue = MCP tools/list mapped to Anthropic tool defs
   (name, description, input_schema ← MCP inputSchema).
3. Loop:
   a. stream client.messages: emit text deltas as {type:"content"} NDJSON.
   b. If stop_reason == "tool_use":
        - for each tool_use block → emit {type:"tool_call", label}
        - if WRITE tool and not confirmed → pause, emit {type:"confirm", ...}
        - else call MCP tools/call, collect tool_result blocks
        - append assistant(content) + user(tool_results), continue loop.
      Else (end_turn): emit {type:"history"} then {type:"done"}, break.
```

This is Moneta's loop, translated from OpenAI's `tool_calls` to Anthropic's
`tool_use`/`tool_result` content-block shape, and from a single JSON response to
SSE deltas.

### 4.2 MCP client

Reimplement `McpClient.cs` in TypeScript (or use `@modelcontextprotocol/sdk`
Streamable HTTP client). Requirements it already needs to satisfy, learned from
the probe:
- Send `Accept: application/json, text/event-stream`; parse SSE-framed `data:`
  or plain JSON responses.
- Handle the stateless server (no session id) — but still capture
  `Mcp-Session-Id` if a future version sends one.
- `initialize` → `notifications/initialized` → `tools/list` → `tools/call`.
- Graceful failure: if the server is unreachable, the chat still runs with an
  empty tool set and a "catalogue tools unavailable" note.
- Respect the 100/900s rate limit (backoff on 429).

### 4.3 System prompt (first draft)

> You are the assistant for the EEA geospatial metadata catalogue (GeoNetwork).
> You help users **find, summarise, and maintain** metadata records via catalogue
> tools. Prefer `get_record_summary` over `get_record` unless full detail is
> asked for. Never invent records or UUIDs — search or fetch first. For any tool
> that modifies the catalogue, state exactly what will change and wait for the
> user's confirmation. Show titles, UUIDs, and extents clearly; keep answers
> concise.

---

## 5. Security

### 5.1 Write-tool gating (the central safety requirement)

The MCP server exposes destructive/mutating tools. The backend maintains an
allow/confirm classification:

- **Read tools** → run automatically.
- **Write tools** (`update_record*`, `duplicate_record`, `*_tags`,
  `process_record`, `delete_attachment`, `upload_*`, `create_upload_link`) →
  the loop **pauses** and emits a `confirm` event describing the exact call;
  the tool runs only after the user approves in the UI.

This is why we chose client-side MCP — the confirmation gate lives in our loop.

### 5.2 GeoNetwork authentication — Q-3 resolved

Probed 2026-07-07: a `update_record_title` call with a bogus UUID returned
`success: true` **with no credential passed**. So **(a) is the answer** — the MCP
server holds its own GeoNetwork service account server-side; the chatbot does not
need to pass per-user credentials. Our confirm-gate (§5.1) is therefore the
primary control over writes.

> **Note (MCP server, not the chatbot):** writes need no auth, so
> `https://sdi-mcp.dspx.eu/` accepts modifications from any caller. **This is
> acceptable for now — the server targets a sandbox GeoNetwork, not production.**
> Caveats: sandbox contents aren't guaranteed stable (anyone can write to it);
> and **before this is ever pointed at a production catalogue, the write surface
> must be locked down** (network/IP allowlist, gateway, or a bearer token passed
> via `GEOCAT_MCP_AUTH`) — the chatbot's confirm-gate only guards *our* client,
> not other callers.

### 5.3 Transport (HTTPS) — ✅ done

- Valid Let's Encrypt certificate installed for `sdi-mcp.dspx.eu` (Certbot +
  nginx plugin, auto-renewing). Backend targets `https://sdi-mcp.dspx.eu/`.
- Auth tokens for write tools no longer cross the public internet in plaintext.
- HTTPS being valid also **unblocks the native MCP connector** as a future
  option (see §3.1 / Q-1).

### 5.4 Key handling

Anthropic API key lives only in the backend env. Frontend never sees it.

---

## 6. Frontend

Port `Moneta/frontend/src/components/ChatPanel.tsx`:
- Floating launcher button + slide-in panel.
- Streaming NDJSON reader, `content` deltas appended live, tool badges from
  `tool_call` events, markdown/code-block rendering.
- **New:** a `confirm` event renders an inline Approve/Reject card for write
  tools before they run.
- Header: "Geocat Assistant — search & maintain catalogue records".
- Settings: GeoNetwork auth entry (if per-user auth is chosen, Q-3).

---

## 7. Phased roadmap

| Phase | Deliverable | Notes |
|---|---|---|
| **0 — Scaffold** ✅ | `backend/` (Node+TS+Express) and `frontend/` (Vite+React+TS); `/api/health`; env wiring; both build clean | Done 2026-07-07. |
| **1 — MCP client** ✅ | TS Streamable-HTTP MCP client; `GET /api/mcp-tools` lists **25 tools (14 read / 11 write)** with read/write tagging; frontend dashboard renders them via the `/api` proxy | Verified live against `https://sdi-mcp.dspx.eu/`. |
| **2 — Read-only chat** ✅ (built) | `POST /api/chat` streaming Anthropic tool loop (`tool_use`/`tool_result` → NDJSON), read-only tools only; full-page chat UI with streamed text + tool badges + history round-trip | Built & typechecks. **Live run needs `ANTHROPIC_API_KEY` in `backend/.env`.** Writes still excluded. |
| **3 — Write gating** ✅ (built) | Confirm-before-write flow (resume-capable loop pauses on write tools → `confirm` event → Approve/Reject card → resume); write tools exposed; `audit.log` of executed/declined writes | Reject path verified live (no mutation). Q-3 resolved (§5.2). |
| **4 — Hardening** | HTTPS to MCP, rate-limit backoff, error UX, prompt tuning, Docker/compose, deploy | Optional: evaluate native MCP connector once HTTPS is valid. |

---

## 8. Open questions

- **Q-1 (MCP mode):** Confirm client-side MCP for v1 (recommended). Revisit
  native connector after HTTPS is valid?
- **Q-2 (HTTPS):** ✅ Resolved — valid Let's Encrypt cert installed, auto-renewing.
- **Q-3 (GeoNetwork auth):** ✅ Resolved — MCP server uses its own service account
  (no per-user credential needed) against a **sandbox** GeoNetwork. Unauthenticated
  writes are acceptable while it's a sandbox; **must be locked down before any
  production target** (§5.2).
- **Q-4 (write scope):** Which write tools are actually in scope for v1? Could
  start read-only and add writes selectively.
- **Q-5 (identity/access):** Who can use the chatbot? Any SSO/authorization in
  front of it, or internal-network only?
- **Q-6 (history/persistence):** Client-round-tripped history (stateless server)
  vs. server-side session store — any need to persist conversations?
- **Q-7 (multi-portal):** `get_sources` implies sub-portals — should search be
  scoped to a specific portal/bucket by default?

---

## 9. Environment variables

```
# backend/.env (gitignored)
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-4-8
GEOCAT_MCP_URL=https://sdi-mcp.dspx.eu/
GEOCAT_MCP_AUTH=                           # if MCP server needs a bearer/token
PORT=8080
```

---

## 10. Suggested repository layout

```
GeocatChatbot/
  backend/        Node + TypeScript (Express/Fastify), Anthropic loop, MCP client
  frontend/       React + Vite + TypeScript, ChatPanel
  dev-plan/       this document + open questions
  Moneta/         reference app (read-only, do not modify)
  docker-compose.yml
```
