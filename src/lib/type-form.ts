import type { PropertyDef, PropertyKind } from './schema';
import { TYPE_COLORS, TYPE_ICONS } from './icons';

export const KINDS: Record<PropertyKind, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  url: 'Link',
  checkbox: 'Checkbox',
  select: 'Select',
  multiselect: 'Multi-select',
  relation: 'Relation',
};

export const slugify = (s: string) =>
  s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

const keyify = (s: string) =>
  s.normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'field';

/**
 * Reads the type editor form. Rows are parallel arrays (one entry per row for
 * every field). Existing properties keep their key, so renaming a label never
 * orphans stored values. New keys come from the label, made unique.
 */
export function parseTypeForm(form: FormData, existing: PropertyDef[], validSlugs: Set<string>) {
  const name = String(form.get('name') ?? '').trim().slice(0, 60);
  const iconIn = String(form.get('icon') ?? '');
  const colorIn = String(form.get('color') ?? '');
  const icon = TYPE_ICONS.includes(iconIn) ? iconIn : 'file-text';
  const color = TYPE_COLORS.includes(colorIn) ? colorIn : TYPE_COLORS[0];

  const keys = form.getAll('p_key').map(String);
  const labels = form.getAll('p_label').map(String);
  const kinds = form.getAll('p_kind').map(String);
  const options = form.getAll('p_options').map(String);
  const targets = form.getAll('p_target').map(String);
  const multiples = form.getAll('p_multiple').map(String);
  const existingKeys = new Set(existing.map((d) => d.key));

  const used = new Set<string>(['title']);
  const properties: PropertyDef[] = [];
  labels.forEach((rawLabel, i) => {
    const label = rawLabel.trim().slice(0, 60);
    if (!label) return;
    const kind = (kinds[i] in KINDS ? kinds[i] : 'text') as PropertyKind;
    let key = existingKeys.has(keys[i]) ? keys[i] : keyify(label);
    if (used.has(key)) {
      let n = 2;
      while (used.has(`${key}_${n}`)) n++;
      key = `${key}_${n}`;
    }
    used.add(key);
    const def: PropertyDef = { key, label, kind };
    if (kind === 'select' || kind === 'multiselect') {
      def.options = [...new Set((options[i] ?? '').split(',').map((o) => o.trim()).filter(Boolean))].slice(0, 50);
    }
    if (kind === 'relation' && validSlugs.has(targets[i])) def.target = targets[i];
    if (kind === 'relation' && multiples[i] === 'many') def.multiple = true;
    properties.push(def);
  });
  // Daily notes: which date property ties this type to a day. Matched by the row's key (existing) or label (new).
  const dayIn = String(form.get('day_key') ?? '');
  const dayProp = properties.find((p) => p.kind === 'date' && (p.key === dayIn || p.label === dayIn));
  const dayKey = dayProp && /^[A-Za-z0-9_]+$/.test(dayProp.key) ? dayProp.key : null;
  return { name, icon, color, properties, dayKey };
}
