import type { APIRoute } from 'astro';
import { createView, getTypeById, listWorkspaceViews, typeBelongsTo } from '../../../lib/db';
import { json } from '../../../lib/http';
import { resolveWs } from '../../../lib/workspace';
import { specFromQuery, specToQuery } from '../../../lib/view-results';

/** Saved views of a workspace (for the Query block picker). */
export const GET: APIRoute = async ({ url, locals }) => json(await listWorkspaceViews(resolveWs(locals, url.searchParams.get('ws'))));

/** Save the type page's current filters as a named view. Form: typeId, name, qs. */
export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const form = await request.formData();
  const type = await getTypeById(String(form.get('typeId') ?? ''));
  const name = String(form.get('name') ?? '').trim().slice(0, 80);
  const ws = locals.workspace.id;
  if (!type || !typeBelongsTo(type, ws)) return new Response('Unknown type', { status: 400 });
  const spec = specFromQuery(String(form.get('qs') ?? ''), type.properties);
  if (!name) return redirect(`/t/${type.slug}?${specToQuery(spec)}`, 303);
  const id = await createView(ws, type.id, name, spec);
  return redirect(`/t/${type.slug}?${specToQuery(spec)}&sv=${id}`, 303);
};
