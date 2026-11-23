import type { APIRoute } from 'astro';
import { getObject, isTaskType, setTaskStatus } from '../../../lib/db';
import { json } from '../../../lib/http';
import { requestTimeZone, todayIn } from '../../../lib/format';

const STATUSES = ['Not started', 'Next up', 'In progress', 'Blocked', 'Done'];

/** Board moves: JSON `{ id, status }`. "Done" ticks the task (repeating tasks move on). */
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => ({}))) as { id?: string; status?: string };
  if (!body.id || !STATUSES.includes(body.status ?? '')) return json({ error: 'Bad request' }, 400);
  const o = await getObject(body.id);
  if (!o || !isTaskType(o.type_id)) return json({ error: 'Not a task' }, 404);
  return json({ id: o.id, status: body.status, ...(await setTaskStatus(o.id, body.status!, todayIn(requestTimeZone(request)))) });
};
