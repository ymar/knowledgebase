export type PropertyKind = 'text' | 'number' | 'date' | 'url' | 'select' | 'relation';

export interface PropertyDef {
  key: string;
  label: string;
  kind: PropertyKind;
  /** select only */
  options?: string[];
  /** relation only: slug of the target type */
  target?: string;
}

export interface TypeRow {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
  properties: PropertyDef[];
  sort_order: number;
}

export type PropertyValue = string | number | null;

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
