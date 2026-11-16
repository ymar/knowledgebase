import type { APIRoute } from 'astro';
import { searchTitles } from '../../lib/db';
import { json } from '../../lib/http';
import { resolveWs } from '../../lib/workspace';

export const GET: APIRoute = async ({ url, locals }) => {
  const ws = resolveWs(locals, url.searchParams.get('ws'));
  const q = url.searchParams.get('q') ?? '';
  const typeId = url.searchParams.get('type') ?? undefined;
  return json(await searchTitles(ws, q.slice(0, 200), { typeId, limit: 8 }));
};
