import type { PropertyDef, PropertyValue } from './schema';
import { parseTime } from './format';

/** Turns submitted form fields into clean property values, driven by the type definition. */
export function parsePropertyForm(defs: PropertyDef[], form: FormData): Record<string, PropertyValue> {
  const out: Record<string, PropertyValue> = {};
  for (const def of defs) {
    const all = form.getAll(`p_${def.key}`).map((v) => (typeof v === 'string' ? v.trim() : '')).filter(Boolean);

    // Kinds that hold several values or a boolean.
    if (def.kind === 'checkbox') {
      // The form sends a hidden "false" plus "true" when ticked.
      out[def.key] = all.includes('true');
      continue;
    }
    if (def.kind === 'multiselect') {
      out[def.key] = [...new Set(all.filter((v) => def.options?.includes(v)))];
      continue;
    }
    if (def.kind === 'relation' && def.multiple) {
      out[def.key] = [...new Set(all)];
      continue;
    }

    const s = all[0] ?? '';
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
      case 'time':
        out[def.key] = parseTime(s);
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
