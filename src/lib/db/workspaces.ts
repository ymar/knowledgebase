import { db } from './index';

export interface Workspace {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export async function listWorkspaces(): Promise<Workspace[]> {
  const { results } = await db()
    .prepare('SELECT id, name, color, sort_order FROM workspaces ORDER BY sort_order, name')
    .all<Workspace>();
  return results;
}

export async function createWorkspace(id: string, name: string, color: string): Promise<void> {
  await db()
    .prepare(
      `INSERT INTO workspaces (id, name, color, sort_order, created_at)
       VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM workspaces), ?)`,
    )
    .bind(id, name, color, new Date().toISOString())
    .run();
}

export async function updateWorkspace(id: string, name: string, color: string): Promise<void> {
  await db().prepare('UPDATE workspaces SET name = ?, color = ? WHERE id = ?').bind(name, color, id).run();
}
