import type { APIRoute } from 'astro';
import { getObject, saveContent } from '../../../../lib/db';
import { setChecklistItem, type Block } from '../../../../lib/doc';
import { json } from '../../../../lib/http';

/** Tick or untick one checklist item in an object's note: `{ blockId, checked }`. Used by Tasks › Checklists. */
export const POST: APIRoute = async ({ params, request }) => {
  const object = await getObject(params.id!);
  if (!object) return json({ error: 'Not found' }, 404);
  const body = (await request.json().catch(() => ({}))) as { blockId?: unknown; checked?: unknown };
  if (typeof body.blockId !== 'string') return json({ error: 'blockId required' }, 400);
  const next = setChecklistItem(object.content as Block[], body.blockId, body.checked === true);
  if (!next) return json({ error: 'That item is no longer there' }, 409);
  await saveContent(object.id, next);
  return json({ ok: true });
};
