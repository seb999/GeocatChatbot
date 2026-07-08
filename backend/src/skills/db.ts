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
`);

export { db };
