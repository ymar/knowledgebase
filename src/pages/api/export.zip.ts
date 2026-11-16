import type { APIRoute } from 'astro';
import { strToU8, zipSync } from 'fflate';
import { exportAll } from '../../lib/db';
import { frontMatter, toMarkdown } from '../../lib/markdown';
import type { PropertyDef } from '../../lib/schema';

const fileSafe = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120) || 'Untitled';

/** One Markdown file per live object, in a folder per type, with properties as front matter. */
export const GET: APIRoute = async ({ url }) => {
  const { types, objects, links } = await exportAll();
  const typeById = new Map(types.map((t) => [t.id as string, t]));
  const live = objects.filter((o) => !o.deleted_at);
  const title = new Map(live.map((o) => [o.id as string, String(o.title || 'Untitled')]));
  const titleOf = (id: string, fallback: string) => title.get(id) ?? fallback;

  const tagsOf = new Map<string, string[]>();
  for (const l of links as { source_id: string; target_id: string }[]) {
    const target = live.find((o) => o.id === l.target_id);
    if (target?.type_id !== 'type_tag') continue;
    tagsOf.set(l.source_id, [...new Set([...(tagsOf.get(l.source_id) ?? []), String(target.title)])]);
  }

  const files: Record<string, Uint8Array> = {};
  const used = new Set<string>();
  for (const o of live) {
    const type = typeById.get(o.type_id as string);
    const folder = fileSafe(String(type?.name ?? 'Other'));
    let name = fileSafe(String(o.title || 'Untitled'));
    let path = `${folder}/${name}.md`;
    for (let i = 2; used.has(path.toLowerCase()); i++) path = `${folder}/${name} ${i}.md`;
    used.add(path.toLowerCase());

    const defs = (type?.properties ?? []) as PropertyDef[];
    const props = (o.properties ?? {}) as Record<string, unknown>;
    const fields: Record<string, unknown> = { id: o.id, type: type?.name, title: o.title, created: o.created_at, updated: o.updated_at };
    for (const d of defs) {
      const v = props[d.key];
      fields[d.label] = d.kind === 'relation' && typeof v === 'string' ? (title.get(v) ? `[[${title.get(v)}]]` : null) : v;
    }
    fields.tags = tagsOf.get(o.id as string) ?? [];
    files[path] = strToU8(frontMatter(fields) + toMarkdown((o.content ?? []) as unknown[], titleOf, url.origin));
  }

  const zip = zipSync(files, { level: 6 });
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(zip, {
    headers: {
      'content-type': 'application/zip',
      'content-disposition': `attachment; filename="cairn-markdown-${stamp}.zip"`,
      'cache-control': 'no-store',
    },
  });
};
