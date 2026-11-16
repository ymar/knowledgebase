import type { APIRoute } from 'astro';
import { getView } from '../../../../lib/db';
import { json } from '../../../../lib/http';
import { viewResults } from '../../../../lib/view-results';

export const GET: APIRoute = async ({ params }) => {
  const view = await getView(params.id!);
  if (!view) return json({ error: 'deleted' }, 404);
  const r = await viewResults(view);
  return r ? json(r) : json({ error: 'deleted' }, 404);
};
