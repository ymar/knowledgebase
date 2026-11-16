import type { APIRoute } from 'astro';
import { getOrCreateDaySummary } from '../../../lib/db';
import { isIsoDay } from '../../../lib/format';
import { json } from '../../../lib/http';
import { resolveWs } from '../../../lib/workspace';

/** Get-or-create the day object for a date mention. */
export const POST: APIRoute = async ({ params, url, locals }) => {
  const date = params.date!;
  if (!isIsoDay(date)) return json({ error: 'Invalid date' }, 400);
  return json(await getOrCreateDaySummary(resolveWs(locals, url.searchParams.get('ws')), date));
};
