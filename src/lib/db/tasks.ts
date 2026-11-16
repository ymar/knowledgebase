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
