import type { ObjectSummary } from '../schema';
import { newId } from '../ulid';
import { extractText, type Block } from '../doc';
import { db, nowIso, parseJson } from './index';
import { getSummaries } from './objects';

/** Returns the day object's id, creating it (from the Day template) if needed. Race-safe via the unique index. */
export async function getOrCreateDay(ws: string, date: string): Promise<string> {
  const now = nowIso();
  const d = db();
  const tpl = await d.prepare("SELECT template FROM types WHERE id = 'type_day'").first<{ template: string }>();
  const content = parseJson<Block[]>(tpl?.template, []);
  await d
    .prepare(
      `INSERT OR IGNORE INTO objects (id, workspace_id, type_id, title, properties, content, text_content, created_at, updated_at)
       VALUES (?, ?, 'type_day', ?, '{}', ?, ?, ?, ?)`,
    )
    .bind(newId(), ws, date, JSON.stringify(content), extractText(content), now, now)
    .run();
  const row = await d
    .prepare("SELECT id FROM objects WHERE workspace_id = ? AND type_id = 'type_day' AND title = ? AND deleted_at IS NULL")
    .bind(ws, date)
    .first<{ id: string }>();
  return row!.id;
}

export async function getOrCreateDaySummary(ws: string, date: string): Promise<ObjectSummary> {
  const id = await getOrCreateDay(ws, date);
  return (await getSummaries([id]))[id]!;
}

/** Dates in [from, to] that have a day note with some text. */
export async function daysWithNotes(ws: string, from: string, to: string): Promise<Set<string>> {
  const { results } = await db()
    .prepare(
      `SELECT title FROM objects
       WHERE workspace_id = ? AND type_id = 'type_day' AND deleted_at IS NULL AND title BETWEEN ? AND ? AND text_content != ''`,
    )
    .bind(ws, from, to)
    .all<{ title: string }>();
  return new Set(results.map((r) => r.title));
}

export interface DateReference extends ObjectSummary {
  /** The date property that put it on this day. */
  day_key: string;
  /** HH:MM from the type's first time property, if set. */
  time: string | null;
}

/**
 * Objects whose daily-note date property (their type's `day_key`) is `date`.
 * `day_key` is validated as [A-Za-z0-9_]+ when a type is saved, so building the JSON path from it is safe.
 */
export async function dateReferences(ws: string, date: string): Promise<DateReference[]> {
  const { results } = await db()
    .prepare(
      `SELECT o.id, o.type_id, o.title, o.updated_at, json_extract(o.properties, '$._icon') AS icon, t.day_key,
              json_extract(o.properties, '$."' || (SELECT json_extract(p.value, '$.key') FROM json_each(t.properties) p
                WHERE json_extract(p.value, '$.kind') = 'time' LIMIT 1) || '"') AS time,
              t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color
       FROM objects o JOIN types t ON t.id = o.type_id
       WHERE o.workspace_id = ? AND o.deleted_at IS NULL AND t.day_key IS NOT NULL
         AND json_extract(o.properties, '$."' || t.day_key || '"') = ?
       ORDER BY (time IS NULL), time, t.sort_order, o.title COLLATE NOCASE
       LIMIT 200`,
    )
    .bind(ws, date)
    .all<DateReference>();
  return results;
}

/** Per date in [from, to]: how many objects are scheduled on it via a date property. */
export async function scheduledCounts(ws: string, from: string, to: string): Promise<Record<string, number>> {
  const { results } = await db()
    .prepare(
      `SELECT d, COUNT(*) AS n FROM (
         SELECT json_extract(o.properties, '$."' || t.day_key || '"') AS d
         FROM objects o JOIN types t ON t.id = o.type_id
         WHERE o.workspace_id = ? AND o.deleted_at IS NULL AND t.day_key IS NOT NULL
       ) WHERE d BETWEEN ? AND ? GROUP BY d`,
    )
    .bind(ws, from, to)
    .all<{ d: string; n: number }>();
  return Object.fromEntries(results.map((r) => [r.d, r.n]));
}

export interface DayActivity extends ObjectSummary {
  created_on_day: number;
}

/** Non-day objects created or edited on `date` (UTC date of the timestamps). */
export async function activityOn(ws: string, date: string): Promise<DayActivity[]> {
  const { results } = await db()
    .prepare(
      `SELECT o.id, o.type_id, o.title, o.updated_at, json_extract(o.properties, '$._icon') AS icon,
              t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color,
              substr(o.created_at, 1, 10) = ?1 AS created_on_day
       FROM objects o JOIN types t ON t.id = o.type_id
       WHERE o.workspace_id = ?2 AND o.deleted_at IS NULL AND o.type_id != 'type_day'
         AND (substr(o.created_at, 1, 10) = ?1 OR substr(o.updated_at, 1, 10) = ?1)
       ORDER BY o.updated_at DESC
       LIMIT 50`,
    )
    .bind(date, ws)
    .all<DayActivity>();
  return results;
}
