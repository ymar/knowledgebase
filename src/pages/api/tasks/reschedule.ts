import type { APIRoute } from 'astro';
import { rescheduleTasks } from '../../../lib/db';
import { isIsoDay } from '../../../lib/format';
import { resolveWs } from '../../../lib/workspace';

/** Form: ids (repeated), date, ws, back. Moves those open tasks to `date`. */
export const POST: APIRoute = async ({ request, redirect, locals }) => {
  const form = await request.formData();
  const date = String(form.get('date') ?? '');
  const ids = form.getAll('ids').map(String).filter(Boolean).slice(0, 200);
  if (!isIsoDay(date)) return new Response('Invalid date', { status: 400 });
  await rescheduleTasks(resolveWs(locals, String(form.get('ws') ?? '')), ids, date);
  const back = String(form.get('back') ?? '/');
  return redirect(/^\/[a-z0-9/-]*$/i.test(back) ? back : '/', 303);
};
