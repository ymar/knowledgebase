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
