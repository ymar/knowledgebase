/**
 * Pure helpers over BlockNote document JSON. Used on the server to derive
 * text_content, outgoing links and backlink context. No BlockNote import:
 * the stored shape is plain JSON.
 */

import { dayLabel } from './format';

export const MENTION = 'mention';

export interface MentionProps {
  id: string;
  title: string;
  typeId: string;
}

interface Inline {
  type: string;
  text?: string;
  href?: string;
  content?: Inline[] | string;
  props?: Partial<MentionProps> & Record<string, unknown>;
}

export interface Block {
  id?: string;
  type: string;
  props?: Record<string, unknown>;
  content?: Inline[] | TableContent | string;
  children?: Block[];
}

interface TableContent {
  type: 'tableContent';
  rows: { cells: (Inline[] | { content?: Inline[] })[] }[];
}

type TitleLookup = (id: string) => string | undefined;

/** How a mention reads in snippets: "#tag", "Tue 17 Nov 2026", or the title. */
function displayMention(title: string, typeId: string): string {
  if (typeId === 'type_tag') return `#${title}`;
  if (typeId === 'type_day') return dayLabel(title);
  return title;
}

function inlineToText(items: Inline[], title?: TitleLookup): string {
  let out = '';
  for (const it of items) {
    if (it.type === 'text') out += it.text ?? '';
    else if (it.type === 'link') out += Array.isArray(it.content) ? inlineToText(it.content, title) : String(it.content ?? '');
    else if (it.type === MENTION) {
      const id = String(it.props?.id ?? '');
      const t = title?.(id) ?? String(it.props?.title ?? '');
      out += title ? displayMention(t, String(it.props?.typeId ?? '')) : t;
    }
  }
  return out;
}

function inlineItems(block: Block): Inline[][] {
  const c = block.content;
  if (!c) return [];
  if (typeof c === 'string') return [[{ type: 'text', text: c }]];
  if (Array.isArray(c)) return [c];
  if (c.type === 'tableContent') {
    return c.rows.flatMap((r) => r.cells.map((cell) => (Array.isArray(cell) ? cell : cell.content ?? [])));
  }
  return [];
}

/** Text of one block (not its children). Table cells are joined with " | ". */
export function blockText(block: Block, title?: TitleLookup): string {
  return inlineItems(block).map((i) => inlineToText(i, title)).join(' | ');
}

function walk(blocks: Block[], fn: (b: Block) => void): void {
  for (const b of blocks) {
    fn(b);
    if (b.children?.length) walk(b.children, fn);
  }
}

/** Plain text of the whole document, one line per block, for FTS. */
export function extractText(blocks: Block[]): string {
  const lines: string[] = [];
  walk(blocks, (b) => {
    const t = blockText(b).trim();
    if (t) lines.push(t);
  });
  return lines.join('\n');
}

function mentionsIn(items: Inline[], out: Set<string>): void {
  for (const it of items) {
    if (it.type === MENTION && typeof it.props?.id === 'string' && it.props.id) out.add(it.props.id);
    else if (it.type === 'link' && Array.isArray(it.content)) mentionsIn(it.content, out);
  }
}

/** Distinct object ids mentioned anywhere in the document. */
export function extractMentionIds(blocks: Block[]): string[] {
  const ids = new Set<string>();
  walk(blocks, (b) => inlineItems(b).forEach((i) => mentionsIn(i, ids)));
  return [...ids];
}

export interface Snippet {
  before: string;
  match: string;
  after: string;
}

/**
 * The blocks in `blocks` that mention `targetId`, as text split around the first
 * mention, trimmed to roughly `radius` characters on each side.
 */
export function mentionContexts(blocks: Block[], targetId: string, lookup?: TitleLookup, radius = 120): Snippet[] {
  const title: TitleLookup = (id) => lookup?.(id);
  const out: Snippet[] = [];
  walk(blocks, (b) => {
    for (const items of inlineItems(b)) {
      const ids = new Set<string>();
      mentionsIn(items, ids);
      if (!ids.has(targetId)) continue;
      // Split at the first top-level mention of the target.
      const idx = items.findIndex((i) => i.type === MENTION && i.props?.id === targetId);
      if (idx === -1) {
        out.push({ before: inlineToText(items, title), match: '', after: '' });
        continue;
      }
      const before = inlineToText(items.slice(0, idx), title);
      const match = inlineToText([items[idx]], title);
      const after = inlineToText(items.slice(idx + 1), title);
      out.push({
        before: before.length > radius ? `…${before.slice(-radius).trimStart()}` : before,
        match,
        after: after.length > radius ? `${after.slice(0, radius).trimEnd()}…` : after,
      });
    }
  });
  return out;
}

export const isDocument = (v: unknown): v is Block[] =>
  Array.isArray(v) && v.every((b) => b && typeof b === 'object' && typeof (b as Block).type === 'string');
