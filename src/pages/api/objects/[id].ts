import type { APIRoute } from 'astro';
import { getObject, getTypeById, renameObject, saveProperties, softDeleteObject } from '../../../lib/db';
import { parsePropertyForm } from '../../../lib/properties';

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id!;
  const object = await getObject(id);
  if (!object) return new Response('Not found', { status: 404 });
  const type = (await getTypeById(object.type_id))!;

  const form = await request.formData();
  switch (form.get('_action')) {
    case 'rename':
      if (type.id !== 'type_day') await renameObject(id, String(form.get('title') ?? ''));
      break;
    case 'properties':
      await saveProperties(id, type.properties, parsePropertyForm(type.properties, form));
      break;
    case 'delete':
      await softDeleteObject(id);
      return redirect(`/t/${type.slug}`, 303);
    default:
      return new Response('Bad action', { status: 400 });
  }
  return redirect(`/o/${id}`, 303);
};
