import type { PropertyDef, PropertyValue } from './schema';

/** Short display text for a property value in lists and cards. */
export function displayValue(def: PropertyDef, v: PropertyValue | undefined, titles: Record<string, string> = {}): string {
  if (v === null || v === undefined || v === '') return '';
  switch (def.kind) {
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
      return titles[String(v)] ?? '';
    default:
      return String(v);
  }
}
