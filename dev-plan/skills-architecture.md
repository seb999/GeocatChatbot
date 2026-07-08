# Feature: user-defined skills — Architecture

Lets a user, mid-conversation, tell the assistant "remember this as a way to do
X" — capturing a reusable instruction (a "skill") that gets pulled back into
context on future turns where it's relevant. This is a chatbot-side feature;
it has nothing to do with the MCP protocol (which has no "skills" primitive —
only `tools`, `resources`, `prompts`, and the `eea-geonetwork` server only
implements `tools`). It borrows the *shape* of Claude Code's `SKILL.md`
(name + description always visible, full body loaded on demand) but is
implemented entirely in this repo.

Builds on [geocat-chatbot-dev-plan.md](./geocat-chatbot-dev-plan.md) — same
backend, same chat loop (`backend/src/chat.ts`), same auth (`backend/src/auth.ts`).

---

## 1. Goal & scope

- A user, while chatting, can turn a good exchange into a durable skill:
  "that worked — save it" → assistant proposes a name/description/instructions,
  user confirms, it's stored.
- On future turns, the backend picks relevant skills (by name+description,
  cheaply) and injects their full body into context — the same
  progressive-disclosure idea as Claude Code skills, reimplemented locally
  since there's no MCP primitive for it.
- Skills are **scoped to the creating user by default**. Nothing is shared
  globally in v1 (see §5).

Non-goals (initially): a skills marketplace/sharing UI, versioning/rollback,
auto-editing existing skills, skill-to-skill composition.

---

## 2. Storage

**SQLite**, via `better-sqlite3` (sync, no extra process, fits the existing
single-container Node backend).

```sql
CREATE TABLE skills (
  id          TEXT PRIMARY KEY,       -- uuid
  owner_uid   TEXT NOT NULL,          -- Firebase uid (req.user.uid)
  name        TEXT NOT NULL,          -- short slug, shown to the LLM always
  description TEXT NOT NULL,          -- one line, shown to the LLM always
  body        TEXT NOT NULL,          -- full instructions, loaded on demand
  source      TEXT NOT NULL,          -- 'user' | 'assistant-proposed'
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX idx_skills_owner ON skills(owner_uid);
```

### 2.1 Persistence — deployment prerequisite

The current [Dockerfile](../Dockerfile) builds a single stateless image with
**no volume declared**. A SQLite file written inside the container is lost on
every redeploy. Before this ships, the deployment target needs a persistent
volume mounted at, say, `/data`, and `SKILLS_DB_PATH=/data/skills.db` — this
depends on where the app actually runs (VM/docker-compose with a bind mount
works; a serverless/managed container platform without volume support does
not, and would need a real DB service instead). **Confirm the hosting
platform before building this** (open question, §7).

SQLite's single-writer model is fine here: one backend process, low write
volume (skill creation is a rare, human-paced action, not a hot path).

---

## 3. Flow

```
┌────────────┐  "save this as a skill"   ┌──────────────────┐
│  ChatPanel │ ─────────────────────────▶│  Node backend     │
│  (React)   │                           │                    │
│            │◀───── confirm card ───────│  propose name/    │
│            │   (name, description,     │  description/body │
│            │    editable body)         │  from recent turns │
│            │                           │                    │
│            │──── approve/edit ────────▶│  INSERT INTO skills│
└────────────┘                           └──────────┬─────────┘
                                                     │
                     every /api/chat request         ▼
              ┌──────────────────────────────────────────────┐
              │ 1. SELECT id,name,description FROM skills     │
              │    WHERE owner_uid = req.user.uid             │
              │ 2. append catalogue (name+description only)   │
              │    to SYSTEM_PROMPT                           │
              │ 3. expose a `load_skill(name)` tool that       │
              │    returns `body` — model calls it when a     │
              │    listed skill looks relevant                │
              └──────────────────────────────────────────────┘
```

### 3.1 UI affordance

Frontend already has the right visual vocabulary in `frontend/src/App.tsx`:
tool calls render as a collapsible `ToolRow` inside the assistant's `Bubble`,
and small pill indicators use the `Badge` component (`var(--clr-border)` /
`var(--clr-surface)`, 11px text, rounded-full). A "Save as skill" affordance
should reuse that, not invent a new visual language:

- A small pill button — `💾 Save as skill` — appended after `toolCalls` in
  `Bubble` (same spot `notices` render today), shown on **every completed
  assistant turn** that included at least one tool call. Low-key, same
  size/weight as `Badge`, not a prominent CTA.
- Click → opens a small inline card (same pattern as `ConfirmCard`/
  `InsertCoinCard`, i.e. no modal/dialog primitive to add) with editable
  `name`, `description`, and a `body` textarea pre-filled by the backend from
  the last user request + tool calls + final answer. Approve → `POST
  /api/skills`; Cancel → dismiss, nothing stored.
