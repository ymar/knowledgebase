import type { APIRoute } from 'astro';
import { searchTitles } from '../../lib/db';
import { json } from '../../lib/http';

export const GET: APIRoute = async ({ url }) => {
  const q = url.searchParams.get('q') ?? '';
  const typeId = url.searchParams.get('type') ?? undefined;
  return json(await searchTitles(q.slice(0, 200), { typeId, limit: 8 }));
};
