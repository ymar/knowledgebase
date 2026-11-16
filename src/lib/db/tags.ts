import type { ObjectSummary } from '../schema';
import { db, nowIso } from './index';

const SUMMARY = `
  SELECT o.id, o.type_id, o.title, o.updated_at,
         t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color
  FROM objects o JOIN types t ON t.id = o.type_id`;

/** Tags attached with the tag picker (origin 'tag'). Inline #tags live in the document. */
export async function pickedTags(objectId: string): Promise<ObjectSummary[]> {
  const { results } = await db()
    .prepare(
      `${SUMMARY} JOIN links l ON l.target_id = o.id AND l.origin = 'tag'
       WHERE l.source_id = ? AND o.deleted_at IS NULL ORDER BY o.title COLLATE NOCASE`,
    )
    .bind(objectId)
    .all<ObjectSummary>();
  return results;
}

export async function allTags(): Promise<ObjectSummary[]> {
  const { results } = await db()
    .prepare(`${SUMMARY} WHERE o.type_id = 'type_tag' AND o.deleted_at IS NULL ORDER BY o.title COLLATE NOCASE LIMIT 1000`)
    .all<ObjectSummary>();
  return results;
}

export async function addTag(objectId: string, tagId: string): Promise<void> {
  if (objectId === tagId) return;
  await db()
    .prepare(
      `INSERT OR IGNORE INTO links (source_id, target_id, origin, created_at)
       SELECT ?, id, 'tag', ? FROM objects WHERE id = ? AND type_id = 'type_tag' AND deleted_at IS NULL`,
    )
    .bind(objectId, nowIso(), tagId)
    .run();
}

export async function removeTag(objectId: string, tagId: string): Promise<void> {
  await db()
    .prepare("DELETE FROM links WHERE source_id = ? AND target_id = ? AND origin = 'tag'")
    .bind(objectId, tagId)
    .run();
}
