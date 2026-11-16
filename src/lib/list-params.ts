import type { Filter, FilterOp, PropertyDef, Show, Sort } from './schema';

export const OPS: Record<FilterOp, string> = {
  is: 'is',
  contains: 'contains',
  gt: 'is after / more than',
  lt: 'is before / less than',
  empty: 'is empty',
  not_empty: 'is not empty',
};
export const SORTS = { updated: 'Last edited', created: 'Created', title: 'Title', opened: 'Last opened' } as const;

export interface ListParams {
  show: Show;
  filters: Filter[];
  sort: Sort;
  view: 'list' | 'cards';
  /** Collection id, if filtering to one. */
  collection?: string;
}

/** Reads type-page state from the URL; the view falls back to a cookie, then 'list'. */
export function readListParams(url: URL, defs: PropertyDef[], cookieView?: string): ListParams {
  const sp = url.searchParams;
  const keys = new Set(['title', ...defs.map((d) => d.key)]);
  const fs = sp.getAll('f');
  const ops = sp.getAll('op');
  const vs = sp.getAll('v');
  const filters: Filter[] = [];
  fs.forEach((key, i) => {
    const op = ops[i] as FilterOp;
    if (!keys.has(key) || !(op in OPS)) return;
    const value = vs[i] ?? '';
    if (!value.trim() && op !== 'empty' && op !== 'not_empty') return;
    filters.push({ key, op, value });
  });
  const show = (['all', 'untagged', 'unlinked'] as const).find((s) => s === sp.get('show')) ?? 'all';
  const sortKey = sp.get('sort') ?? 'updated';
  const sort: Sort = {
    key: sortKey in SORTS || defs.some((d) => d.key === sortKey) ? sortKey : 'updated',
    dir: sp.get('dir') === 'asc' ? 'asc' : sp.get('dir') === 'desc' ? 'desc' : sortKey === 'title' ? 'asc' : 'desc',
  };
  const raw = sp.get('view') ?? cookieView;
  const collection = sp.get('collection') ?? undefined;
  return { show, filters, sort, view: raw === 'cards' ? 'cards' : 'list', collection: collection || undefined };
}

/** Same page with some params replaced. */
export function withParams(url: URL, changes: Record<string, string | null>): string {
  const next = new URL(url);
  for (const [k, v] of Object.entries(changes)) {
    if (v === null) next.searchParams.delete(k);
    else next.searchParams.set(k, v);
  }
  return `${next.pathname}${next.search}`;
}
