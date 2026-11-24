import type { ObjectSummary } from '../schema';
import { db, nowIso } from './index';
import { getOrCreateDay } from './days';
import { isTaskType } from './tasks';

export interface CalendarEntry extends ObjectSummary {
  /** The day it's on: its type's daily-notes date property. */
  date: string;
  /** HH:MM from its type's first time property, if any. */
  time: string | null;
  /** Tasks only: ticked. */
  done: number;
  is_task: number;
}

/**
 * The first time-kind property key of the type, as SQL. Keys are validated as [A-Za-z0-9_]+ when
 * a type is saved, so building JSON paths from day_key and this key is safe.
 */
const TIME_KEY = `(SELECT json_extract(p.value, '$.key') FROM json_each(t.properties) p
                   WHERE json_extract(p.value, '$.kind') = 'time' LIMIT 1)`;

/**
 * Everything scheduled in [from, to] in a workspace: objects whose type has a daily-notes date
 * property (`day_key`) set to a day in range, tasks included. Timed entries first, then by type.
 */
export async function calendarEntries(ws: string, from: string, to: string): Promise<CalendarEntry[]> {
  const { results } = await db()
    .prepare(
      `SELECT * FROM (
         SELECT o.id, o.type_id, o.title, o.updated_at, json_extract(o.properties, '$._icon') AS icon,
                t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color,
                json_extract(o.properties, '$."' || t.day_key || '"') AS date,
                json_extract(o.properties, '$."' || ${TIME_KEY} || '"') AS time,
                COALESCE(json_extract(o.properties, '$.done'), 0) AS done,
                t.sort_order
         FROM objects o JOIN types t ON t.id = o.type_id
         WHERE o.workspace_id = ? AND o.deleted_at IS NULL AND t.day_key IS NOT NULL
       )
       WHERE date BETWEEN ? AND ?
       ORDER BY date, (time IS NULL), time, done, sort_order, title COLLATE NOCASE
       LIMIT 1000`,
    )
    .bind(ws, from, to)
    .all<Omit<CalendarEntry, 'is_task'> & { sort_order: number }>();
  return results.map(({ sort_order: _s, ...r }) => ({ ...r, is_task: isTaskType(r.type_id) ? 1 : 0 }));
}

/** Dates in [from, to] whose daily note is marked reviewed. */
export async function reviewedDays(ws: string, from: string, to: string): Promise<Set<string>> {
  const { results } = await db()
    .prepare(
      `SELECT title FROM objects
       WHERE workspace_id = ? AND type_id = 'type_day' AND deleted_at IS NULL AND title BETWEEN ? AND ?
         AND json_extract(properties, '$.reviewed_at') IS NOT NULL`,
    )
    .bind(ws, from, to)
    .all<{ title: string }>();
  return new Set(results.map((r) => r.title));
}

/** Marks a day's note reviewed (or not). Creates the note if needed; the mark lives in its properties. */
export async function setDayReviewed(ws: string, date: string, reviewed: boolean): Promise<void> {
  const id = await getOrCreateDay(ws, date);
  const stmt = reviewed
    ? db().prepare("UPDATE objects SET properties = json_set(properties, '$.reviewed_at', ?) WHERE id = ?").bind(nowIso(), id)
    : db().prepare("UPDATE objects SET properties = json_remove(properties, '$.reviewed_at') WHERE id = ?").bind(id);
  await stmt.run();
}
