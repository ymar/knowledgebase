import type { ObjectSummary } from '../schema';
import { db } from './index';

export interface TrashedObject extends ObjectSummary {
  deleted_at: string;
}

export async function listTrash(ws: string): Promise<TrashedObject[]> {
  const { results } = await db()
    .prepare(
      `SELECT o.id, o.type_id, o.title, o.updated_at, o.deleted_at,
              t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color
       FROM objects o JOIN types t ON t.id = o.type_id
       WHERE o.workspace_id = ? AND o.deleted_at IS NOT NULL
       ORDER BY o.deleted_at DESC LIMIT 500`,
    )
    .bind(ws)
    .all<TrashedObject>();
  return results;
}

/**
 * Restores a trashed object. Its own outgoing links were never removed, so
 * backlinks come back with it. Fails for a day whose date has a live note again.
 */
export async function restoreObject(id: string): Promise<'ok' | 'day-exists' | 'missing'> {
  const row = await db()
    .prepare('SELECT type_id, title, workspace_id FROM objects WHERE id = ? AND deleted_at IS NOT NULL')
    .bind(id)
    .first<{ type_id: string; title: string; workspace_id: string }>();
  if (!row) return 'missing';
  if (row.type_id === 'type_day') {
    const live = await db()
      .prepare("SELECT 1 FROM objects WHERE workspace_id = ? AND type_id = 'type_day' AND title = ? AND deleted_at IS NULL")
      .bind(row.workspace_id, row.title)
      .first();
    if (live) return 'day-exists';
  }
  await db().prepare('UPDATE objects SET deleted_at = NULL WHERE id = ?').bind(id).run();
  return 'ok';
}

/** Permanently removes a trashed object and every link to or from it. The only hard delete in the app. */
export async function purgeObject(id: string): Promise<void> {
  const d = db();
  await d.batch([
    d.prepare('DELETE FROM links WHERE (source_id = ?1 OR target_id = ?1) AND EXISTS (SELECT 1 FROM objects WHERE id = ?1 AND deleted_at IS NOT NULL)').bind(id),
    d.prepare('DELETE FROM objects WHERE id = ? AND deleted_at IS NOT NULL').bind(id),
  ]);
}
