/**
 * BlockNote JSON -> Markdown, for export. Lossy by design: colors and alignment
 * are dropped; mentions become [[wiki links]]; tables become GFM tables.
 */

const isListType = (t: string) => /ListItem$/.test(t);

type Styles = Record<string, unknown>;
interface Inline {
  type: string;
  text?: string;
  styles?: Styles;
  href?: string;
  content?: Inline[] | string;
  props?: Record<string, unknown>;
}
interface Block {
  type: string;
  props?: Record<string, unknown>;
  content?: Inline[] | { type: 'tableContent'; rows: { cells: (Inline[] | { content?: Inline[] })[] }[] } | string;
  children?: Block[];
}

export type TitleOf = (id: string, fallback: string, typeId: string) => string;

function styled(text: string, s: Styles = {}): string {
  if (!text) return '';
  if (s.code) return `\`${text.replace(/`/g, '\\`')}\``;
  let t = text.replace(/([*_~`[\]\\])/g, '\\$1');
  if (s.bold) t = `**${t}**`;
  if (s.italic) t = `*${t}*`;
  if (s.strike) t = `~~${t}~~`;
  return t;
}

function inline(items: Inline[] | string | undefined, titleOf: TitleOf): string {
  if (!items) return '';
  if (typeof items === 'string') return styled(items);
  return items
    .map((it) => {
      if (it.type === 'text') return styled(it.text ?? '', it.styles);
      if (it.type === 'link') return `[${inline(it.content, titleOf)}](${it.href ?? ''})`;
      if (it.type === 'mention') {
        const typeId = String(it.props?.typeId ?? '');
        const title = titleOf(String(it.props?.id ?? ''), String(it.props?.title ?? ''), typeId);
        return typeId === 'type_tag' ? `#${title.replace(/\s+/g, '-')}` : `[[${title}]]`;
      }
      return '';
    })
    .join('');
}

function absolute(url: unknown, origin: string): string {
  const u = String(url ?? '');
  return u.startsWith('/') ? origin + u : u;
}

interface Chunk {
  md: string;
  list: boolean;
  type: string;
  depth: number;
}

function blocks(list: Block[], titleOf: TitleOf, origin: string, depth = 0): Chunk[] {
  const out: Chunk[] = [];
  const pad = '  '.repeat(depth);
  let n = 0;
  for (const b of list) {
    n = b.type === 'numberedListItem' ? n + 1 : 0;
    const text = Array.isArray(b.content) || typeof b.content === 'string' ? inline(b.content as Inline[], titleOf) : '';
    const p = b.props ?? {};
    let line: string;
    switch (b.type) {
      case 'heading':
        line = `${'#'.repeat(Math.min(Number(p.level ?? 1), 6))} ${text}`;
        break;
      case 'bulletListItem':
      case 'toggleListItem':
        line = `- ${text}`;
        break;
      case 'numberedListItem':
        line = `${n}. ${text}`;
        break;
      case 'checkListItem':
        line = `- [${p.checked ? 'x' : ' '}] ${text}`;
        break;
      case 'quote':
        line = `> ${text}`;
        break;
      case 'codeBlock': {
        const raw = Array.isArray(b.content) ? b.content.map((i) => i.text ?? '').join('') : '';
        line = `\`\`\`${p.language && p.language !== 'text' ? p.language : ''}\n${raw}\n\`\`\``;
        break;
      }
      case 'divider':
        line = '---';
        break;
      case 'image':
        line = `![${String(p.caption || p.name || '')}](${absolute(p.url, origin)})`;
        break;
      case 'file':
      case 'audio':
      case 'video':
        line = `[${String(p.name || p.caption || 'file')}](${absolute(p.url, origin)})`;
        break;
      case 'table': {
        const t = b.content as { rows?: { cells: (Inline[] | { content?: Inline[] })[] }[] };
        const rows = (t?.rows ?? []).map((r) =>
          r.cells.map((c) => inline(Array.isArray(c) ? c : c.content, titleOf).replace(/\|/g, '\\|').replace(/\n/g, ' ')),
        );
        if (!rows.length) {
          line = '';
          break;
        }
        const width = Math.max(...rows.map((r) => r.length));
        const fmt = (r: string[]) => `| ${Array.from({ length: width }, (_, i) => r[i] ?? '').join(' | ')} |`;
        line = [fmt(rows[0]), `|${' --- |'.repeat(width)}`, ...rows.slice(1).map(fmt)].join('\n');
        break;
      }
      default:
        line = text;
    }
    out.push({ md: line.split('\n').map((l) => pad + l).join('\n'), list: isListType(b.type), type: b.type, depth });
    if (b.children?.length) out.push(...blocks(b.children, titleOf, origin, depth + 1));
  }
  return out;
}

export function toMarkdown(doc: unknown[], titleOf: TitleOf, origin: string): string {
  // List items of one list stay tight (nested items too); anything else, including a
  // switch between list kinds at the same depth, gets a blank line.
  const chunks = blocks(doc as Block[], titleOf, origin);
  const tight = (prev: Chunk, cur: Chunk) =>
    prev.list && cur.list && (cur.depth !== prev.depth || cur.type === prev.type);
  const md = chunks.map((c, i) => (i === 0 ? '' : tight(chunks[i - 1], c) ? '\n' : '\n\n') + c.md).join('');
  return md.trim() + '\n';
}

const yamlString = (v: unknown) => JSON.stringify(v ?? null);

export function frontMatter(fields: Record<string, unknown>): string {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0))
    .map(([k, v]) => (Array.isArray(v) ? `${k}:\n${v.map((x) => `  - ${yamlString(x)}`).join('\n')}` : `${k}: ${yamlString(v)}`));
  return `---\n${lines.join('\n')}\n---\n\n`;
}

