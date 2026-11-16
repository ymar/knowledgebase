import type { APIRoute } from 'astro';
import { createWorkspace, updateWorkspace } from '../../../lib/db';
import { TYPE_COLORS } from '../../../lib/icons';
import { newId } from '../../../lib/ulid';
import { setWorkspaceCookie } from '../../../lib/workspace';

/** Create a workspace, or rename / recolor one. */
export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  const form = await request.formData();
  const name = String(form.get('name') ?? '').trim().slice(0, 40);
  const colorIn = String(form.get('color') ?? '');
  const color = TYPE_COLORS.includes(colorIn) ? colorIn : TYPE_COLORS[0];
  if (!name) return redirect(`/workspaces?notice=${encodeURIComponent('Give the workspace a name.')}`, 303);

  const id = String(form.get('id') ?? '');
  if (id) {
    if (!locals.workspaces.some((w) => w.id === id)) return new Response('Unknown workspace', { status: 400 });
    await updateWorkspace(id, name, color);
    return redirect(`/workspaces?notice=${encodeURIComponent('Saved.')}`, 303);
  }
  const newWs = newId();
  await createWorkspace(newWs, name, color);
  setWorkspaceCookie(cookies, newWs);
  return redirect('/', 303);
};
