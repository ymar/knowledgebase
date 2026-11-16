import type { APIRoute } from 'astro';
import { getObject, getTypeById, setPropertyValue } from '../../../../lib/db';
import { json } from '../../../../lib/http';

/** Tick or untick a checkbox property in place: `{ key?: 'done', value: boolean }`. Used by task lists. */
export const POST: APIRoute = async ({ params, request }) => {
  const object = await getObject(params.id!);
  if (!object) return json({ error: 'Not found' }, 404);
  const body = (await request.json().catch(() => ({}))) as { key?: string; value?: unknown };
  const key = body.key ?? 'done';
  const type = await getTypeById(object.type_id);
  if (!type?.properties.some((p) => p.key === key && p.kind === 'checkbox')) return json({ error: 'Not a checkbox property' }, 400);
  await setPropertyValue(object.id, key, body.value === true);
  return json({ id: object.id, [key]: body.value === true });
};
