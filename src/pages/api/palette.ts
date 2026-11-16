import type { APIRoute } from 'astro';
import { recentlyOpened, searchFullText } from '../../lib/db';
import { json } from '../../lib/http';

/** Command palette data: full-text hits for a query, or recently opened objects. */
export const GET: APIRoute = async ({ url }) => {
  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  if (!q.trim()) return json({ hits: (await recentlyOpened(8)).map((r) => ({ ...r, snippet: '' })), recent: true });
  return json({ hits: await searchFullText(q, 12), recent: false });
};
