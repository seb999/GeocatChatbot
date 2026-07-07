# Geocat Chatbot

Standalone conversational assistant for the EEA geospatial metadata catalogue
(GeoNetwork). It answers natural-language questions and performs cataloguing
actions by driving the **`eea-geonetwork` MCP server**
(`https://sdi-mcp.dspx.eu/`) through **Claude (Anthropic API)**.

See [dev-plan/geocat-chatbot-dev-plan.md](dev-plan/geocat-chatbot-dev-plan.md)
for the full plan, architecture, and roadmap.

## Repository layout

```
backend/     Node + TypeScript (Express) — Anthropic loop, MCP client
frontend/    React + Vite + TypeScript — chat UI
dev-plan/    Planning documents
Moneta/      Reference app (read-only, do not modify)
```

## Status

- **Phase 0–3 built:** scaffold ✅, MCP client ✅, chat ✅, **confirm-gated writes ✅**.
- **Access control ✅:** Firebase login (Google + email) + backend email allowlist.
- To run: put your `ANTHROPIC_API_KEY` in `backend/.env`, press **F5**, open http://localhost:5173.
- Catalogue **edits are gated** — the assistant pauses and shows an Approve/Reject card before any write runs; executed/declined writes are recorded in `backend/audit.log`.

> **Note:** the MCP server allows unauthenticated writes, but it targets a **sandbox** GeoNetwork, so this is fine for now. Before pointing it at a production catalogue, lock the write surface down (network allowlist / gateway / bearer token). See dev-plan §5.2.

## Dev commands

### Backend (Express, port 8080)

```bash
cd backend
cp .env.example .env     # set ANTHROPIC_API_KEY for Phase 2
npm install
npm run dev              # http://localhost:8080
npm run typecheck
npm run build            # → dist/
```

Endpoints:
- `GET /api/health` — liveness + config summary
- `GET /api/mcp-tools` — connect to the MCP server and list its tools (read/write tagged)

### Frontend (Vite, port 5173, proxies `/api` → backend)

```bash
cd frontend
npm install
npm run dev              # http://localhost:5173
npm run build
```

Run both (two terminals) and open http://localhost:5173 to see the MCP tool
inventory dashboard.

## Access control (Firebase Auth)

Sign-in is required. The frontend uses Firebase Auth (Google + email/password);
the backend verifies the Firebase ID token on every protected route (`/api/chat`,
`/api/mcp-tools`, `/api/me`) and checks the user's email against an **allowlist**
before serving. `/api/health` stays public.

- **Who's allowed** — by default the backend **trusts Firebase**: any user
  Firebase authenticates can use the app, so you manage access in the Firebase
  console (disable sign-up + add users). Optionally set `ALLOWED_EMAILS`
  (comma-separated) and/or `ALLOWED_DOMAINS` in `backend/.env` to enforce an
  extra allowlist in the backend on top of Firebase.
- **No service-account key needed** — tokens are verified against Google's public
  keys (`jose`) using `FIREBASE_PROJECT_ID`.
- **Blocking new accounts:** the allowlist already stops non-approved users (they
  authenticate but get 403). To also stop Firebase from *creating* accounts:
  Firebase Console → Authentication → Settings → **User actions** → uncheck
  *"Enable create (sign-up)"* (Identity Platform) and pre-create allowed users
  under Authentication → Users. Google sign-in can't be blocked at the provider
  level — the allowlist is the guard there (or add a `beforeCreate` blocking
  function). The app UI intentionally offers **sign-in only**, no self sign-up.
- **Console checklist:** enable Google + Email/Password providers; add your
  dev/prod domains under Auth → Settings → **Authorized domains** (`localhost` is
  there by default).

## Environment variables

```
# backend/.env
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-sonnet-5           # or claude-opus-4-8
GEOCAT_MCP_URL=https://sdi-mcp.dspx.eu/
GEOCAT_MCP_AUTH=                          # optional, if the MCP server needs a token
FIREBASE_PROJECT_ID=sdimcpchatbot
ALLOWED_EMAILS=                           # empty = trust Firebase; else comma-separated allowlist
ALLOWED_DOMAINS=                          # optional, e.g. eea.europa.eu
PORT=8080

# frontend/.env  (Web-app config from Firebase console; apiKey is public)
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=sdimcpchatbot.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=sdimcpchatbot
VITE_FIREBASE_STORAGE_BUCKET=sdimcpchatbot.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=60946029398
VITE_FIREBASE_APP_ID=...
```
