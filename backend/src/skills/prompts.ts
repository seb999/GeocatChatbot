import { db } from './db.js';

export interface Prompt {
  id: number;
  userEmail: string;
  message: string;
  provider: string;
  model: string;
  createdAt: string;
}

interface Row {
  id: number;
  user_email: string;
  user_uid: string;
  message: string;
  provider: string;
  model: string;
  created_at: string;
}

function toPrompt(r: Row): Prompt {
  return { id: r.id, userEmail: r.user_email, message: r.message, provider: r.provider, model: r.model, createdAt: r.created_at };
}

export function logPrompt(userUid: string, userEmail: string, message: string, provider: string, model: string): void {
  db.prepare(
    'INSERT INTO prompts (user_uid, user_email, message, provider, model, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(userUid, userEmail, message, provider, model, new Date().toISOString());
}

export function listPrompts(limit = 100, offset = 0): { prompts: Prompt[]; total: number } {
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM prompts').get() as { cnt: number }).cnt;
  const rows = db
    .prepare('SELECT * FROM prompts ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as Row[];
  return { prompts: rows.map(toPrompt), total };
}
