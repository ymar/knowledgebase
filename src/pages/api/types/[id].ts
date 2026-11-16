import type { APIRoute } from 'astro';
import { countAllOfType, deleteType, getTypeById, listTypes, updateType } from '../../../lib/db';
import { parseTypeForm } from '../../../lib/type-form';

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const type = await getTypeById(params.id!);
  if (!type) return new Response('Not found', { status: 404 });
  const form = await request.formData();

  if (form.get('_action') === 'delete') {
    if (type.id.startsWith('type_') || (await countAllOfType(type.id)) > 0) {
      return redirect(`/types/${type.id}?notice=${encodeURIComponent('This type can’t be deleted.')}`, 303);
    }
    await deleteType(type.id);
    return redirect('/types', 303);
  }

  const slugs = new Set((await listTypes()).map((t) => t.slug));
  const input = parseTypeForm(form, type.properties, slugs);
  if (!input.name) return redirect(`/types/${type.id}?notice=${encodeURIComponent('Name can’t be empty.')}`, 303);
  await updateType(type.id, input);
  return redirect(`/types/${type.id}?notice=${encodeURIComponent('Saved.')}`, 303);
};
