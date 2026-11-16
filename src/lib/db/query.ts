import type { Filter, ObjectCard, ObjectSummary, PropertyDef, PropertyValue, Show, Sort } from '../schema';
import { db, parseJson } from './index';

const SAFE_KEY = /^[A-Za-z0-9_]+$/;
const BUILTIN_SORT: Record<string, string> = {
  updated: 'o.updated_at',
  created: 'o.created_at',
  title: 'o.title COLLATE NOCASE',
  opened: 'o.opened_at',
};

/** Expression + bindings reading one property, typed by its kind. */
function propExpr(def: PropertyDef): [string, unknown[]] {
  const path = `$."${def.key}"`;
  return def.kind === 'number'
    ? ['CAST(json_extract(o.properties, ?) AS REAL)', [path]]
    : ['json_extract(o.properties, ?)', [path]];
}

/**
 * Objects of one type, filtered and sorted. Every key is checked against the
 * type definition; every value is bound. Unknown keys are ignored.
 */
export async function queryObjects(opts: {
  typeId: string;
  defs: PropertyDef[];
  show?: Show;
  filters?: Filter[];
  sort?: Sort;
  limit?: number;
}): Promise<ObjectCard[]> {
  const where: string[] = ['o.type_id = ?', 'o.deleted_at IS NULL'];
  const args: unknown[] = [opts.typeId];
  const defs = new Map(opts.defs.filter((d) => SAFE_KEY.test(d.key)).map((d) => [d.key, d]));

  if (opts.show === 'untagged') {
    where.push(`NOT EXISTS (SELECT 1 FROM links l JOIN objects t ON t.id = l.target_id
      WHERE l.source_id = o.id AND t.type_id = 'type_tag' AND t.deleted_at IS NULL)`);
  } else if (opts.show === 'unlinked') {
    where.push(`NOT EXISTS (SELECT 1 FROM links l JOIN objects s ON s.id = l.source_id
      WHERE l.target_id = o.id AND s.deleted_at IS NULL)`);
  }

  for (const f of opts.filters ?? []) {
    let expr: string;
    let exprArgs: unknown[] = [];
    let kind: PropertyDef['kind'] = 'text';
    if (f.key === 'title') expr = 'o.title';
    else {
      const def = defs.get(f.key);
      if (!def) continue;
      [expr, exprArgs] = propExpr(def);
      kind = def.kind;
    }
    const v = f.value.trim();
    switch (f.op) {
      case 'empty':
        where.push(`(${expr} IS NULL OR ${expr} = '')`);
        args.push(...exprArgs, ...exprArgs);
        break;
      case 'not_empty':
        where.push(`(${expr} IS NOT NULL AND ${expr} != '')`);
        args.push(...exprArgs, ...exprArgs);
        break;
      case 'contains':
        if (!v) break;
        where.push(`${expr} LIKE ? ESCAPE '\\'`);
        args.push(...exprArgs, `%${v.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
        break;
      case 'is':
        if (!v) break;
        where.push(kind === 'number' ? `${expr} = ?` : `${expr} = ? COLLATE NOCASE`);
        args.push(...exprArgs, kind === 'number' ? Number(v) : v);
        break;
      case 'gt':
      case 'lt':
        if (!v) break;
        where.push(`${expr} ${f.op === 'gt' ? '>' : '<'} ?`);
        args.push(...exprArgs, kind === 'number' ? Number(v) : v);
        break;
    }
  }

  let order = 'o.updated_at DESC';
  const sort = opts.sort;
  if (sort) {
    const dir = sort.dir === 'asc' ? 'ASC' : 'DESC';
    const builtin = BUILTIN_SORT[sort.key];
    const def = defs.get(sort.key);
    if (builtin) order = `${builtin.split(' ')[0]} IS NULL, ${builtin} ${dir}, o.updated_at DESC`;
    else if (def) {
      const [expr, exprArgs] = propExpr(def);
      order = `${expr} IS NULL, ${expr} ${dir}, o.updated_at DESC`;
      args.push(...exprArgs, ...exprArgs);
    }
  }

  // ORDER BY bindings come after WHERE bindings in the statement, so push LIMIT last.
  const { results } = await db()
    .prepare(
      `SELECT o.id, o.type_id, o.title, o.updated_at, o.created_at, o.properties,
              substr(o.text_content, 1, 220) AS excerpt,
              t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color
       FROM objects o JOIN types t ON t.id = o.type_id
       WHERE ${where.join(' AND ')}
       ORDER BY ${order}
       LIMIT ?`,
    )
    .bind(...args, opts.limit ?? 500)
    .all<Omit<ObjectCard, 'properties'> & { properties: string }>();
  return results.map((r) => ({ ...r, properties: parseJson<Record<string, PropertyValue>>(r.properties, {}) }));
}

const SUMMARY = `
  SELECT o.id, o.type_id, o.title, o.updated_at,
         t.name AS type_name, t.slug AS type_slug, t.icon AS type_icon, t.color AS type_color
  FROM objects o JOIN types t ON t.id = o.type_id`;

export async function recentlyOpened(limit = 8, typeId?: string): Promise<ObjectSummary[]> {
  const typeFilter = typeId ? 'AND o.type_id = ?' : '';
  const { results } = await db()
    .prepare(`${SUMMARY} WHERE o.opened_at IS NOT NULL AND o.deleted_at IS NULL ${typeFilter} ORDER BY o.opened_at DESC LIMIT ?`)
    .bind(...(typeId ? [typeId] : []), limit)
    .all<ObjectSummary>();
  return results;
}

export async function listPinned(): Promise<ObjectSummary[]> {
  const { results } = await db()
    .prepare(`${SUMMARY} WHERE o.pinned_at IS NOT NULL AND o.deleted_at IS NULL ORDER BY o.pinned_at LIMIT 30`)
    .all<ObjectSummary>();
  return results;
}
