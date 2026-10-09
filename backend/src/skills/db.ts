import Database from 'better-sqlite3';
import { config } from '../config.js';

const db = new Database(config.skillsDbPath);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS skills (
    id          TEXT PRIMARY KEY,
    owner_uid   TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL,
    body        TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_skills_owner ON skills(owner_uid);

  CREATE TABLE IF NOT EXISTS prompts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_email  TEXT NOT NULL,
    user_uid    TEXT NOT NULL,
    message     TEXT NOT NULL,
    provider    TEXT NOT NULL,
    model       TEXT NOT NULL,
    reply       TEXT NOT NULL DEFAULT '',
    tools_used  TEXT NOT NULL DEFAULT '[]',
    created_at  TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_prompts_created ON prompts(created_at);
`);

// Migrate: add reply and tools_used columns if missing (existing DBs).
const cols = db.pragma('table_info(prompts)') as { name: string }[];
const colNames = new Set(cols.map((c) => c.name));
if (!colNames.has('reply')) db.exec("ALTER TABLE prompts ADD COLUMN reply TEXT NOT NULL DEFAULT ''");
if (!colNames.has('tools_used')) db.exec("ALTER TABLE prompts ADD COLUMN tools_used TEXT NOT NULL DEFAULT '[]'");

export { db };
