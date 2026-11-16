import { db } from './index';
import { freeSlug } from './types';
import { DEFAULT_TYPES } from '../default-types';
import { slugify } from '../type-form';

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

/** Creates a workspace and, in the same batch, its own copies of the starter types. */
export async function createWorkspace(id: string, name: string, color: string): Promise<void> {
  const d = db();
  const suffix = slugify(name) || 'space';
  const typeRows = await Promise.all(
    DEFAULT_TYPES.map(async (t) => ({ ...t, slug: await freeSlug(`${t.slug}-${suffix}`) })),
  );
  await d.batch([
    d
      .prepare(
        `INSERT INTO workspaces (id, name, color, sort_order, created_at)
         VALUES (?, ?, ?, (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM workspaces), ?)`,
      )
      .bind(id, name, color, new Date().toISOString()),
    ...typeRows.map((t) =>
      d
        .prepare(
          `INSERT INTO types (id, workspace_id, name, slug, icon, color, properties, sort_order, template, enabled, day_key)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '[]', 1, ?)`,
        )
        .bind(`${t.id}__${id}`, id, t.name, t.slug, t.icon, t.color, JSON.stringify(t.properties), t.sort, t.dayKey ?? null),
    ),
  ]);
}

export async function updateWorkspace(id: string, name: string, color: string): Promise<void> {
  await db().prepare('UPDATE workspaces SET name = ?, color = ? WHERE id = ?').bind(name, color, id).run();
}