- Purely a frontend nicety — no new NDJSON event needed. The button reads
  from the `Message` already in state (`msg.content`, `msg.toolCalls`); the
  "propose name/description/body" step can initially just be a client-side
  template (e.g. name = first few words of the user's request) rather than a
  separate backend LLM call, and refined later.

### 3.2 Skills panel (list / edit / delete)

A persistent right-side panel listing the user's saved skills as cards, so
"you can save a skill" is discoverable even without triggering §3.1's inline
button.

- **Layout:** `App.tsx` today is a single centered column
  (`maxWidth: 760, margin: '0 auto'`). This adds a second column — chat stays
  as-is, a fixed-width sidebar (~260–300px) sits to its right, visible above
  some breakpoint and collapsible/hidden on narrow viewports (it's a
  nice-to-have, not core chat function).
- **Card:** same visual language as `ToolRow` — bordered `var(--clr-surface)`
  block, `name` bold, `description` muted underneath, `✎` (edit) and `🗑`
  (delete) icon-buttons in the corner. No expand/collapse needed here (unlike
  `ToolRow`, the body isn't meant to be read casually — it's LLM instructions).
- **Edit:** reuses the exact same inline card component as the "Save as
  skill" flow (§3.1) — the same name/description/body form, just pre-filled
  and calling `PUT/PATCH /api/skills/:id` instead of `POST`. One form
  component, two entry points.
- **Delete:** icon click → `window.confirm` (same pattern already used for
  provider-switch, `App.tsx:325`) → `DELETE /api/skills/:id` → remove from
  local state.
- **Data:** `GET /api/skills` on mount (alongside the existing
  `/api/mcp-tools` and `/api/models` calls in the startup `useEffect`,
  `App.tsx:294`), and re-fetched (or optimistically patched) after any
  create/edit/delete.

This subsumes the "Settings-panel list/delete UI" line in the roadmap below —
it's a standing sidebar, not a separate settings screen.

Two design choices worth calling out:

- **Model pulls the body via a tool call, not the backend pushing it.**
  Mirrors Claude Code's Skill tool: cheap catalogue always in context, full
  body only loaded when the model decides it's relevant. Avoids building a
  separate matching/routing step, and reuses the existing tool-loop machinery
  in `chat.ts` — `load_skill` is just another local tool alongside the MCP
  ones, dispatched before `callTool()` forwards to MCP.
- **Creation is user-confirmed, not silent.** The assistant can *propose* a
  skill (e.g. after a multi-step exchange it recognizes as reusable), but it
  never writes to `skills` without the confirm card being approved — same
  pattern already used for MCP write-tool gating (§5.1 of the main dev plan).

---

## 4. Backend changes

```
backend/src/skills/
  db.ts       # better-sqlite3 connection + migration (CREATE TABLE IF NOT EXISTS)
  store.ts    # list(uid), create(uid, {name, description, body}), delete(uid, id)
  tool.ts     # exposes load_skill as a local ToolDef + handler
```

- `chat.ts`: after loading MCP tools, append the user's skill catalogue to
  `SYSTEM_PROMPT` (name + description only) and add `load_skill` to `tools`.
  In the tool-execution loop, branch on `u.name === 'load_skill'` before
  calling `callTool(mcp, u)` — same shape as the existing `isWriteTool` branch.
- New REST routes (behind `requireAuth`, so `req.user.uid` is trusted):
  `GET /api/skills`, `POST /api/skills`, `DELETE /api/skills/:id` — for a
  simple settings-panel list/delete UI, independent of the in-chat save flow.

No changes needed to the MCP client or the Anthropic/OpenAI provider
abstraction — skills are a local tool, not an MCP tool.

---

## 5. Security & trust

- **Scoped per-user by default** (`owner_uid` filter on every read). The app
  already gates *access* via Firebase + an allowlist (`auth.ts`), but that
  only says who may use the bot at all — it says nothing about whether one
  allowed user's skill should steer another allowed user's answers. Default
  to isolated; revisit sharing only if there's an actual request for it.
- **Skill bodies are prompt content, not data.** A skill's `body` is loaded
  straight into the model's context as instructions. Treat creation the same
  as any other action that shapes future behavior: confirm-before-write
  (§3), and consider a length cap (e.g. 2000 chars) so one skill can't crowd
  out the real system prompt.
- No new secrets exposure — skills never touch the Anthropic key, MCP auth,
  or Firebase config.

---

## 6. Phased roadmap

| Phase | Deliverable |
|---|---|
| 0 | Confirm hosting platform supports a persistent volume (§2.1) — blocks everything else |
| 1 | `skills` table + `store.ts` CRUD, `GET/POST/DELETE /api/skills` |
| 2 | `load_skill` local tool wired into `chat.ts`; catalogue injected into `SYSTEM_PROMPT` |
| 3 | In-chat "save as skill" confirm card (assistant-proposed or user-typed), §3.1 |
| 4 | Right-side skills panel — list/edit/delete cards, §3.2 |

---

## 7. Open questions

- **Q-1 (hosting):** Where does this actually run (VM/docker-compose vs.
  managed/serverless container)? Decides SQLite+volume vs. a hosted DB.
- **Q-2 (sharing):** Is per-user isolation actually right long-term, or will
  users want to promote a skill to a team-wide catalogue? If so, needs a
  review/approval step, not silent global write.
- **Q-3 (cap):** Max skills per user / max body length, to bound system-prompt
  growth and avoid one user's skill catalogue drowning out the base prompt.
- **Q-4 (staleness):** Skills reference GeoNetwork schema details (XPaths,
  field names) that could drift if the catalogue schema changes — no
  invalidation mechanism in v1; skills are trusted as-authored.
