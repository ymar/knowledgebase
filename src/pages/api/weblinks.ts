import type { APIRoute } from 'astro';
import { json } from '../../lib/http';
import { resolveWs } from '../../lib/workspace';
import { saveWeblink } from '../../lib/weblink-save';

/**
 * Save a URL as a Weblink: JSON `{ url, workspaceId? }` returns the object's summary (`existed` when the
 * URL was already saved); a form post redirects to the object.
 */
export const POST: APIRoute = async ({ request, locals, redirect }) => {
  const isJson = request.headers.get('content-type')?.includes('application/json');
  const input = isJson ? ((await request.json().catch(() => ({}))) as Record<string, unknown>) : Object.fromEntries(await request.formData());
  const ws = resolveWs(locals, input.workspaceId ? String(input.workspaceId) : null);
  const r = await saveWeblink(ws, String(input.url ?? ''));
  if (!r.ok) return isJson ? json({ error: r.error }, 400) : new Response(r.error, { status: 400 });
  return isJson ? json({ ...r.summary, existed: r.existed }, r.existed ? 200 : 201) : redirect(`/o/${r.summary.id}`, 303);
};
