import type { PropertyDef, TypeRow } from '../schema';
import { db, parseJson } from './index';

interface RawType extends Omit<TypeRow, 'properties' | 'template'> {
  properties: string;
  template: string;
}

const hydrate = (r: RawType): TypeRow => ({
  ...r,
  properties: parseJson<PropertyDef[]>(r.properties, []),
  template: parseJson<unknown[]>(r.template, []),
});

export async function listTypes(): Promise<TypeRow[]> {
  const { results } = await db()
    .prepare('SELECT * FROM types ORDER BY sort_order, name')
    .all<RawType>();
  return results.map(hydrate);
}

export async function getTypeBySlug(slug: string): Promise<TypeRow | null> {
  const r = await db().prepare('SELECT * FROM types WHERE slug = ?').bind(slug).first<RawType>();
  return r ? hydrate(r) : null;
}

export async function getTypeById(id: string): Promise<TypeRow | null> {
  const r = await db().prepare('SELECT * FROM types WHERE id = ?').bind(id).first<RawType>();
  return r ? hydrate(r) : null;
}

/** Live (not soft-deleted) object count per type id, for the sidebar. */
export async function countByType(): Promise<Record<string, number>> {
  const { results } = await db()
    .prepare('SELECT type_id, COUNT(*) AS n FROM objects WHERE deleted_at IS NULL GROUP BY type_id')
    .all<{ type_id: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.type_id, r.n]));
}

export async function setTypeTemplate(typeId: string, template: unknown[]): Promise<void> {
  await db().prepare('UPDATE types SET template = ? WHERE id = ?').bind(JSON.stringify(template), typeId).run();
}

const nowIso = () => new Date().toISOString();

export async function createType(input: { id: string; name: string; slug: string; icon: string; color: string }): Promise<void> {
  await db()
    .prepare(
      `INSERT INTO types (id, name, slug, icon, color, properties, sort_order)
       VALUES (?, ?, ?, ?, ?, '[]', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM types))`,
    )
    .bind(input.id, input.name, input.slug, input.icon, input.color)
    .run();
}

export async function slugTaken(slug: string, exceptId?: string): Promise<boolean> {
  const r = await db().prepare('SELECT id FROM types WHERE slug = ?').bind(slug).first<{ id: string }>();
  return !!r && r.id !== exceptId;
}

/**
 * Saves a type and, in the same batch, rebuilds its objects' relation links
 * from the (possibly changed) set of relation properties.
 */
export async function updateType(
  id: string,
  input: { name: string; icon: string; color: string; properties: PropertyDef[] },
): Promise<void> {
  const d = db();
  const now = nowIso();
  const relationKeys = input.properties.filter((p) => p.kind === 'relation').map((p) => p.key);
  await d.batch([
    d
      .prepare('UPDATE types SET name = ?, icon = ?, color = ?, properties = ? WHERE id = ?')
      .bind(input.name, input.icon, input.color, JSON.stringify(input.properties), id),
    d
      .prepare(
        "DELETE FROM links WHERE origin = 'property' AND source_id IN (SELECT id FROM objects WHERE type_id = ?)",
      )
      .bind(id),
    ...relationKeys.map((key) =>
      d
        .prepare(
          `INSERT OR IGNORE INTO links (source_id, target_id, origin, created_at)
           SELECT o.id, t.id, 'property', ?
           FROM objects o JOIN objects t ON t.id = json_extract(o.properties, ?) AND t.deleted_at IS NULL
           WHERE o.type_id = ? AND o.deleted_at IS NULL AND t.id != o.id`,
        )
        .bind(now, `$."${key}"`, id),
    ),
  ]);
}

/** Objects of a type including trashed ones (a type with any can't be deleted). */
export async function countAllOfType(id: string): Promise<number> {
  const r = await db().prepare('SELECT COUNT(*) AS n FROM objects WHERE type_id = ?').bind(id).first<{ n: number }>();
  return r?.n ?? 0;
}

export async function deleteType(id: string): Promise<void> {
  await db().prepare('DELETE FROM types WHERE id = ? AND NOT EXISTS (SELECT 1 FROM objects WHERE type_id = ?)').bind(id, id).run();
}
