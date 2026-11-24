import type { APIRoute } from 'astro';
import { getObject, getTypeById, isTaskType, setPropertyValue, setTaskStatus } from '../../../../lib/db';
import { json } from '../../../../lib/http';
import { requestTimeZone, todayIn } from '../../../../lib/format';

/**
 * Set one select property in place: `{ key, value }` (value '' clears). Used by the type-page board.
 * A task's Status goes through setTaskStatus, so moving to Done ticks it (repeating tasks move on).
 */
export const POST: APIRoute = async ({ params, request }) => {
  const o = await getObject(params.id!);
  if (!o) return json({ error: 'Not found' }, 404);
  const body = (await request.json().catch(() => ({}))) as { key?: unknown; value?: unknown };
  const type = await getTypeById(o.type_id);
  const def = type?.properties.find((p) => p.key === body.key && p.kind === 'select');
  const value = typeof body.value === 'string' ? body.value : '';
  if (!def || (value !== '' && !(def.options ?? []).includes(value))) return json({ error: 'Not a select value' }, 400);
  if (isTaskType(o.type_id) && def.key === 'status' && value) {
    return json({ ok: true, ...(await setTaskStatus(o.id, value, todayIn(requestTimeZone(request)))) });
  }
  await setPropertyValue(o.id, def.key, value || null);
  return json({ ok: true });
};
