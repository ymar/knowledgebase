/**
 * Runs a type-page query or saved view: several types, tag / link / word filters, grouping,
 * a limit or random sample, and optionally the matching blocks of each result. Shared by the
 * type page and the editor's Query block so both show the same thing.
 */
import { getSummaries, listTypes, parseJson, queryObjects } from './db';
import { blockText, type Block } from './doc';
import { dayLabel } from './format';
import { displayValue } from './property-display';
import type { ListParams } from './list-params';
import { relationIds, type ObjectCard, type PropertyDef, type TypeRow } from './schema';

export type QueryParams = Pick<ListParams, 'show' | 'filters' | 'sort' | 'collection' | 'also' | 'tags' | 'links' | 'words' | 'group' | 'limit' | 'random' | 'blocks'>;
export type QueryItem = ObjectCard & { lines?: string[] };
export interface QueryGroup { label: string; items: QueryItem[] }
export interface QueryRun {
  items: QueryItem[];
  /** Set when grouping: the same items, in groups (an item may sit in several for multi-value properties). */
  groups: QueryGroup[] | null;
  /** Types the query covers (the page's own first). */
  types: TypeRow[];
  /** Titles of related objects, for property display. */
  relTitles: Record<string, string>;
}

/** True when a query has any of the newer options (shown as "More" on the type page). */
export const hasMore = (p: QueryParams) =>
  p.also.length > 0 || p.tags.length > 0 || !!p.links || !!p.words || !!p.group || !!p.limit || p.random || p.blocks;

export async function runQuery(ws: string, type: TypeRow, p: QueryParams, cap?: number): Promise<QueryRun> {
  const wsTypes = await listTypes(ws, { includeDisabled: true });
  const also = wsTypes.filter((t) => p.also.includes(t.id) && t.id !== type.id);
  const linkedTo = [...p.tags, ...(p.links ? [p.links] : [])];
  const limit = Math.min(p.limit ?? 500, cap ?? 500);
  const rows = await queryObjects({
    ws, typeId: type.id, defs: type.properties, show: p.show, filters: p.filters, sort: p.sort,
    collectionId: p.collection, alsoTypeIds: also.map((t) => t.id), linkedTo, words: p.words,
    random: p.random, limit, withContent: p.blocks,
  });

  // Matching blocks: lines that mention a tag / the linked object, or contain every word.
  let items: QueryItem[] = rows;
  if (p.blocks && (linkedTo.length || p.words)) {
    const docs = rows.map((r) => parseJson<Block[]>(r.content, []));
    const mentioned = new Set<string>();
    docs.forEach((d) => walk(d, (b) => inlineIds(b).forEach((id) => mentioned.add(id))));
    const titles = await getSummaries([...mentioned]);
    const words = (p.words ?? '').toLowerCase().split(/\s+/).filter(Boolean);
    items = rows.map((r, i) => {
      const lines: string[] = [];
      walk(docs[i], (b) => {
        if (lines.length >= 4) return;
        const text = blockText(b, (id) => titles[id]?.title).trim();
        if (!text) return;
        const ids = inlineIds(b);
        const hit = linkedTo.some((id) => ids.includes(id)) || (words.length > 0 && words.every((w) => text.toLowerCase().includes(w)));
        if (hit) lines.push(text.length > 280 ? `${text.slice(0, 277)}…` : text);
      });
      const { content: _c, ...rest } = r;
      return { ...rest, lines };
    });
  } else {
    items = rows.map(({ content: _c, ...rest }) => rest);
  }

  const defs = type.properties;
  const relIds = items.flatMap((o) => defs.filter((d) => d.kind === 'relation').flatMap((d) => relationIds(o.properties[d.key])));
  const relTitles = Object.fromEntries(Object.values(await getSummaries([...new Set(relIds)])).map((s) => [s.id, s.type_id === 'type_day' ? dayLabel(s.title) : s.title]));

  let groups: QueryGroup[] | null = null;
  if (p.group) {
    const def = defs.find((d) => d.key === p.group);
    const byLabel = new Map<string, QueryItem[]>();
    const none = p.group === 'type' ? '' : `No ${def?.label.toLowerCase() ?? 'value'}`;
    for (const o of items) {
      for (const label of groupLabels(o, p.group, def, relTitles, none)) byLabel.set(label, [...(byLabel.get(label) ?? []), o]);
    }
    const order = def?.kind === 'select' ? def.options ?? [] : [];
    groups = [...byLabel].map(([label, list]) => ({ label, items: list }))
      .sort((a, b) => rank(a.label, order, none) - rank(b.label, order, none));
  }
  return { items, groups, types: [type, ...also], relTitles };
}

function groupLabels(o: ObjectCard, key: string, def: PropertyDef | undefined, titles: Record<string, string>, none: string): string[] {
  if (key === 'type') return [o.type_name];
  if (!def) return [none];
  const v = o.properties[def.key];
  if (def.kind === 'checkbox') return [v === true ? def.label : `Not ${def.label.toLowerCase()}`];
  if (def.kind === 'multiselect') return Array.isArray(v) && v.length ? v.map(String) : [none];
  if (def.kind === 'relation') {
    const ids = relationIds(v).filter((id) => titles[id]);
    return ids.length ? ids.map((id) => titles[id]) : [none];
  }
  const text = displayValue(def, v ?? null, titles);
  return [text || none];
}

/** Select options keep their defined order; other labels sort by first appearance; the empty group goes last. */
function rank(label: string, order: string[], none: string): number {
  if (label === none) return 1e9;
  const i = order.indexOf(label);
  return i === -1 ? 1e6 : i;
}

function walk(blocks: Block[], fn: (b: Block) => void) {
  for (const b of blocks) {
    fn(b);
    if (b.children?.length) walk(b.children, fn);
  }
}

function inlineIds(b: Block): string[] {
  if (!Array.isArray(b.content)) return [];
  return b.content.flatMap((i) => {
    const x = i as { type?: string; props?: { id?: string } };
    return x.type === 'mention' && x.props?.id ? [x.props.id] : [];
  });
}
