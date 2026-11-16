import { getSummaries, getTypeById, queryObjects, type SavedView, type ViewSpec } from './db';
import { readListParams } from './list-params';
import { displayValue } from './property-display';
import { relationIds, type PropertyDef } from './schema';
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
  return q.toString();
}

/** A spec from a type page query string, validated against the type's properties. */
export function specFromQuery(qs: string, defs: PropertyDef[]): ViewSpec {
  const p = readListParams(new URL(`http://x/?${qs.replace(/^\?/, '')}`), defs);
  return { show: p.show, filters: p.filters, sort: p.sort, view: p.view, collection: p.collection };
}

export interface ViewResult {
  view: { id: string; name: string };
  type: { name: string; icon: string; color: string; slug: string };
  href: string;
  total: number;
  items: { id: string; title: string; icon: string; color: string; meta: string[] }[];
}

/** Live results of a saved view, for the editor's Query block. */
export async function viewResults(view: SavedView, limit = 25): Promise<ViewResult | null> {
  const type = await getTypeById(view.type_id);
  if (!type) return null;
  const rows = await queryObjects({
    ws: view.workspace_id,
    typeId: type.id,
    defs: type.properties,
    show: view.spec.show,
    filters: view.spec.filters,
    sort: view.spec.sort,
    collectionId: view.spec.collection,
    limit: limit + 1,
  });
  const relIds = rows.flatMap((o) => type.properties.filter((d) => d.kind === 'relation').flatMap((d) => relationIds(o.properties[d.key])));
  const titles = Object.fromEntries(Object.values(await getSummaries([...new Set(relIds)])).map((s) => [s.id, s.title]));
  return {
    view: { id: view.id, name: view.name },
    type: { name: type.name, icon: type.icon, color: type.color, slug: type.slug },
    href: `/t/${type.slug}?${specToQuery(view.spec)}&sv=${view.id}`,
    total: rows.length,
    items: rows.slice(0, limit).map((o) => ({
      id: o.id,
      title: o.type_id === 'type_day' ? dayLabel(o.title) : o.title || 'Untitled',
      icon: o.type_icon,
      color: o.type_color,
      meta: type.properties.map((d) => displayValue(d, o.properties[d.key], titles)).filter(Boolean).slice(0, 2),
    })),
  };
}
