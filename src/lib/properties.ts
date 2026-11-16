import type { PropertyDef, PropertyValue } from './schema';

/** Turns submitted form fields into clean property values, driven by the type definition. */
export function parsePropertyForm(defs: PropertyDef[], form: FormData): Record<string, PropertyValue> {
  const out: Record<string, PropertyValue> = {};
  for (const def of defs) {
    const raw = form.get(`p_${def.key}`);
    const s = typeof raw === 'string' ? raw.trim() : '';
    if (s === '') {
      out[def.key] = null;
      continue;
    }
    switch (def.kind) {
      case 'number': {
        const n = Number(s);
        out[def.key] = Number.isFinite(n) ? n : null;
        break;
      }
      case 'date':
        out[def.key] = /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
        break;
      case 'url':
        out[def.key] = /^https?:\/\//i.test(s) ? s : `https://${s}`;
        break;
      case 'select':
        out[def.key] = def.options?.includes(s) ? s : null;
        break;
      default:
        out[def.key] = s;
    }
  }
  return out;
}
