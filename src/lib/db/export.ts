import { db } from './index';

/** Every row, trashed objects included, as stored (JSON columns parsed). */
export async function exportAll() {
  const d = db();
  const [types, objects, links] = await d.batch([
    d.prepare('SELECT * FROM types ORDER BY sort_order'),
    d.prepare('SELECT id, type_id, title, properties, content, text_content, created_at, updated_at, deleted_at, opened_at, pinned_at FROM objects ORDER BY created_at'),
    d.prepare('SELECT source_id, target_id, origin, created_at FROM links ORDER BY created_at'),
  ]);
  const parse = (row: Record<string, unknown>, keys: string[]) => {
    for (const k of keys) if (typeof row[k] === 'string') row[k] = JSON.parse(row[k] as string);
    return row;
  };
  return {
    types: (types.results as Record<string, unknown>[]).map((r) => parse(r, ['properties', 'template'])),
    objects: (objects.results as Record<string, unknown>[]).map((r) => parse(r, ['properties', 'content'])),
    links: links.results,
  };
}
