import type { APIRoute } from 'astro';
import { deleteView, getTypeById, getView } from '../../../lib/db';

/** Delete a saved view (form `_action=delete`). Notes that embed it show "view deleted". */
export const POST: APIRoute = async ({ params, request, redirect }) => {
  const view = await getView(params.id!);
  if (!view) return new Response('Not found', { status: 404 });
  const form = await request.formData();
  if (form.get('_action') !== 'delete') return new Response('Bad action', { status: 400 });
  await deleteView(view.id);
  const type = await getTypeById(view.type_id);
  return redirect(type ? `/t/${type.slug}` : '/', 303);
};
