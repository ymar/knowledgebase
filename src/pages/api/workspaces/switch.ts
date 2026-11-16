import type { APIRoute } from 'astro';
import { setWorkspaceCookie } from '../../../lib/workspace';

/** Switch the current workspace, then land on its daily note. */
export const POST: APIRoute = async ({ request, cookies, locals, redirect }) => {
  const isJson = request.headers.get('content-type')?.includes('application/json');
  const id = isJson
    ? String(((await request.json().catch(() => ({}))) as { id?: string }).id ?? '')
    : String((await request.formData()).get('id') ?? '');
  if (!locals.workspaces.some((w) => w.id === id)) return new Response('Unknown workspace', { status: 400 });
  setWorkspaceCookie(cookies, id);
  return isJson ? new Response(null, { status: 204 }) : redirect('/', 303);
};
