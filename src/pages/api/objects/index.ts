import type { APIRoute } from 'astro';
import { createObject, findByTitle, findDay, getSummaries, getTypeById } from '../../../lib/db';
import { isIsoDay } from '../../../lib/format';
import { json } from '../../../lib/http';
import { TAG_TYPE_ID } from '../../../lib/schema';

/**
 * Create an object. Form posts (from list pages) redirect to the new object.
 * JSON posts (from the editor's inline create) return its summary.
 */
export const POST: APIRoute = async ({ request, redirect }) => {
  const isJson = request.headers.get('content-type')?.includes('application/json');
  const input = isJson
    ? ((await request.json().catch(() => ({}))) as { typeId?: string; title?: string })
    : Object.fromEntries(await request.formData());
  const typeId = String(input.typeId ?? '');
  const title = String(input.title ?? '').trim().slice(0, 500);

  const type = await getTypeById(typeId);
  if (!type) return isJson ? json({ error: 'Unknown type' }, 400) : new Response('Unknown type', { status: 400 });

  let id: string | null = null;
  if (type.id === 'type_day') {
    if (!isIsoDay(title)) {
      return isJson ? json({ error: 'Invalid date' }, 400) : redirect(`/t/${type.slug}?error=${encodeURIComponent('Pick a valid date')}`, 303);
    }
    id = await findDay(title);
  } else if (type.id === TAG_TYPE_ID && title) {
    id = await findByTitle(TAG_TYPE_ID, title);
  }
  id ??= await createObject({ typeId: type.id, title });

  if (!isJson) return redirect(`/o/${id}`, 303);
  return json((await getSummaries([id]))[id], 201);
};
