import type { APIRoute } from 'astro';
import { purgeObject, restoreObject } from '../../../lib/db';

export const POST: APIRoute = async ({ params, request, redirect }) => {
  const id = params.id!;
  const form = await request.formData();
  if (form.get('_action') === 'purge') {
    await purgeObject(id);
    return redirect(`/trash?notice=${encodeURIComponent('Removed for good.')}`, 303);
  }
  const r = await restoreObject(id);
  if (r === 'ok') return redirect(`/o/${id}`, 303);
  const msg = r === 'day-exists' ? 'That day already has a note. Delete or rename it first.' : 'Not in the trash.';
  return redirect(`/trash?notice=${encodeURIComponent(msg)}`, 303);
};
