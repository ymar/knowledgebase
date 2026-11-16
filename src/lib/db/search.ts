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

export interface SearchHit extends ObjectSummary {
  /** Text around the match; matches wrapped in \u0002 ... \u0003. */
  snippet: string;
}

/** FTS5 query: every word must appear, last word as a prefix. Quotes are escaped. */
export function ftsQuery(input: string): string | null {
  const words = input.trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!words.length) return null;
  return words.map((w, i) => `"${w.replace(/"/g, '""')}"${i === words.length - 1 ? '*' : ''}`).join(' ');
}

/** Full-text search over titles and document text. Titles weigh more. */
export async function searchFullText(input: string, limit = 20): Promise<SearchHit[]> {
  const match = ftsQuery(input);
  if (!match) return [];
  const { results } = await db()
    .prepare(
      `SELECT o.id, o.type_id, o.title, o.updated_at,
              t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color,
              snippet(objects_fts, 1, char(2), char(3), '…', 14) AS snippet
       FROM objects_fts
       JOIN objects o ON o.rowid = objects_fts.rowid
       JOIN types t ON t.id = o.type_id
       WHERE objects_fts MATCH ? AND o.deleted_at IS NULL
       ORDER BY bm25(objects_fts, 8.0, 1.0)
       LIMIT ?`,
    )
    .bind(match, limit)
    .all<SearchHit>();
  return results;
}

/**
 * Objects whose text contains `title` as a phrase but that don't link to `targetId`.
 * Returns their content too, so the caller can confirm a linkable plain-text occurrence.
 */
export async function unlinkedCandidates(
  targetId: string,
  title: string,
  limit = 20,
): Promise<(SearchHit & { content: string })[]> {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (title.trim().length < 3 || words.length === 0 || words.length > 8) return [];
  const phrase = `text_content : "${words.join(' ').replace(/"/g, '""')}"`;
  const { results } = await db()
    .prepare(
      `SELECT o.id, o.type_id, o.title, o.updated_at, o.content,
              t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color,
              snippet(objects_fts, 1, char(2), char(3), '…', 14) AS snippet
       FROM objects_fts
       JOIN objects o ON o.rowid = objects_fts.rowid
       JOIN types t ON t.id = o.type_id
       WHERE objects_fts MATCH ? AND o.deleted_at IS NULL AND o.id != ?
         AND NOT EXISTS (SELECT 1 FROM links l WHERE l.source_id = o.id AND l.target_id = ?)
       ORDER BY o.updated_at DESC
       LIMIT ?`,
    )
    .bind(phrase, targetId, targetId, limit)
    .all<SearchHit & { content: string }>();
  return results;
}
