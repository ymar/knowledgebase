import type { PropertyDef, TypeRow } from '../schema';
import { db, parseJson } from './index';

interface RawType extends Omit<TypeRow, 'properties' | 'template' | 'enabled'> {
  properties: string;
  template: string;
  enabled: number;
}

const hydrate = (r: RawType): TypeRow => ({
  ...r,
  properties: parseJson<PropertyDef[]>(r.properties, []),
  template: parseJson<unknown[]>(r.template, []),
  enabled: r.enabled === 1,
});

/** System types (Day, Tag) are shared by every workspace and always on. */
export const isSystemType = (t: Pick<TypeRow, 'workspace_id'>): boolean => t.workspace_id === null;

/**
 * The types of one workspace plus the shared system types, in that workspace's
 * order (`workspaces.type_order`; unlisted types follow by sort_order).
 * Turned-off types only on request.
 */
export async function listTypes(ws: string, opts: { includeDisabled?: boolean } = {}): Promise<TypeRow[]> {
  const { results } = await db()
    .prepare(
      `SELECT t.* FROM types t JOIN workspaces w ON w.id = ?
       WHERE (t.workspace_id = w.id OR t.workspace_id IS NULL) ${opts.includeDisabled ? '' : 'AND t.enabled = 1'}
       ORDER BY COALESCE((SELECT CAST(j.key AS INTEGER) FROM json_each(w.type_order) j WHERE j.value = t.id), 1000 + t.sort_order),
                t.name`,
    )
    .bind(ws)
    .all<RawType>();
  return results.map(hydrate);
}

/** Moves a type one place up or down in a workspace's order. Stores the full order. */
export async function moveType(ws: string, typeId: string, dir: -1 | 1): Promise<void> {
  const ids = (await listTypes(ws, { includeDisabled: true })).map((t) => t.id);
  const i = ids.indexOf(typeId);
  const j = i + dir;
  if (i === -1 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  await db().prepare('UPDATE workspaces SET type_order = ? WHERE id = ?').bind(JSON.stringify(ids), ws).run();
}

/** True when objects of `type` may live in workspace `ws`. */
export const typeBelongsTo = (type: Pick<TypeRow, 'workspace_id'>, ws: string): boolean =>
  type.workspace_id === null || type.workspace_id === ws;

export async function setTypeEnabled(id: string, enabled: boolean): Promise<void> {
  await db().prepare('UPDATE types SET enabled = ? WHERE id = ? AND workspace_id IS NOT NULL').bind(enabled ? 1 : 0, id).run();
}

export async function getTypeBySlug(slug: string): Promise<TypeRow | null> {
  const r = await db().prepare('SELECT * FROM types WHERE slug = ?').bind(slug).first<RawType>();
  return r ? hydrate(r) : null;
}

export async function getTypeById(id: string): Promise<TypeRow | null> {
  const r = await db().prepare('SELECT * FROM types WHERE id = ?').bind(id).first<RawType>();
  return r ? hydrate(r) : null;
}

/** Live (not soft-deleted) object count per type id in a workspace, for the sidebar. */
export async function countByType(ws: string): Promise<Record<string, number>> {
  const { results } = await db()
    .prepare('SELECT type_id, COUNT(*) AS n FROM objects WHERE workspace_id = ? AND deleted_at IS NULL GROUP BY type_id')
    .bind(ws)
    .all<{ type_id: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.type_id, r.n]));
}

export async function setTypeTemplate(typeId: string, template: unknown[]): Promise<void> {
  await db().prepare('UPDATE types SET template = ? WHERE id = ?').bind(JSON.stringify(template), typeId).run();
}

const nowIso = () => new Date().toISOString();

export async function createType(input: {
  id: string;
  workspaceId: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
}): Promise<void> {
  await db()
    .prepare(
      `INSERT INTO types (id, workspace_id, name, slug, icon, color, properties, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, '[]', (SELECT COALESCE(MAX(sort_order), 0) + 1 FROM types))`,
    )
    .bind(input.id, input.workspaceId, input.name, input.slug, input.icon, input.color)
    .run();
}

/** A slug based on `base` that no type uses yet (slugs are unique across workspaces). */
export async function freeSlug(base: string): Promise<string> {
  let slug = base;
  for (let n = 2; await slugTaken(slug); n++) slug = `${base}-${n}`;
  return slug;
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
  input: { name: string; icon: string; color: string; properties: PropertyDef[]; dayKey: string | null },
): Promise<void> {
  const d = db();
  const now = nowIso();
  const relationKeys = input.properties.filter((p) => p.kind === 'relation').map((p) => p.key);
  await d.batch([
    d
      .prepare('UPDATE types SET name = ?, icon = ?, color = ?, properties = ?, day_key = ? WHERE id = ?')
      .bind(input.name, input.icon, input.color, JSON.stringify(input.properties), input.dayKey, id),
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
             AND t.workspace_id = o.workspace_id
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
