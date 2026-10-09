import { db } from './db.js';

export interface Prompt {
  id: number;
  userEmail: string;
  message: string;
  provider: string;
  model: string;
  reply: string;
  toolsUsed: string[];
  createdAt: string;
}

interface Row {
  id: number;
  user_email: string;
  user_uid: string;
  message: string;
  provider: string;
  model: string;
  reply: string;
  tools_used: string;
  created_at: string;
}

function toPrompt(r: Row): Prompt {
  let toolsUsed: string[] = [];
  try { toolsUsed = JSON.parse(r.tools_used); } catch { /* keep empty */ }
  return { id: r.id, userEmail: r.user_email, message: r.message, provider: r.provider, model: r.model, reply: r.reply, toolsUsed, createdAt: r.created_at };
}

export function logPrompt(userUid: string, userEmail: string, message: string, provider: string, model: string): number {
  const result = db.prepare(
    'INSERT INTO prompts (user_uid, user_email, message, provider, model, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(userUid, userEmail, message, provider, model, new Date().toISOString());
  return Number(result.lastInsertRowid);
}

export function updatePromptResult(id: number, reply: string, toolsUsed: string[]): void {
  db.prepare('UPDATE prompts SET reply = ?, tools_used = ? WHERE id = ?')
    .run(reply, JSON.stringify(toolsUsed), id);
}

export function listPrompts(limit = 100, offset = 0): { prompts: Prompt[]; total: number } {
  const total = (db.prepare('SELECT COUNT(*) as cnt FROM prompts').get() as { cnt: number }).cnt;
  const rows = db
    .prepare('SELECT * FROM prompts ORDER BY created_at DESC LIMIT ? OFFSET ?')
    .all(limit, offset) as Row[];
  return { prompts: rows.map(toPrompt), total };
}
