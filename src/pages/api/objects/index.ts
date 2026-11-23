import type { APIRoute } from 'astro';
import { createObject, findByTitle, findDay, getSummaries, getTypeById, isTaskType, saveProperties, typeBelongsTo } from '../../../lib/db';
import { parseTaskTitle } from '../../../lib/task-logic';
import type { PropertyValue } from '../../../lib/schema';
import { isIsoDay, requestTimeZone, todayIn } from '../../../lib/format';
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
    ? ((await request.json().catch(() => ({}))) as { typeId?: string; title?: string; workspaceId?: string; date?: string; back?: string; context?: string })
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
  let date = String(input.date ?? '');
  let finalTitle = title;
  const properties: Record<string, PropertyValue> = {};
  // Tasks: "!" .. "!!!" and date words in the title set Priority and Date ("Call bank !! friday").
  if (isTaskType(type.id) && !id) {
    const parsed = parseTaskTitle(title, todayIn(requestTimeZone(request)));
    finalTitle = parsed.title;
    if (parsed.priority) properties.priority = parsed.priority;
    if (parsed.time) properties.time = parsed.time;
    // A date word you typed wins over the page's date ("() Call bank friday" on today's note).
    if (parsed.date) date = parsed.date;
    const context = String(input.context ?? '');
    if (context) properties.context = [context];
  }
  if (type.day_key && isIsoDay(date)) properties[type.day_key] = date;
  if (!id) {
    id = await createObject({ workspaceId: ws, typeId: type.id, title: finalTitle, properties });
    // A Context is a relation: write its link rows the normal way.
    if (properties.context) await saveProperties(id, type.properties, properties);
  }

  // Forms may ask to return where they came from (e.g. the Tasks page); only local paths.
  const back = String(input.back ?? '');
  if (!isJson) return redirect(/^\/[a-z]/.test(back) ? back : `/o/${id}`, 303);
  return json((await getSummaries([id]))[id], 201);
};
