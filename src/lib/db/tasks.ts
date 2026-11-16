import type { ObjectSummary } from '../schema';
import { db, nowIso } from './index';
import { nextDateOnComplete } from '../task-logic';

/** Task types are the starter 'type_task' and its per-workspace copies 'type_task__<ws>'. */
export const isTaskType = (typeId: string): boolean => typeId === 'type_task' || typeId.startsWith('type_task__');
const TASK_TYPE_SQL = "(t.id = 'type_task' OR t.id LIKE 'type\\_task\\_\\_%' ESCAPE '\\')";

export interface TaskRow extends ObjectSummary {
  done: number;
  date: string | null;
  deadline: string | null;
  priority: string | null;
  status: string | null;
  repeat: string | null;
  /** JSON array (or single id) of linked context objects. */
  context: string | null;
  done_at: string | null;
}

const SELECT = `
  SELECT o.id, o.type_id, o.title, o.updated_at,
         t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color,
         COALESCE(json_extract(o.properties, '$.done'), 0) AS done,
         json_extract(o.properties, '$.date') AS date,
         json_extract(o.properties, '$.deadline') AS deadline,
         json_extract(o.properties, '$.priority') AS priority,
         json_extract(o.properties, '$.status') AS status,
         json_extract(o.properties, '$.repeat') AS repeat,
         json_extract(o.properties, '$.context') AS context,
         json_extract(o.properties, '$.done_at') AS done_at
  FROM objects o JOIN types t ON t.id = o.type_id`;

/** Within a group: deadlines first, then priority (High, Medium, Low, none), then age. */
const ORDER = `(json_extract(o.properties, '$.deadline') IS NULL),
  CASE json_extract(o.properties, '$.priority') WHEN 'High' THEN 0 WHEN 'Medium' THEN 1 WHEN 'Low' THEN 2 ELSE 3 END,
  o.created_at`;

/**
 * Tasks for a daily note: those planned for `date` (done or not), plus, on today's
 * note only, open tasks that slipped: planned before today or with a deadline today or earlier.
 */
export async function tasksForDay(ws: string, date: string, today: string): Promise<{ planned: TaskRow[]; due: TaskRow[]; completed: TaskRow[] }> {
  const d = db();
  const [planned, due, completed] = await d.batch([
    d
      .prepare(`${SELECT} WHERE o.workspace_id = ? AND o.deleted_at IS NULL AND ${TASK_TYPE_SQL}
                AND json_extract(o.properties, '$.date') = ?
                ORDER BY done, ${ORDER}`)
      .bind(ws, date),
    d
      .prepare(`${SELECT} WHERE o.workspace_id = ? AND o.deleted_at IS NULL AND ${TASK_TYPE_SQL}
                AND ? = ? AND COALESCE(json_extract(o.properties, '$.done'), 0) = 0
                AND COALESCE(json_extract(o.properties, '$.date'), '') != ?
                AND (json_extract(o.properties, '$.date') < ? OR json_extract(o.properties, '$.deadline') <= ?)
                ORDER BY COALESCE(json_extract(o.properties, '$.deadline'), json_extract(o.properties, '$.date')), ${ORDER}
                LIMIT 100`)
      .bind(ws, date, today, date, today, today),
    d
      .prepare(`${SELECT} WHERE o.workspace_id = ? AND o.deleted_at IS NULL AND ${TASK_TYPE_SQL}
                AND json_extract(o.properties, '$.done_at') = ?
                AND COALESCE(json_extract(o.properties, '$.date'), '') != ?
                ORDER BY o.updated_at`)
      .bind(ws, date, date),
  ]);
  return { planned: planned.results as TaskRow[], due: due.results as TaskRow[], completed: completed.results as TaskRow[] };
}

/** Open and recently done tasks whose Context links to `objectId`. */
export async function tasksForObject(ws: string, objectId: string): Promise<TaskRow[]> {
  const { results } = await db()
    .prepare(`${SELECT} WHERE o.workspace_id = ? AND o.deleted_at IS NULL AND ${TASK_TYPE_SQL}
              AND EXISTS (SELECT 1 FROM json_each(o.properties, '$.context') c WHERE c.value = ?)
              ORDER BY done, COALESCE(json_extract(o.properties, '$.date'), '9999'), ${ORDER}
              LIMIT 200`)
    .bind(ws, objectId)
    .all<TaskRow>();
  return results;
}

