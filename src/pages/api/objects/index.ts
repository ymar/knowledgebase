import type { APIRoute } from 'astro';
import { createObject, findDay, getTypeById } from '../../../lib/db';
import { isIsoDay } from '../../../lib/format';

export const POST: APIRoute = async ({ request, redirect }) => {
  const form = await request.formData();
  const typeId = String(form.get('typeId') ?? '');
  const title = String(form.get('title') ?? '').trim();

  const type = await getTypeById(typeId);
  if (!type) return new Response('Unknown type', { status: 400 });

  if (type.id === 'type_day') {
    if (!isIsoDay(title)) return redirect(`/t/${type.slug}?error=${encodeURIComponent('Pick a valid date')}`, 303);
    const existing = await findDay(title);
    if (existing) return redirect(`/o/${existing}`, 303);
  }

  const id = await createObject({ typeId: type.id, title });
  return redirect(`/o/${id}`, 303);
};
