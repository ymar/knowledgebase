import { getTypeById, type SavedView, type ViewSpec } from './db';
import { runQuery } from './query-run';
import { readListParams } from './list-params';
import { displayValue } from './property-display';
import type { PropertyDef } from './schema';
import { dayLabel } from './format';

/** URL query string for a spec, the same parameters the type page reads. */
export function specToQuery(spec: ViewSpec): string {
  const q = new URLSearchParams();
  if (spec.show && spec.show !== 'all') q.set('show', spec.show);
  for (const f of spec.filters ?? []) {
    q.append('f', f.key);
    q.append('op', f.op);
    q.append('v', f.value);
  }
  if (spec.sort && spec.sort.key !== 'updated') {
    q.set('sort', spec.sort.key);
    q.set('dir', spec.sort.dir);
  }
  if (spec.collection) q.set('collection', spec.collection);
  if (spec.view) q.set('view', spec.view);
  for (const t of spec.also ?? []) q.append('also', t);
  for (const t of spec.tags ?? []) q.append('tag', t);
  if (spec.links) q.set('links', spec.links);
  if (spec.words) q.set('q', spec.words);
  if (spec.group) q.set('group', spec.group);
  if (spec.limit) q.set('limit', String(spec.limit));
  if (spec.random) q.set('random', '1');
  if (spec.blocks) q.set('blocks', '1');
  return q.toString();
}

/** A spec from a type page query string, validated against the type's properties. */
export function specFromQuery(qs: string, defs: PropertyDef[]): ViewSpec {
  const p = readListParams(new URL(`http://x/?${qs.replace(/^\?/, '')}`), defs);
  return {
    show: p.show, filters: p.filters, sort: p.sort, view: p.view, collection: p.collection,
    also: p.also.length ? p.also : undefined, tags: p.tags.length ? p.tags : undefined, links: p.links, words: p.words,
    group: p.group, limit: p.limit, random: p.random || undefined, blocks: p.blocks || undefined,
  };
}

export interface ViewResult {
  view: { id: string; name: string };
  type: { name: string; icon: string; color: string; slug: string };
  href: string;
  total: number;
  items: { id: string; title: string; icon: string; color: string; emoji?: string | null; meta: string[]; group?: string; lines?: string[] }[];
}

/** Live results of a saved view, for the editor's Query block. Grouped views list items under their group. */
export async function viewResults(view: SavedView, limit = 25): Promise<ViewResult | null> {
  const type = await getTypeById(view.type_id);
  if (!type) return null;
  const s = view.spec;
  const params = {
    show: s.show ?? 'all', filters: s.filters ?? [], sort: s.sort ?? { key: 'updated', dir: 'desc' as const }, collection: s.collection,
    also: s.also ?? [], tags: s.tags ?? [], links: s.links, words: s.words, group: s.group, limit: s.limit,
    random: !!s.random, blocks: !!s.blocks,
  };
  const run = await runQuery(view.workspace_id, type, params, limit + 1);
  const toItem = (o: (typeof run.items)[number], group?: string) => ({
    id: o.id,
    title: o.type_id === 'type_day' ? dayLabel(o.title) : o.title || 'Untitled',
    icon: o.type_icon,
    color: o.type_color,
    emoji: o.icon,
    meta: type.properties.map((d) => displayValue(d, o.properties[d.key], run.relTitles)).filter(Boolean).slice(0, 2),
    group,
    lines: o.lines?.length ? o.lines : undefined,
  });
  const items = run.groups
    ? run.groups.flatMap((g) => g.items.map((o) => toItem(o, g.label)))
    : run.items.map((o) => toItem(o));
  return {
    view: { id: view.id, name: view.name },
    type: { name: type.name, icon: type.icon, color: type.color, slug: type.slug },
    href: `/t/${type.slug}?${specToQuery(view.spec)}&sv=${view.id}`,
    total: Math.max(run.items.length, items.length),
    items: items.slice(0, limit),
  };
}
