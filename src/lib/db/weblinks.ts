import { db } from './index';

/** Weblink types are the starter 'type_weblink' and its per-workspace copies 'type_weblink__<ws>'. */
export const isWeblinkType = (typeId: string): boolean => typeId === 'type_weblink' || typeId.startsWith('type_weblink__');

/** The workspace's Weblink type if it exists and is on, else null (the feature then hides itself). */
export async function weblinkTypeFor(ws: string): Promise<string | null> {
  const r = await db()
    .prepare("SELECT id FROM types WHERE workspace_id = ? AND enabled = 1 AND (id = 'type_weblink' OR id LIKE 'type\\_weblink\\_\\_%' ESCAPE '\\') LIMIT 1")
    .bind(ws)
    .first<{ id: string }>();
  return r?.id ?? null;
}

/** A live weblink in the workspace with exactly this URL, for de-duplication. */
export async function findWeblinkByUrl(ws: string, url: string): Promise<string | null> {
  const r = await db()
    .prepare(`SELECT o.id FROM objects o
              WHERE o.workspace_id = ? AND o.deleted_at IS NULL
                AND (o.type_id = 'type_weblink' OR o.type_id LIKE 'type\\_weblink\\_\\_%' ESCAPE '\\')
                AND json_extract(o.properties, '$.url') = ?
              ORDER BY o.created_at LIMIT 1`)
    .bind(ws, url)
    .first<{ id: string }>();
  return r?.id ?? null;
}
