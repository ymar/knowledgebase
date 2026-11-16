/**
 * Plain Markdown -> BlockNote blocks, for text written through MCP. Handles headings,
 * bullet / numbered / check lists, quotes, fenced code and paragraphs, with **bold**,
 * *italic* and `code`. [[Title]] becomes a mention when an object with that title exists
 * in the workspace (otherwise it stays text). Indented list items nest one level.
 */
import type { Block } from './doc';
import { findByTitles } from './db';

type Inline = { type: string; text?: string; styles?: Record<string, boolean>; props?: Record<string, string> };

function styledRuns(text: string): Inline[] {
  const out: Inline[] = [];
  const re = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|_[^_\s][^_]*_)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index! > last) out.push({ type: 'text', text: text.slice(last, m.index), styles: {} });
    const t = m[0];
    if (t.startsWith('**')) out.push({ type: 'text', text: t.slice(2, -2), styles: { bold: true } });
    else if (t.startsWith('`')) out.push({ type: 'text', text: t.slice(1, -1), styles: { code: true } });
    else out.push({ type: 'text', text: t.slice(1, -1), styles: { italic: true } });
    last = m.index! + t.length;
  }
  if (last < text.length) out.push({ type: 'text', text: text.slice(last), styles: {} });
  return out;
}

function inline(text: string, links: Record<string, { id: string; title: string; type_id: string }>): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of text.matchAll(/\[\[([^\]]+)\]\]/g)) {
    if (m.index! > last) out.push(...styledRuns(text.slice(last, m.index)));
    const hit = links[m[1].trim().toLowerCase()];
    if (hit) out.push({ type: 'mention', props: { id: hit.id, title: hit.title, typeId: hit.type_id } });
    else out.push({ type: 'text', text: m[1], styles: {} });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(...styledRuns(text.slice(last)));
  return out;
}

export async function markdownToBlocks(md: string, ws: string): Promise<Block[]> {
  const titles = [...md.matchAll(/\[\[([^\]]+)\]\]/g)].map((m) => m[1]);
  const links = await findByTitles(ws, titles);
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  const mk = (type: string, text: string, props: Record<string, unknown> = {}): Block =>
    ({ type, props, content: inline(text, links) as unknown as Block['content'], children: [] }) as Block;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();
    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      blocks.push({ type: 'codeBlock', props: { language: fence[1] || 'text' }, content: [{ type: 'text', text: code.join('\n'), styles: {} }] as unknown as Block['content'], children: [] } as Block);
      continue;
    }

    const indent = raw.match(/^(\s{2,}|\t)/) && blocks.length && /ListItem$/.test(blocks[blocks.length - 1].type);
    const t = line.trim();
    let b: Block;
    let m: RegExpMatchArray | null;
    if ((m = t.match(/^(#{1,3})\s+(.*)$/))) b = mk('heading', m[2], { level: m[1].length });
    else if ((m = t.match(/^[-*]\s+\[( |x|X)\]\s+(.*)$/))) b = mk('checkListItem', m[2], { checked: m[1].toLowerCase() === 'x' });
    else if ((m = t.match(/^[-*]\s+(.*)$/))) b = mk('bulletListItem', m[1]);
    else if ((m = t.match(/^\d+[.)]\s+(.*)$/))) b = mk('numberedListItem', m[1]);
    else if ((m = t.match(/^>\s?(.*)$/))) b = mk('quote', m[1]);
    else b = mk('paragraph', t);

    if (indent) blocks[blocks.length - 1].children = [...(blocks[blocks.length - 1].children ?? []), b];
    else blocks.push(b);
    i++;
  }
  return blocks;
}
