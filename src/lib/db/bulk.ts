import type { PropertyValue } from '../schema';
import { db, nowIso, parseJson } from './index';

export interface BulkRow {
  id: string;
  type_id: string;
  properties: Record<string, PropertyValue>;
}

/** The live objects among `ids` that belong to workspace `ws` (anything else is ignored). */
export async function objectsInWorkspace(ws: string, ids: string[]): Promise<BulkRow[]> {
  const uniq = [...new Set(ids)].slice(0, 500);
  if (!uniq.length) return [];
  const { results } = await db()
    .prepare(`SELECT id, type_id, properties FROM objects
              WHERE workspace_id = ? AND deleted_at IS NULL AND id IN (${uniq.map(() => '?').join(',')})`)
    .bind(ws, ...uniq)
    .all<{ id: string; type_id: string; properties: string }>();
  return results.map((r) => ({ ...r, properties: parseJson(r.properties, {}) }));
}

/** Sets one property on many objects in a single statement. */
export async function bulkSetProperty(ids: string[], key: string, value: PropertyValue): Promise<void> {
  if (!ids.length) return;
  await db()
    .prepare(`UPDATE objects SET properties = json_set(properties, ?, json(?)), updated_at = ?
              WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`)
    .bind(`$."${key}"`, JSON.stringify(value), nowIso(), ...ids)
    .run();
}

/** Adds a value to a list property (multi-select) on each object, keeping what's there. */
export async function bulkAddListValue(rows: BulkRow[], key: string, value: string): Promise<void> {
  if (!rows.length) return;
  const d = db();
  const now = nowIso();
  await d.batch(
    rows.map((r) => {
      const cur = r.properties[key];
      const list = Array.isArray(cur) ? cur : typeof cur === 'string' && cur ? [cur] : [];
      const next = list.includes(value) ? list : [...list, value];
      return d.prepare('UPDATE objects SET properties = json_set(properties, ?, json(?)), updated_at = ? WHERE id = ?').bind(`$."${key}"`, JSON.stringify(next), now, r.id);
    }),
  );
}

/** Moves many objects to the trash in one batch (soft delete). */
export async function bulkTrash(ids: string[]): Promise<void> {
  if (!ids.length) return;
  const now = nowIso();
  await db()
    .prepare(`UPDATE objects SET deleted_at = ?, updated_at = ? WHERE deleted_at IS NULL AND id IN (${ids.map(() => '?').join(',')})`)
    .bind(now, now, ...ids)
    .run();
}

/** Tags many objects (tag-picker links) in one batch; same-workspace rule as addTag. */
export async function bulkAddTag(ids: string[], tagId: string): Promise<void> {
  const d = db();
  const now = nowIso();
  const stmts = ids.filter((id) => id !== tagId).map((id) =>
    d.prepare(`INSERT OR IGNORE INTO links (source_id, target_id, origin, created_at)
               SELECT ?, id, 'tag', ? FROM objects WHERE id = ? AND type_id = 'type_tag' AND deleted_at IS NULL
                 AND workspace_id = (SELECT workspace_id FROM objects WHERE id = ?)`).bind(id, now, tagId, id),
  );
  if (stmts.length) await d.batch(stmts);
}
