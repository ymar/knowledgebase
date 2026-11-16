import type { LinkOrigin, ObjectSummary } from '../schema';
import { extractMentionIds, extractText, mentionContexts, type Block, type Snippet } from '../doc';
import { db, nowIso, parseJson } from './index';

/**
 * Statements that rewrite `sourceId`'s content links to exactly `targetIds`.
 * Targets that don't exist or are soft-deleted are skipped by the SELECT.
 */
export function contentLinkStatements(sourceId: string, targetIds: string[], now: string): D1PreparedStatement[] {
  const d = db();
  return [
    d.prepare("DELETE FROM links WHERE source_id = ? AND origin = 'content'").bind(sourceId),
    ...targetIds
      .filter((t) => t !== sourceId)
      .map((t) =>
        d
          .prepare(
            `INSERT OR IGNORE INTO links (source_id, target_id, origin, created_at)
             SELECT ?, id, 'content', ? FROM objects WHERE id = ? AND deleted_at IS NULL`,
          )
          .bind(sourceId, now, t),
      ),
  ];
}

/** Saves the document, its plain text and its outgoing content links in one batch. */
export async function saveContent(id: string, content: Block[]): Promise<void> {
  const now = nowIso();
  const d = db();
  await d.batch([
    d
      .prepare('UPDATE objects SET content = ?, text_content = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .bind(JSON.stringify(content), extractText(content), now, id),
    ...contentLinkStatements(id, extractMentionIds(content), now),
  ]);
}

export interface Backlink {
  source: ObjectSummary;
  origins: LinkOrigin[];
  snippets: Snippet[];
}

/** Live objects linking to `targetId`, with the text around each mention. */
export async function getBacklinks(targetId: string, targetTitle: string): Promise<Backlink[]> {
  const { results } = await db()
    .prepare(
      `SELECT o.id, o.type_id, o.title, o.updated_at, o.content,
              t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color,
              group_concat(l.origin) AS origins
       FROM links l
       JOIN objects o ON o.id = l.source_id AND o.deleted_at IS NULL
       JOIN types t ON t.id = o.type_id
       WHERE l.target_id = ?
       GROUP BY o.id
       ORDER BY o.updated_at DESC
       LIMIT 200`,
    )
    .bind(targetId)
    .all<ObjectSummary & { content: string; origins: string }>();

  return results.map(({ content, origins, ...source }) => {
    const list = origins.split(',') as LinkOrigin[];
    const snippets = list.includes('content')
      ? mentionContexts(parseJson<Block[]>(content, []), targetId, (id) => (id === targetId ? targetTitle : undefined))
      : [];
    return { source, origins: list, snippets };
  });
}
