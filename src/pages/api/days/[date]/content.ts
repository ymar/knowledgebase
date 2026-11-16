import type { APIRoute } from 'astro';
import { getOrCreateDay, saveContent } from '../../../../lib/db';
import { isIsoDay } from '../../../../lib/format';
import { json, readDocument } from '../../../../lib/http';

/** Days are created on first save, so browsing dates never leaves empty notes behind. */
export const PUT: APIRoute = async ({ params, request }) => {
  const date = params.date!;
  if (!isIsoDay(date)) return json({ error: 'Invalid date' }, 400);
  const content = await readDocument(request);
  if (content instanceof Response) return content;
  const id = await getOrCreateDay(date);
  await saveContent(id, content);
  return json({ id });
};
