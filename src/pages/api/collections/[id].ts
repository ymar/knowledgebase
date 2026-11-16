import type { APIRoute } from 'astro';
import { deleteCollection, getCollection, getTypeById } from '../../../lib/db';

/** Delete a collection (form `_action=delete`). Its objects stay. */
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const c = await getCollection(params.id!);
  if (!c) return new Response('Not found', { status: 404 });
  if ((await request.formData()).get('_action') !== 'delete') return new Response('Bad action', { status: 400 });
  await deleteCollection(c.id);
  const type = await getTypeById(c.type_id);
  return redirect(type ? `/t/${type.slug}` : '/', 303);
};
