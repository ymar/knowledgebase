export type PropertyKind = 'text' | 'number' | 'date' | 'url' | 'checkbox' | 'select' | 'multiselect' | 'relation';

export interface PropertyDef {
  key: string;
  label: string;
  kind: PropertyKind;
  /** select and multiselect */
  options?: string[];
  /** relation only: slug of the target type */
  target?: string;
  /** relation only: holds several objects (value is an id array) */
  multiple?: boolean;
}

/** Ids held by a relation value, single or multiple. */
export const relationIds = (v: unknown): string[] =>
  (Array.isArray(v) ? v : [v]).filter((x): x is string => typeof x === 'string' && x !== '');

export interface TypeRow {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  properties: PropertyDef[];
  sort_order: number;
  /** BlockNote JSON new objects start with. */
  template: unknown[];
  /** Owning workspace; null for the shared system types (Day, Tag). */
  workspace_id: string | null;
  /** Turned on in its workspace. System types are always on. */
  enabled: boolean;
  /** Key of the date property that ties this type to daily notes (quick add + date references); null = off. */
  day_key: string | null;
}

/** checkbox: boolean; multiselect and multi-relation: string[]. */
export type PropertyValue = string | number | boolean | string[] | null;

export interface ObjectRow {
  id: string;
  type_id: string;
  title: string;
  properties: Record<string, PropertyValue>;
  content: unknown[];
  text_content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  opened_at: string | null;
  workspace_id: string;
  pinned_at: string | null;
}

/** Light row for lists, search results, pickers. */
export interface ObjectSummary {
  id: string;
  type_id: string;
  title: string;
  updated_at: string;
  type_name: string;
  type_slug: string;
  type_icon: string;
  type_color: string;
}

export type LinkOrigin = 'content' | 'tag' | 'property';

export const DAY_TYPE_ID = 'type_day';
export const TAG_TYPE_ID = 'type_tag';

/* ---------- type page queries ---------- */

export type FilterOp = 'is' | 'contains' | 'gt' | 'lt' | 'empty' | 'not_empty';
export interface Filter {
  /** 'title' or a property key of the type */
  key: string;
  op: FilterOp;
  value: string;
}
export type Show = 'all' | 'untagged' | 'unlinked';
export interface Sort {
  /** 'updated' | 'created' | 'title' | 'opened' or a property key */
  key: string;
  dir: 'asc' | 'desc';
}
export interface ObjectCard extends ObjectSummary {
  properties: Record<string, PropertyValue>;
  excerpt: string;
  created_at: string;
}
