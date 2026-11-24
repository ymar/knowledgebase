import type { APIRoute } from 'astro';
import { getObject, getSummaries, getTypeById } from '../../../../lib/db';
import { blockText, extractMentionIds, type Block } from '../../../../lib/doc';
import { dayLabel } from '../../../../lib/format';
import { json } from '../../../../lib/http';

/** An object's blocks with their text (any depth), for block references in the editor. */
export const GET: APIRoute = async ({ params }) => {
  const o = await getObject(params.id!);
  if (!o) return json({ error: 'Not found' }, 404);
  const type = await getTypeById(o.type_id);
  const doc = o.content as Block[];
  const titles = await getSummaries(extractMentionIds(doc));
  const out: { id: string; text: string; type: string }[] = [];
  const walk = (list: Block[]) => {
    for (const b of list) {
      if (out.length >= 300) return;
      const text = blockText(b, (id) => titles[id]?.title).trim();
      if (b.id && text && b.type !== 'blockRef') out.push({ id: b.id, text, type: b.type });
      if (b.children?.length) walk(b.children);
    }
  };
  walk(doc);
  return json({
    id: o.id,
    title: o.type_id === 'type_day' ? dayLabel(o.title) : o.title || 'Untitled',
    type: { name: type?.name ?? '', icon: type?.icon ?? 'file-text', color: type?.color ?? '#78716c' },
    blocks: out,
  });
};
