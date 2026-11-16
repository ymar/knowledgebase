import type { APIRoute } from 'astro';
import { getObject, saveContent } from '../../../../lib/db';
import { json, readDocument } from '../../../../lib/http';

export const PUT: APIRoute = async ({ params, request }) => {
  const id = params.id!;
  if (!(await getObject(id))) return json({ error: 'Not found' }, 404);
  const content = await readDocument(request);
  if (content instanceof Response) return content;
  await saveContent(id, content);
  return json({ id });
};
