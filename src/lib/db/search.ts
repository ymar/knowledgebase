import type { ObjectSummary } from '../schema';
import { db } from './index';

const SUMMARY = `
  SELECT o.id, o.type_id, o.title, o.updated_at, json_extract(o.properties, '$._icon') AS icon, o.aliases,
         t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color
  FROM objects o JOIN types t ON t.id = o.type_id`;

/** Aliases are stored one per line. */
export const splitAliases = (s: string | null | undefined): string[] =>
  (s ?? '').split('\n').map((a) => a.trim()).filter(Boolean);

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Title and alias search for the mention menus. Title prefix matches rank first, then
 * alias prefix matches, then substring matches, then most recently edited. Empty query = recent objects.
 */
export async function searchTitles(ws: string, query: string, opts: { typeId?: string; limit?: number } = {}): Promise<ObjectSummary[]> {
  const q = query.trim();
  const limit = opts.limit ?? 8;
  const typeFilter = opts.typeId ? 'AND o.type_id = ?' : '';
  const typeArgs = opts.typeId ? [opts.typeId] : [];
  if (!q) {
    const { results } = await db()
      .prepare(`${SUMMARY} WHERE o.workspace_id = ? AND o.deleted_at IS NULL ${typeFilter} ORDER BY o.updated_at DESC LIMIT ?`)
      .bind(ws, ...typeArgs, limit)
      .all<ObjectSummary>();
    return results;
  }
  const like = `%${escapeLike(q)}%`;
  const prefix = `${escapeLike(q)}%`;
  const { results } = await db()
    .prepare(
      `${SUMMARY}
       WHERE o.workspace_id = ? AND o.deleted_at IS NULL ${typeFilter}
         AND (o.title LIKE ? ESCAPE '\\' OR o.aliases LIKE ? ESCAPE '\\')
       ORDER BY (o.title LIKE ? ESCAPE '\\') DESC,
                (char(10) || o.aliases LIKE ? ESCAPE '\\') DESC,
                (o.title LIKE ? ESCAPE '\\') DESC, o.updated_at DESC
       LIMIT ?`,
    )
    .bind(ws, ...typeArgs, like, like, prefix, `%\n${escapeLike(q)}%`, like, limit)
    .all<ObjectSummary>();
  return results;
}

/** Exact, case-insensitive title match within a type (used to avoid duplicate tags). */
export async function findByTitle(ws: string, typeId: string, title: string): Promise<string | null> {
  const r = await db()
    .prepare('SELECT id FROM objects WHERE workspace_id = ? AND type_id = ? AND deleted_at IS NULL AND title = ? COLLATE NOCASE LIMIT 1')
    .bind(ws, typeId, title.trim())
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

/** Full-text search over titles, aliases and document text. Titles weigh most, then aliases. */
export async function searchFullText(ws: string, input: string, limit = 20): Promise<SearchHit[]> {
  const match = ftsQuery(input);
  if (!match) return [];
  const { results } = await db()
    .prepare(
      `SELECT o.id, o.type_id, o.title, o.updated_at, json_extract(o.properties, '$._icon') AS icon,
              t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color,
              snippet(objects_fts, 2, char(2), char(3), '…', 14) AS snippet
       FROM objects_fts
       JOIN objects o ON o.rowid = objects_fts.rowid
       JOIN types t ON t.id = o.type_id
       WHERE objects_fts MATCH ? AND o.workspace_id = ? AND o.deleted_at IS NULL
       ORDER BY bm25(objects_fts, 8.0, 6.0, 1.0)
       LIMIT ?`,
    )
    .bind(match, ws, limit)
    .all<SearchHit>();
  return results;
}

/**
 * Objects whose text contains one of `names` (title and aliases) as a phrase but that don't link to `targetId`.
 * Returns their content too, so the caller can confirm a linkable plain-text occurrence.
 */
export async function unlinkedCandidates(
  targetId: string,
  names: string[],
  limit = 20,
): Promise<(SearchHit & { content: string })[]> {
  const phrases = names
    .map((n) => n.trim().split(/\s+/).filter(Boolean))
    .filter((w) => w.join(' ').length >= 3 && w.length <= 8)
    .slice(0, 12)
    .map((w) => `"${w.join(' ').replace(/"/g, '""')}"`);
  if (!phrases.length) return [];
  const phrase = `text_content : (${phrases.join(' OR ')})`;
  const { results } = await db()
    .prepare(
      `SELECT o.id, o.type_id, o.title, o.updated_at, json_extract(o.properties, '$._icon') AS icon, o.content,
              t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color,
              snippet(objects_fts, 2, char(2), char(3), '…', 14) AS snippet
       FROM objects_fts
       JOIN objects o ON o.rowid = objects_fts.rowid
       JOIN types t ON t.id = o.type_id
       WHERE objects_fts MATCH ? AND o.deleted_at IS NULL AND o.id != ?
         AND o.workspace_id = (SELECT workspace_id FROM objects WHERE id = ?)
         AND NOT EXISTS (SELECT 1 FROM links l WHERE l.source_id = o.id AND l.target_id = ?)
       ORDER BY o.updated_at DESC
       LIMIT ?`,
    )
    .bind(phrase, targetId, targetId, targetId, limit)
    .all<SearchHit & { content: string }>();
  return results;
}

/** Live objects in a workspace whose title or an alias matches one of `titles` exactly (case-insensitive). For [[links]] from MCP. Titles win over aliases. */
export async function findByTitles(ws: string, titles: string[]): Promise<Record<string, ObjectSummary>> {
  const uniq = [...new Set(titles.map((t) => t.trim()).filter(Boolean))].slice(0, 50);
  if (!uniq.length) return {};
  const { results } = await db()
    .prepare(`${SUMMARY} WHERE o.workspace_id = ? AND o.deleted_at IS NULL
              AND (lower(o.title) IN (${uniq.map(() => 'lower(?)').join(',')}) OR o.aliases != '')
              ORDER BY o.updated_at DESC`)
    .bind(ws, ...uniq)
    .all<ObjectSummary & { aliases: string }>();
  const wanted = new Set(uniq.map((t) => t.toLowerCase()));
  const out: Record<string, ObjectSummary> = {};
  for (const { aliases: _a, ...r } of results) if (wanted.has(r.title.toLowerCase())) out[r.title.toLowerCase()] ??= r;
  for (const { aliases, ...r } of results)
    for (const a of splitAliases(aliases)) if (wanted.has(a.toLowerCase())) out[a.toLowerCase()] ??= r;
  return out;
}
