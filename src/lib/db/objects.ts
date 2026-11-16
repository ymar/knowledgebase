import type { ObjectRow, ObjectSummary, PropertyDef, PropertyValue } from '../schema';
import { newId } from '../ulid';
import { db, nowIso, parseJson } from './index';
import { contentLinkStatements } from './links';
import { extractMentionIds, extractText, type Block } from '../doc';

interface RawObject extends Omit<ObjectRow, 'properties' | 'content'> {
  properties: string;
  content: string;
}

const hydrate = (r: RawObject): ObjectRow => ({
  ...r,
  properties: parseJson<Record<string, PropertyValue>>(r.properties, {}),
  content: parseJson<unknown[]>(r.content, []),
});

const SUMMARY_SELECT = `
  SELECT o.id, o.type_id, o.title, o.updated_at,
         t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color
  FROM objects o JOIN types t ON t.id = o.type_id`;

export async function getObject(id: string): Promise<ObjectRow | null> {
  const r = await db()
    .prepare('SELECT * FROM objects WHERE id = ? AND deleted_at IS NULL')
    .bind(id)
    .first<RawObject>();
  return r ? hydrate(r) : null;
}

export async function listObjectsByType(ws: string, typeId: string, limit = 500): Promise<ObjectSummary[]> {
  const { results } = await db()
    .prepare(`${SUMMARY_SELECT} WHERE o.workspace_id = ? AND o.type_id = ? AND o.deleted_at IS NULL ORDER BY o.updated_at DESC LIMIT ?`)
    .bind(ws, typeId, limit)
    .all<ObjectSummary>();
  return results;
}

export async function listRecent(ws: string, limit = 20): Promise<ObjectSummary[]> {
  const { results } = await db()
    .prepare(`${SUMMARY_SELECT} WHERE o.workspace_id = ? AND o.deleted_at IS NULL ORDER BY o.updated_at DESC LIMIT ?`)
    .bind(ws, limit)
    .all<ObjectSummary>();
  return results;
}

export async function getSummaries(ids: string[]): Promise<Record<string, ObjectSummary>> {
  if (ids.length === 0) return {};
  const marks = ids.map(() => '?').join(',');
  const { results } = await db()
    .prepare(`${SUMMARY_SELECT} WHERE o.id IN (${marks}) AND o.deleted_at IS NULL`)
    .bind(...ids)
    .all<ObjectSummary>();
  return Object.fromEntries(results.map((r) => [r.id, r]));
}

export async function createObject(input: {
  workspaceId: string;
  typeId: string;
  title: string;
  /** Initial property values (e.g. the day-note date); relation values aren't linked here. */
  properties?: Record<string, PropertyValue>;
}): Promise<string> {
  const id = newId();
  const now = nowIso();
  const d = db();
  const tpl = await d.prepare('SELECT template FROM types WHERE id = ?').bind(input.typeId).first<{ template: string }>();
  const content = parseJson<Block[]>(tpl?.template, []);
  await d.batch([
    d
      .prepare(
        `INSERT INTO objects (id, workspace_id, type_id, title, properties, content, text_content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(id, input.workspaceId, input.typeId, input.title.trim(), JSON.stringify(input.properties ?? {}), JSON.stringify(content), extractText(content), now, now),
    ...contentLinkStatements(id, extractMentionIds(content), now),
  ]);
  return id;
}

export async function renameObject(id: string, title: string): Promise<void> {
  await db()
    .prepare('UPDATE objects SET title = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .bind(title.trim(), nowIso(), id)
    .run();
}

/**
 * Replaces the object's property values and, in the same batch, rewrites its
 * origin = 'property' link rows from the relation-kind values.
 */
export async function saveProperties(
  id: string,
  defs: PropertyDef[],
  values: Record<string, PropertyValue>,
): Promise<void> {
  const now = nowIso();
  const relationTargets = defs
    .filter((d) => d.kind === 'relation')
    .map((d) => values[d.key])
    .filter((v): v is string => typeof v === 'string' && v !== '' && v !== id);
  const unique = [...new Set(relationTargets)];

  const d = db();
  const stmts: D1PreparedStatement[] = [
    d
      .prepare('UPDATE objects SET properties = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .bind(JSON.stringify(values), now, id),
    d.prepare("DELETE FROM links WHERE source_id = ? AND origin = 'property'").bind(id),
    ...unique.map((t) =>
      d
        .prepare(
          `INSERT OR IGNORE INTO links (source_id, target_id, origin, created_at)
           SELECT ?, id, 'property', ? FROM objects WHERE id = ? AND deleted_at IS NULL
             AND workspace_id = (SELECT workspace_id FROM objects WHERE id = ?)`,
        )
        .bind(id, now, t, id),
    ),
  ];
  await d.batch(stmts);
}

export async function softDeleteObject(id: string): Promise<void> {
  const now = nowIso();
  await db()
    .prepare('UPDATE objects SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .bind(now, now, id)
    .run();
}

export async function findDay(ws: string, date: string): Promise<string | null> {
  const r = await db()
    .prepare("SELECT id FROM objects WHERE workspace_id = ? AND type_id = 'type_day' AND title = ? AND deleted_at IS NULL")
    .bind(ws, date)
    .first<{ id: string }>();
  return r?.id ?? null;
}

/** Records a view for "recently opened". Doesn't touch updated_at. */
export async function markOpened(id: string): Promise<void> {
  await db().prepare('UPDATE objects SET opened_at = ? WHERE id = ?').bind(nowIso(), id).run();
}

export async function setPinned(id: string, pinned: boolean): Promise<void> {
  await db()
    .prepare('UPDATE objects SET pinned_at = ? WHERE id = ? AND deleted_at IS NULL')
    .bind(pinned ? nowIso() : null, id)
    .run();
}

/**
 * Moves an object to another type. Keeps property values whose key exists on the
 * new type, drops the rest, and rewrites relation links, all in one batch.
 * Returns the dropped keys.
 */
export async function changeType(
  id: string,
  current: Record<string, PropertyValue>,
  newTypeId: string,
  newDefs: PropertyDef[],
): Promise<string[]> {
  const keep = new Set(newDefs.map((d) => d.key));
  const kept = Object.fromEntries(Object.entries(current).filter(([k]) => keep.has(k)));
  const dropped = Object.keys(current).filter((k) => !keep.has(k) && current[k] !== null && current[k] !== '');
  const now = nowIso();
  const d = db();
  const relationTargets = [
    ...new Set(
      newDefs
        .filter((x) => x.kind === 'relation')
        .map((x) => kept[x.key])
        .filter((v): v is string => typeof v === 'string' && v !== '' && v !== id),
    ),
  ];
  await d.batch([
    d
      .prepare('UPDATE objects SET type_id = ?, properties = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
      .bind(newTypeId, JSON.stringify(kept), now, id),
    d.prepare("DELETE FROM links WHERE source_id = ? AND origin = 'property'").bind(id),
    ...relationTargets.map((t) =>
      d
        .prepare(
          `INSERT OR IGNORE INTO links (source_id, target_id, origin, created_at)
           SELECT ?, id, 'property', ? FROM objects WHERE id = ? AND deleted_at IS NULL
             AND workspace_id = (SELECT workspace_id FROM objects WHERE id = ?)`,
        )
        .bind(id, now, t, id),
    ),
  ]);
  return dropped;
}
