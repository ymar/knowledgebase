import { db } from './index';

/** Every row, trashed objects included, as stored (JSON columns parsed). */
export async function exportAll() {
  const d = db();
  const [workspaces, types, objects, links, views, collections, collectionItems] = await d.batch([
    d.prepare('SELECT * FROM workspaces ORDER BY sort_order'),
    d.prepare('SELECT * FROM types ORDER BY sort_order'),
    d.prepare('SELECT id, workspace_id, type_id, title, properties, content, text_content, created_at, updated_at, deleted_at, opened_at, pinned_at FROM objects ORDER BY created_at'),
    d.prepare('SELECT source_id, target_id, origin, created_at FROM links ORDER BY created_at'),
    d.prepare('SELECT * FROM views ORDER BY created_at'),
    d.prepare('SELECT * FROM collections ORDER BY created_at'),
    d.prepare('SELECT * FROM collection_items ORDER BY added_at'),
  ]);
  const parse = (row: Record<string, unknown>, keys: string[]) => {
    for (const k of keys) if (typeof row[k] === 'string') row[k] = JSON.parse(row[k] as string);
    return row;
  };
  return {
    workspaces: workspaces.results as Record<string, unknown>[],
    types: (types.results as Record<string, unknown>[]).map((r) => parse(r, ['properties', 'template'])),
    objects: (objects.results as Record<string, unknown>[]).map((r) => parse(r, ['properties', 'content'])),
    links: links.results,
    views: (views.results as Record<string, unknown>[]).map((r) => parse(r, ['spec'])),
    collections: collections.results,
    collection_items: collectionItems.results,
  };
}
