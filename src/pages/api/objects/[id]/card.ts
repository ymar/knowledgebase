import type { APIRoute } from 'astro';
import { getObject, getSummaries, getTypeById } from '../../../../lib/db';
import { json } from '../../../../lib/http';
import { displayValue } from '../../../../lib/property-display';
import { relationIds } from '../../../../lib/schema';
import { dayLabel } from '../../../../lib/format';

/** Data for an object card block in the editor. */
export const GET: APIRoute = async ({ params }) => {
  const o = await getObject(params.id!);
  if (!o) return json({ error: 'deleted' }, 404);
  const type = await getTypeById(o.type_id);
  if (!type) return json({ error: 'deleted' }, 404);
  const relIds = type.properties.filter((d) => d.kind === 'relation').flatMap((d) => relationIds(o.properties[d.key]));
  const titles = Object.fromEntries(Object.values(await getSummaries(relIds)).map((s) => [s.id, s.title]));
  return json({
    id: o.id,
    title: o.type_id === 'type_day' ? dayLabel(o.title) : o.title || 'Untitled',
    type: { name: type.name, icon: type.icon, color: type.color },
    props: type.properties
      .map((d) => ({ label: d.label, text: displayValue(d, o.properties[d.key], titles) }))
      .filter((p) => p.text)
      .slice(0, 3),
    excerpt: o.text_content.slice(0, 220),
  });
};
