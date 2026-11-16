import type { APIRoute } from 'astro';
import { recentlyOpened, searchFullText } from '../../lib/db';
import { json } from '../../lib/http';
import { resolveWs } from '../../lib/workspace';

/** Command palette data: full-text hits for a query, or recently opened objects. */
export const GET: APIRoute = async ({ url, locals }) => {
  const ws = resolveWs(locals, url.searchParams.get('ws'));
  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  if (!q.trim()) return json({ hits: (await recentlyOpened(ws, 8)).map((r) => ({ ...r, snippet: '' })), recent: true });
  return json({ hits: await searchFullText(ws, q, 12), recent: false });
};