/**
 * Ticks a task done or open. A recurring task (Repeat set) doesn't close when ticked:
 * its Date moves to the next occurrence and `last_done` records today. A one-off task
 * records `done_at` (shown on that day's note) or clears it when reopened.
 */
export async function completeTask(id: string, done: boolean, today: string): Promise<{ done: boolean; date: string | null }> {
  const d = db();
  const row = await d
    .prepare(`SELECT json_extract(properties, '$.date') AS date, json_extract(properties, '$.repeat') AS repeat,
                     json_extract(properties, '$.repeat_from') AS repeat_from
              FROM objects WHERE id = ? AND deleted_at IS NULL`)
    .bind(id)
    .first<{ date: string | null; repeat: string | null; repeat_from: string | null }>();
  if (!row) throw new Error('Not found');
  const now = nowIso();
  if (done && row.repeat) {
    const next = nextDateOnComplete(row.date, row.repeat, row.repeat_from, today);
    await d
      .prepare(`UPDATE objects SET properties = json_set(properties, '$.date', ?, '$.done', json('false'), '$.last_done', ?),
                updated_at = ? WHERE id = ?`)
      .bind(next, today, now, id)
      .run();
    return { done: false, date: next };
  }
  await d
    .prepare(`UPDATE objects SET properties = json_set(properties, '$.done', json(?), '$.done_at', ?), updated_at = ? WHERE id = ?`)
    .bind(done ? 'true' : 'false', done ? today : null, now, id)
    .run();
  return { done, date: row.date };
}

/** Moves open tasks to another date in one batch (the daily note's "Move to tomorrow"). */
export async function rescheduleTasks(ws: string, ids: string[], date: string): Promise<void> {
  if (!ids.length) return;
  const d = db();
  const now = nowIso();
  await d.batch(
    ids.map((id) =>
      d.prepare(`UPDATE objects SET properties = json_set(properties, '$.date', ?), updated_at = ?
                 WHERE id = ? AND workspace_id = ? AND deleted_at IS NULL AND COALESCE(json_extract(properties, '$.done'), 0) = 0`)
        .bind(date, now, id, ws),
    ),
  );
}

export interface TaskBuckets {
  inbox: TaskRow[];
  today: TaskRow[];
  /** Planned or due on another day, oldest first (overdue at the top). */
  scheduled: TaskRow[];
  done: TaskRow[];
}

/**
 * Every task of a workspace, in the sections Capacities uses on its Tasks view:
 * Inbox (open, no date and no deadline), Today (planned today, or deadline today or passed),
 * Scheduled (open, planned or due another day; overdue first), Completed (20 most recent).
 */
export async function allTasks(ws: string, today: string): Promise<TaskBuckets> {
  const d = db();
  const [open, done] = await d.batch([
    d.prepare(`${SELECT} WHERE o.workspace_id = ? AND o.deleted_at IS NULL AND ${TASK_TYPE_SQL}
               AND COALESCE(json_extract(o.properties, '$.done'), 0) = 0
               ORDER BY COALESCE(json_extract(o.properties, '$.date'), json_extract(o.properties, '$.deadline'), '9999'), ${ORDER}
               LIMIT 500`).bind(ws),
    d.prepare(`${SELECT} WHERE o.workspace_id = ? AND o.deleted_at IS NULL AND ${TASK_TYPE_SQL}
               AND COALESCE(json_extract(o.properties, '$.done'), 0) = 1
               ORDER BY o.updated_at DESC LIMIT 20`).bind(ws),
  ]);
  const b: TaskBuckets = { inbox: [], today: [], scheduled: [], done: done.results as TaskRow[] };
  for (const t of open.results as TaskRow[]) {
    if (!t.date && !t.deadline) b.inbox.push(t);
    else if (t.date === today || (t.deadline && t.deadline <= today)) b.today.push(t);
    else b.scheduled.push(t);
  }
  return b;
}

/** The workspace's Task type id, if it exists and is on. */
export async function taskTypeIdFor(ws: string): Promise<string | null> {
  const r = await db()
    .prepare(`SELECT t.id FROM types t WHERE t.workspace_id = ? AND t.enabled = 1 AND ${TASK_TYPE_SQL} LIMIT 1`)
    .bind(ws)
    .first<{ id: string }>();
  return r?.id ?? null;
}
