/**
 * Pure helpers over BlockNote document JSON. Used on the server to derive
 * text_content, outgoing links and backlink context. No BlockNote import:
 * the stored shape is plain JSON.
 */

import { dayLabel } from './format';

export const MENTION = 'mention';
export const OBJECT_CARD = 'objectCard';
export const QUERY_BLOCK = 'query';
export const BLOCK_REF = 'blockRef';

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
  walk(blocks, (b) => {
    inlineItems(b).forEach((i) => mentionsIn(i, ids));
    // Object card blocks link to their object, like a mention.
    if ((b.type === OBJECT_CARD || b.type === BLOCK_REF) && typeof b.props?.objectId === 'string' && b.props.objectId) ids.add(b.props.objectId);
  });
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

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Turns the first plain-text occurrence of `title` (case-insensitive, whole
 * words) into a mention. Table cells are left alone. Returns a new document,
 * or null if there is no such occurrence.
 */
export function linkFirstOccurrence(blocks: Block[], title: string, mention: MentionProps): Block[] | null {
  const t = title.trim();
  if (!t) return null;
  const re = new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(t)}(?![\\p{L}\\p{N}])`, 'iu');
  const doc = structuredClone(blocks);
  let done = false;

  const visit = (list: Block[]) => {
    for (const b of list) {
      if (done) return;
      if (Array.isArray(b.content)) {
        const items = b.content;
        for (let i = 0; i < items.length && !done; i++) {
          const it = items[i];
          if (it.type !== 'text' || !it.text) continue;
          const m = re.exec(it.text);
          if (!m) continue;
          const before = it.text.slice(0, m.index);
          const after = it.text.slice(m.index + m[0].length);
          const parts: Inline[] = [];
          if (before) parts.push({ ...it, text: before });
          parts.push({ type: MENTION, props: { ...mention }, content: undefined } as Inline);
          if (after) parts.push({ ...it, text: after });
          items.splice(i, 1, ...parts);
          done = true;
        }
      }
      if (b.children?.length) visit(b.children);
    }
  };
  visit(doc);
  return done ? doc : null;
}

/** Points every mention of `fromId` at `to` instead. Returns a new document. */
export function replaceMentions(blocks: Block[], fromId: string, to: MentionProps): Block[] {
  const doc = structuredClone(blocks);
  const fix = (items: Inline[]) => {
    for (const it of items) {
      if (it.type === MENTION && it.props?.id === fromId) it.props = { ...it.props, ...to };
      else if (it.type === 'link' && Array.isArray(it.content)) fix(it.content);
    }
  };
  walk(doc, (b) => inlineItems(b).forEach(fix));
  return doc;
}

export interface ChecklistItem { blockId: string; text: string }

/** Unticked checklist items (any depth) with their block ids. */
export function openChecklistItems(blocks: Block[], title?: TitleLookup): ChecklistItem[] {
  const out: ChecklistItem[] = [];
  walk(blocks, (b) => {
    if (b.type === 'checkListItem' && !b.props?.checked && b.id) {
      const text = blockText(b, title).trim();
      if (text) out.push({ blockId: b.id, text });
    }
  });
  return out;
}

/** Copy of the document with one checklist item ticked or unticked; null if the block isn't there. */
export function setChecklistItem(blocks: Block[], blockId: string, checked: boolean): Block[] | null {
  let found = false;
  const map = (list: Block[]): Block[] =>
    list.map((b) => {
      const next = { ...b, children: b.children ? map(b.children) : b.children };
      if (b.id === blockId && b.type === 'checkListItem') {
        found = true;
        next.props = { ...(b.props ?? {}), checked };
      }
      return next;
    });
  const out = map(blocks);
  return found ? out : null;
}
