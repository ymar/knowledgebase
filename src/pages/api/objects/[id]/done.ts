import type { APIRoute } from 'astro';
import { completeTask, getObject, getTypeById, isTaskType, setPropertyValue } from '../../../../lib/db';
import { json } from '../../../../lib/http';
import { requestTimeZone, todayIn } from '../../../../lib/format';

/**
 * Tick or untick a checkbox property in place: `{ key?: 'done', value: boolean }`.
 * A task's Done goes through completeTask: recurring tasks move to their next date instead.
 */
export const POST: APIRoute = async ({ params, request }) => {
  const object = await getObject(params.id!);
  if (!object) return json({ error: 'Not found' }, 404);
  const body = (await request.json().catch(() => ({}))) as { key?: string; value?: unknown };
  const key = body.key ?? 'done';
  const type = await getTypeById(object.type_id);
  if (!type?.properties.some((p) => p.key === key && p.kind === 'checkbox')) return json({ error: 'Not a checkbox property' }, 400);
  if (key === 'done' && isTaskType(type.id)) {
    const r = await completeTask(object.id, body.value === true, todayIn(requestTimeZone(request)));
    return json({ id: object.id, ...r });
  }
  await setPropertyValue(object.id, key, body.value === true);
  return json({ id: object.id, [key]: body.value === true });
};
