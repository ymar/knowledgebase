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

export interface DayActivity extends ObjectSummary {
  created_on_day: number;
}

/** Non-day objects created or edited on `date` (UTC date of the timestamps). */
export async function activityOn(ws: string, date: string): Promise<DayActivity[]> {
  const { results } = await db()
    .prepare(
      `SELECT o.id, o.type_id, o.title, o.updated_at,
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
