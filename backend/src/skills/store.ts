import { randomUUID } from 'node:crypto';
import { db } from './db.js';

export interface Skill {
  id: string;
  name: string;
  description: string;
  body: string;
  createdAt: string;
  updatedAt: string;
}

export interface SkillInput {
  name: string;
  description: string;
  body: string;
}

const MAX_NAME = 80;
const MAX_DESCRIPTION = 200;
const MAX_BODY = 2000;

interface Row {
  id: string;
  owner_uid: string;
  name: string;
  description: string;
  body: string;
  created_at: string;
  updated_at: string;
}

function toSkill(r: Row): Skill {
  return { id: r.id, name: r.name, description: r.description, body: r.body, createdAt: r.created_at, updatedAt: r.updated_at };
}

/** Trims and caps free-text fields; throws if anything required is empty. */
function sanitize(input: SkillInput): SkillInput {
  const name = input.name?.trim().slice(0, MAX_NAME) ?? '';
  const description = input.description?.trim().slice(0, MAX_DESCRIPTION) ?? '';
  const body = input.body?.trim().slice(0, MAX_BODY) ?? '';
  if (!name || !description || !body) throw new Error('name, description and body are all required.');
  return { name, description, body };
}

export function listSkills(ownerUid: string): Skill[] {
  const rows = db
    .prepare('SELECT * FROM skills WHERE owner_uid = ? ORDER BY updated_at DESC')
    .all(ownerUid) as Row[];
  return rows.map(toSkill);
}

/** name + description only — what goes into the system prompt catalogue. */
export function listCatalog(ownerUid: string): Pick<Skill, 'name' | 'description'>[] {
  return (
    db.prepare('SELECT name, description FROM skills WHERE owner_uid = ? ORDER BY updated_at DESC').all(ownerUid) as Pick<
      Skill,
      'name' | 'description'
    >[]
  );
}

/** Full body for a named skill, for the load_skill tool. */
export function getBodyByName(ownerUid: string, name: string): string | undefined {
  const row = db
    .prepare('SELECT body FROM skills WHERE owner_uid = ? AND name = ?')
    .get(ownerUid, name) as { body: string } | undefined;
  return row?.body;
}

export function createSkill(ownerUid: string, input: SkillInput): Skill {
  const clean = sanitize(input);
  const now = new Date().toISOString();
  const id = randomUUID();
  db.prepare(
    'INSERT INTO skills (id, owner_uid, name, description, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, ownerUid, clean.name, clean.description, clean.body, now, now);
  return { id, ...clean, createdAt: now, updatedAt: now };
}

export function updateSkill(ownerUid: string, id: string, input: SkillInput): Skill | undefined {
  const clean = sanitize(input);
  const now = new Date().toISOString();
  const result = db
    .prepare('UPDATE skills SET name = ?, description = ?, body = ?, updated_at = ? WHERE id = ? AND owner_uid = ?')
    .run(clean.name, clean.description, clean.body, now, id, ownerUid);
  if (result.changes === 0) return undefined;
  const row = db.prepare('SELECT * FROM skills WHERE id = ?').get(id) as Row;
  return toSkill(row);
}

export function deleteSkill(ownerUid: string, id: string): boolean {
  const result = db.prepare('DELETE FROM skills WHERE id = ? AND owner_uid = ?').run(id, ownerUid);
  return result.changes > 0;
}
