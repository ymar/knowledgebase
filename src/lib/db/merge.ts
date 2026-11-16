import { extractMentionIds, extractText, replaceMentions, type Block } from '../doc';
import { contentLinkStatements } from './links';
import { db, nowIso, parseJson } from './index';

/**
 * Merges tag `fromId` into tag `intoId` in one batch:
 * documents that mention `from` are rewritten to mention `into` (and their
 * content links rebuilt), tag-picker links move over, and `from` is trashed.
 */
export async function mergeTags(fromId: string, intoId: string): Promise<number> {
  const d = db();
  const into = await d
    .prepare(
      `SELECT id, title, type_id FROM objects WHERE id = ? AND type_id = 'type_tag' AND deleted_at IS NULL
         AND workspace_id = (SELECT workspace_id FROM objects WHERE id = ?)`,
    )
    .bind(intoId, fromId)
    .first<{ id: string; title: string; type_id: string }>();
  if (!into || fromId === intoId) throw new Error('Pick another tag');

  const { results: sources } = await d
    .prepare(
      `SELECT o.id, o.content FROM objects o
       WHERE o.deleted_at IS NULL AND EXISTS (SELECT 1 FROM links l WHERE l.source_id = o.id AND l.target_id = ? AND l.origin = 'content')`,
    )
    .bind(fromId)
    .all<{ id: string; content: string }>();

  const now = nowIso();
  const stmts: D1PreparedStatement[] = [];
  for (const s of sources) {
    const next = replaceMentions(parseJson<Block[]>(s.content, []), fromId, { id: into.id, title: into.title, typeId: into.type_id });
    stmts.push(
      d.prepare('UPDATE objects SET content = ?, text_content = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(next), extractText(next), now, s.id),
      ...contentLinkStatements(s.id, extractMentionIds(next), now),
    );
  }
  stmts.push(
    d
      .prepare(
        `INSERT OR IGNORE INTO links (source_id, target_id, origin, created_at)
         SELECT source_id, ?, origin, ? FROM links WHERE target_id = ? AND origin != 'content' AND source_id != ?`,
      )
      .bind(intoId, now, fromId, intoId),
    d.prepare("DELETE FROM links WHERE target_id = ? AND origin != 'content'").bind(fromId),
    d.prepare('UPDATE objects SET deleted_at = ?, updated_at = ? WHERE id = ?').bind(now, now, fromId),
  );
  await d.batch(stmts);
  return sources.length;
}
