import type { APIRoute } from 'astro';
import { countAllOfType, deleteType, getTypeById, isSystemType, listTypes, setTypeEnabled, updateType } from '../../../lib/db';
import { parseTypeForm } from '../../../lib/type-form';

export const POST: APIRoute = async ({ params, request, redirect, locals }) => {
  const type = await getTypeById(params.id!);
  if (!type) return new Response('Not found', { status: 404 });
  const form = await request.formData();

  const action = form.get('_action');
  if (action === 'enable' || action === 'disable') {
    if (!isSystemType(type)) await setTypeEnabled(type.id, action === 'enable');
    const back = request.headers.get('referer');
    return redirect(back && new URL(back).pathname.startsWith('/t/') ? new URL(back).pathname : '/types', 303);
  }

  if (action === 'delete') {
    if (type.id.startsWith('type_') || (await countAllOfType(type.id)) > 0) {
      return redirect(`/types/${type.id}?notice=${encodeURIComponent('This type can’t be deleted.')}`, 303);
    }
    await deleteType(type.id);
    return redirect('/types', 303);
  }

  // Relation targets: types of the same workspace (plus the system types).
  const slugs = new Set((await listTypes(type.workspace_id ?? locals.workspace.id, { includeDisabled: true })).map((t) => t.slug));
  const input = parseTypeForm(form, type.properties, slugs);
  if (!input.name) return redirect(`/types/${type.id}?notice=${encodeURIComponent('Name can’t be empty.')}`, 303);
  await updateType(type.id, input);
  return redirect(`/types/${type.id}?notice=${encodeURIComponent('Saved.')}`, 303);
};
