import type { APIRoute } from 'astro';
import { setDayReviewed } from '../../../../lib/db';
import { isIsoDay } from '../../../../lib/format';
import { resolveWs } from '../../../../lib/workspace';

/** Marks a daily note reviewed (value=true) or not. Form post; returns to `back` (a local path) or the day. */
export const POST: APIRoute = async ({ params, request, locals, redirect }) => {
  const date = params.date!;
  if (!isIsoDay(date)) return new Response('Invalid date', { status: 400 });
  const form = await request.formData();
  await setDayReviewed(resolveWs(locals, String(form.get('ws') ?? '') || null), date, form.get('value') === 'true');
  const back = String(form.get('back') ?? '');
  return redirect(back.startsWith('/') && !back.startsWith('//') ? back : `/day/${date}`, 303);
};
