import type { ObjectSummary } from '../schema';
import { db } from './index';

/** Task types are the starter 'type_task' and its per-workspace copies 'type_task__<ws>'. */
export const isTaskType = (typeId: string): boolean => typeId === 'type_task' || typeId.startsWith('type_task__');
const TASK_TYPE_SQL = "(t.id = 'type_task' OR t.id LIKE 'type\\_task\\_\\_%' ESCAPE '\\')";

export interface TaskRow extends ObjectSummary {
  done: number;
  date: string | null;
  deadline: string | null;
}

const SELECT = `
  SELECT o.id, o.type_id, o.title, o.updated_at,
         t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color,
         COALESCE(json_extract(o.properties, '$.done'), 0) AS done,
         json_extract(o.properties, '$.date') AS date,
         json_extract(o.properties, '$.deadline') AS deadline
  FROM objects o JOIN types t ON t.id = o.type_id`;

/**
 * Tasks for a daily note: those planned for `date` (done or not), plus, on today's
 * note only, open tasks that slipped: planned before today or with a deadline today or earlier.
 */
export async function tasksForDay(ws: string, date: string, today: string): Promise<{ planned: TaskRow[]; due: TaskRow[] }> {
  const d = db();
  const [planned, due] = await d.batch([
    d
      .prepare(`${SELECT} WHERE o.workspace_id = ? AND o.deleted_at IS NULL AND ${TASK_TYPE_SQL}
                AND json_extract(o.properties, '$.date') = ?
                ORDER BY done, o.created_at`)
      .bind(ws, date),
    d
      .prepare(`${SELECT} WHERE o.workspace_id = ? AND o.deleted_at IS NULL AND ${TASK_TYPE_SQL}
                AND ? = ? AND COALESCE(json_extract(o.properties, '$.done'), 0) = 0
                AND COALESCE(json_extract(o.properties, '$.date'), '') != ?
                AND (json_extract(o.properties, '$.date') < ? OR json_extract(o.properties, '$.deadline') <= ?)
                ORDER BY COALESCE(json_extract(o.properties, '$.deadline'), json_extract(o.properties, '$.date'))
                LIMIT 100`)
      .bind(ws, date, today, date, today, today),
  ]);
  return { planned: planned.results as TaskRow[], due: due.results as TaskRow[] };
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
               ORDER BY COALESCE(json_extract(o.properties, '$.date'), json_extract(o.properties, '$.deadline'), '9999'),
                        (json_extract(o.properties, '$.deadline') IS NULL), o.created_at
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
