import type { ObjectSummary } from '../schema';
import { db } from './index';

const SUMMARY = `
  SELECT o.id, o.type_id, o.title, o.updated_at,
         t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color
  FROM objects o JOIN types t ON t.id = o.type_id`;

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Title search for the mention menus. Prefix matches rank first, then
 * substring matches, then most recently edited. Empty query = recent objects.
 */
export async function searchTitles(query: string, opts: { typeId?: string; limit?: number } = {}): Promise<ObjectSummary[]> {
  const q = query.trim();
  const limit = opts.limit ?? 8;
  const typeFilter = opts.typeId ? 'AND o.type_id = ?' : '';
  const typeArgs = opts.typeId ? [opts.typeId] : [];
  if (!q) {
    const { results } = await db()
      .prepare(`${SUMMARY} WHERE o.deleted_at IS NULL ${typeFilter} ORDER BY o.updated_at DESC LIMIT ?`)
      .bind(...typeArgs, limit)
      .all<ObjectSummary>();
    return results;
  }
  const like = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  const { results } = await db()
    .prepare(
      `${SUMMARY}
       WHERE o.deleted_at IS NULL ${typeFilter} AND o.title LIKE ? ESCAPE '\\'
       ORDER BY (o.title LIKE ? ESCAPE '\\') DESC, o.updated_at DESC
       LIMIT ?`,
    )
    .bind(...typeArgs, like, prefix, limit)
    .all<ObjectSummary>();
  return results;
}

/** Exact, case-insensitive title match within a type (used to avoid duplicate tags). */
export async function findByTitle(typeId: string, title: string): Promise<string | null> {
  const r = await db()
    .prepare('SELECT id FROM objects WHERE type_id = ? AND deleted_at IS NULL AND title = ? COLLATE NOCASE LIMIT 1')
    .bind(typeId, title.trim())
    .first<{ id: string }>();
  return r?.id ?? null;
}
