import type { APIRoute } from 'astro';
import { createObject, findByTitle, findDay, getSummaries, getTypeById, typeBelongsTo } from '../../../lib/db';
import { isIsoDay } from '../../../lib/format';
import { json } from '../../../lib/http';
import { TAG_TYPE_ID } from '../../../lib/schema';
import { resolveWs } from '../../../lib/workspace';

/**
 * Create an object. Form posts (from list pages) redirect to the new object.
 * JSON posts (from the editor's inline create) return its summary.
 */
export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const isJson = request.headers.get('content-type')?.includes('application/json');
  const input = isJson
    ? ((await request.json().catch(() => ({}))) as { typeId?: string; title?: string; workspaceId?: string; date?: string })
    : Object.fromEntries(await request.formData());
  const ws = resolveWs(locals, input.workspaceId ? String(input.workspaceId) : null);
  const typeId = String(input.typeId ?? '');
  const title = String(input.title ?? '').trim().slice(0, 500);

  const type = await getTypeById(typeId);
  if (!type || !typeBelongsTo(type, ws) || !type.enabled) {
    const msg = !type ? 'Unknown type' : 'That type is not available in this workspace';
    return isJson ? json({ error: msg }, 400) : new Response(msg, { status: 400 });
  }

  let id: string | null = null;
  if (type.id === 'type_day') {
    if (!isIsoDay(title)) {
      return isJson ? json({ error: 'Invalid date' }, 400) : redirect(`/t/${type.slug}?error=${encodeURIComponent('Pick a valid date')}`, 303);
    }
    id = await findDay(ws, title);
  } else if (type.id === TAG_TYPE_ID && title) {
    id = await findByTitle(ws, TAG_TYPE_ID, title);
  }
  // Quick add on a daily note: fill the type's daily-note date property with that day.
  const date = String(input.date ?? '');
  const properties = type.day_key && isIsoDay(date) ? { [type.day_key]: date } : undefined;
  id ??= await createObject({ workspaceId: ws, typeId: type.id, title, properties });

  if (!isJson) return redirect(`/o/${id}`, 303);
  return json((await getSummaries([id]))[id], 201);
};
