import { relationIds, type ObjectRow, type ObjectSummary, type PropertyDef, type PropertyValue } from '../schema';
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
  SELECT o.id, o.type_id, o.title, o.updated_at, json_extract(o.properties, '$._icon') AS icon,
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

/** Normalizes alias input (lines or commas): trimmed, deduplicated case-insensitively, not the title itself. */
export function normalizeAliases(input: string | string[], title: string): string[] {
  const raw = Array.isArray(input) ? input : input.split(/[\n,]/);
  const seen = new Set([title.trim().toLowerCase()]);
  const out: string[] = [];
  for (const a of raw.map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
    if (seen.has(a.toLowerCase()) || a.length > 120) continue;
    seen.add(a.toLowerCase());
    out.push(a);
  }
  return out.slice(0, 20);
}

/** Sets or clears a hidden presentation key (`_icon`, `_cover`) in an object's properties. */
export async function setObjectMeta(id: string, key: '_icon' | '_cover', value: string | null): Promise<void> {
  const stmt = value === null
    ? db().prepare(`UPDATE objects SET properties = json_remove(properties, '$.${key}'), updated_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(nowIso(), id)
    : db().prepare(`UPDATE objects SET properties = json_set(properties, '$.${key}', ?), updated_at = ? WHERE id = ? AND deleted_at IS NULL`).bind(value, nowIso(), id);
  await stmt.run();
}

/** Saves aliases (stored one per line). Returns the saved list. */
export async function setAliases(id: string, input: string | string[]): Promise<string[]> {
  const obj = await db().prepare('SELECT title FROM objects WHERE id = ? AND deleted_at IS NULL').bind(id).first<{ title: string }>();
  if (!obj) return [];
  const list = normalizeAliases(input, obj.title);
  await db()
    .prepare('UPDATE objects SET aliases = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .bind(list.join('\n'), nowIso(), id)
    .run();
  return list;
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
    .flatMap((d) => relationIds(values[d.key]))
    .filter((v) => v !== id);
  const unique = [...new Set(relationTargets)];

  const d = db();
  const stmts: D1PreparedStatement[] = [
    d
      // Merge, so keys the form doesn't show (a task's done_at / last_done) survive.
      .prepare('UPDATE objects SET properties = json_patch(properties, ?), updated_at = ? WHERE id = ? AND deleted_at IS NULL')
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
  // Keys starting with _ (icon, cover) belong to the object, not its type: they always stay.
  const kept = Object.fromEntries(Object.entries(current).filter(([k]) => keep.has(k) || k.startsWith('_')));
  const dropped = Object.keys(current).filter((k) => !keep.has(k) && !k.startsWith('_') && current[k] !== null && current[k] !== '');
  const now = nowIso();
  const d = db();
  const relationTargets = [
    ...new Set(
      newDefs
        .filter((x) => x.kind === 'relation')
        .flatMap((x) => relationIds(kept[x.key]))
        .filter((v) => v !== id),
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

/** Sets one property value in place (e.g. ticking a task done) without touching the others. */
export async function setPropertyValue(id: string, key: string, value: PropertyValue): Promise<void> {
  await db()
    .prepare('UPDATE objects SET properties = json_set(properties, ?, json(?)), updated_at = ? WHERE id = ? AND deleted_at IS NULL')
    .bind(`$."${key}"`, JSON.stringify(value), nowIso(), id)
    .run();
}

/**
 * Moves an object to another workspace, as an object of `typeId` there. Links never cross workspaces,
 * so this drops every link row to or from it, removes it from collections and from other objects'
 * relation values, and keeps only property values whose key exists on the new type (relations dropped,
 * `_` keys kept). Mention chips stay in the text as plain chips; they no longer count as links.
 * One batch. Returns false if the object or type doesn't qualify.
 */
export async function moveObjectToWorkspace(id: string, ws: string, typeId: string): Promise<boolean> {
  const d = db();
  const obj = await getObject(id);
  const type = await d.prepare('SELECT id, workspace_id, enabled, properties FROM types WHERE id = ?').bind(typeId)
    .first<{ id: string; workspace_id: string | null; enabled: number; properties: string }>();
  if (!obj || !type || obj.type_id === 'type_day' || obj.workspace_id === ws) return false;
  if (type.id === 'type_day' || !type.enabled || (type.workspace_id !== null && type.workspace_id !== ws)) return false;
  const defs = parseJson<PropertyDef[]>(type.properties, []);
  const keep = new Set(defs.filter((p) => p.kind !== 'relation').map((p) => p.key));
  // Keys the old type doesn't define are hidden bookkeeping (a task's done_at, an icon): they stay.
  const oldType = await d.prepare('SELECT properties FROM types WHERE id = ?').bind(obj.type_id).first<{ properties: string }>();
  const oldKeys = new Set(parseJson<PropertyDef[]>(oldType?.properties, []).map((p) => p.key));
  const props = Object.fromEntries(Object.entries(obj.properties).filter(([k]) => keep.has(k) || !oldKeys.has(k)));

  // Objects that hold this one in a relation property: take it out of those values.
  const { results: holders } = await d
    .prepare("SELECT o.id, o.properties FROM links l JOIN objects o ON o.id = l.source_id WHERE l.target_id = ? AND l.origin = 'property'")
    .bind(id)
    .all<{ id: string; properties: string }>();
  const now = nowIso();
  const statements = holders.map((h) => {
    const p = parseJson<Record<string, PropertyValue>>(h.properties, {});
    for (const [k, v] of Object.entries(p)) {
      if (v === id) p[k] = null;
      else if (Array.isArray(v) && v.includes(id)) p[k] = v.filter((x) => x !== id);
    }
    return d.prepare('UPDATE objects SET properties = ? WHERE id = ?').bind(JSON.stringify(p), h.id);
  });
  await d.batch([
    ...statements,
    d.prepare('UPDATE objects SET workspace_id = ?, type_id = ?, properties = ?, pinned_at = NULL, updated_at = ? WHERE id = ?')
      .bind(ws, typeId, JSON.stringify(props), now, id),
    d.prepare('DELETE FROM links WHERE source_id = ? OR target_id = ?').bind(id, id),
    d.prepare('DELETE FROM collection_items WHERE object_id = ?').bind(id),
  ]);
  return true;
}
