import { relationIds, type PropertyDef, type PropertyValue } from './schema';

/** Short display text for a property value in lists and cards. Empty string = nothing to show. */
export function displayValue(def: PropertyDef, v: PropertyValue | undefined, titles: Record<string, string> = {}): string {
  if (v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0)) return '';
  switch (def.kind) {
    case 'checkbox':
      return v === true ? `✓ ${def.label}` : '';
    case 'multiselect':
      return Array.isArray(v) ? v.join(', ') : String(v);
    case 'date':
      return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
        .format(new Date(`${v}T00:00:00Z`));
    case 'url':
      try {
        return new URL(String(v)).host.replace(/^www\./, '');
      } catch {
        return String(v);
      }
    case 'relation':
      return relationIds(v).map((id) => titles[id]).filter(Boolean).join(', ');
    default:
      return String(v);
  }
}
