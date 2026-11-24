/**
 * Custom editor blocks:
 * - objectCard: an object shown as a card (small or wide). Counts as a link (see doc.ts).
 * - query: a saved view's results, live, as a list.
 * Both pick their target inline when first inserted.
 */
import { createReactBlockSpec } from '@blocknote/react';
import { createContext, useContext, useEffect, useState } from 'react';
import { TypeTile } from './TypeTile';

/** The document's workspace, so pickers only offer objects and views from it. */
export const EditorEnv = createContext<{ workspaceId: string }>({ workspaceId: '' });

interface Hit {
  id: string;
  title: string;
  type_name: string;
  type_icon: string;
  type_color: string;
}
interface CardData {
  id: string;
  title: string;
  type: { name: string; icon: string; color: string };
  props: { label: string; text: string }[];
  excerpt: string;
}
interface ViewHit {
  id: string;
  name: string;
  type_name: string;
  type_icon: string;
  type_color: string;
}
interface QueryData {
  view: { id: string; name: string };
  type: { name: string; icon: string; color: string; slug: string };
  href: string;
  total: number;
  items: { id: string; title: string; icon: string; color: string; emoji?: string | null; meta: string[]; group?: string; lines?: string[] }[];
}

const shell = 'not-prose my-1 w-full select-none rounded-xl border border-line bg-card';

function useJson<T>(url: string | null): { data: T | null; missing: boolean } {
  const [state, setState] = useState<{ data: T | null; missing: boolean }>({ data: null, missing: false });
  useEffect(() => {
    if (!url) return;
    let live = true;
    fetch(url)
      .then(async (r) => (r.ok ? setState({ data: (await r.json()) as T, missing: false }) : live && setState({ data: null, missing: true })))
      .catch(() => live && setState({ data: null, missing: true }));
    return () => {
      live = false;
    };
  }, [url]);
  return state;
}

/* ---------- object card ---------- */

function ObjectPicker({ onPick }: { onPick: (id: string) => void }) {
  const { workspaceId } = useContext(EditorEnv);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setTimeout(async () => {
      const r = await fetch(`/api/search?ws=${encodeURIComponent(workspaceId)}&q=${encodeURIComponent(q)}`).catch(() => null);
      if (r?.ok) {
        setHits((await r.json()) as Hit[]);
        setActive(0);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [q, workspaceId]);
  return (
    <div className={`${shell} p-2`} contentEditable={false}>
      <input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, hits.length - 1)); }
          if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
          if (e.key === 'Enter' && hits[active]) { e.preventDefault(); onPick(hits[active].id); }
        }}
        placeholder="Which object? Type to search…"
        aria-label="Object to show as a card"
        className="w-full rounded-lg bg-transparent px-2 py-1.5 text-[15px] outline-none"
      />
      <ul className="mt-1 max-h-60 overflow-y-auto">
        {hits.map((h, i) => (
          <li key={h.id}>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); onPick(h.id); }} onMouseMove={() => setActive(i)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm ${i === active ? 'bg-hover' : ''}`}>
              <TypeTile icon={h.type_icon} color={h.type_color} size={20} />
              <span className="flex-1 truncate">{h.title || 'Untitled'}</span>
              <span className="text-xs text-muted">{h.type_name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ObjectCardView({ objectId, size, onPick, onToggleSize }: { objectId: string; size: string; onPick: (id: string) => void; onToggleSize: () => void }) {
  const { data, missing } = useJson<CardData>(objectId ? `/api/objects/${objectId}/card` : null);
  if (!objectId) return <ObjectPicker onPick={onPick} />;
  if (missing) return <div className={`${shell} px-4 py-3 text-sm text-muted`} contentEditable={false}>This object was deleted.</div>;
  if (!data) return <div className={`${shell} h-16 animate-pulse`} contentEditable={false} />;
  const wide = size !== 'small';
  return (
    <div className={`${shell} group relative ${wide ? '' : 'max-w-xs'}`} contentEditable={false} data-object-card={data.id}>
      <a href={`/o/${data.id}`} className="block p-3.5 hover:bg-hover/50" onClick={(e) => { e.preventDefault(); window.location.href = `/o/${data.id}`; }}>
        <span className="flex items-center gap-2.5">
          <TypeTile icon={data.type.icon} color={data.type.color} size={wide ? 26 : 22} />
          <span className="min-w-0">
            <span className="block truncate font-semibold">{data.title}</span>
            <span className="block text-xs text-muted">{data.type.name}</span>
          </span>
        </span>
        {wide && data.props.length > 0 && (
          <span className="mt-2.5 flex flex-wrap gap-1.5">
            {data.props.map((p) => (
              <span key={p.label} className="rounded-md bg-panel px-1.5 py-0.5 text-xs text-muted" title={p.label}>{p.text}</span>
            ))}
          </span>
        )}
        {wide && data.excerpt && <span className="mt-2 line-clamp-2 block text-sm text-ink/70">{data.excerpt}</span>}
      </a>
      <button type="button" onClick={onToggleSize}
        className="absolute right-2 top-2 rounded-md border border-line bg-card px-1.5 py-0.5 text-[11px] text-muted opacity-0 transition hover:text-ink group-hover:opacity-100 focus:opacity-100">
        {wide ? 'Small' : 'Wide'}
      </button>
    </div>
  );
}

export const ObjectCardBlock = createReactBlockSpec(
  { type: 'objectCard', propSchema: { objectId: { default: '' }, size: { default: 'wide' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <ObjectCardView
        objectId={block.props.objectId}
        size={block.props.size}
        onPick={(id) => editor.updateBlock(block, { props: { objectId: id } })}
        onToggleSize={() => editor.updateBlock(block, { props: { size: block.props.size === 'small' ? 'wide' : 'small' } })}
      />
    ),
  },
);

/* ---------- query ---------- */

function ViewPicker({ onPick }: { onPick: (id: string) => void }) {
  const { workspaceId } = useContext(EditorEnv);
  const { data } = useJson<ViewHit[]>(`/api/views?ws=${encodeURIComponent(workspaceId)}`);
  return (
    <div className={`${shell} p-2`} contentEditable={false}>
      <p className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted">Show a saved view</p>
      {data && data.length === 0 && (
        <p className="px-2 py-2 text-sm text-muted">
          No saved views yet. On a type page, set filters under “Filter and sort” and choose “Save view”.
        </p>
      )}
      <ul>
        {(data ?? []).map((v) => (
          <li key={v.id}>
            <button type="button" onMouseDown={(e) => { e.preventDefault(); onPick(v.id); }}
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-hover">
              <TypeTile icon={v.type_icon} color={v.type_color} size={20} />
              <span className="flex-1 truncate">{v.name}</span>
              <span className="text-xs text-muted">{v.type_name}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function QueryView({ viewId, onPick }: { viewId: string; onPick: (id: string) => void }) {
  const { data, missing } = useJson<QueryData>(viewId ? `/api/views/${viewId}/results` : null);
  if (!viewId) return <ViewPicker onPick={onPick} />;
  if (missing) return <div className={`${shell} px-4 py-3 text-sm text-muted`} contentEditable={false}>This saved view was deleted.</div>;
  if (!data) return <div className={`${shell} h-24 animate-pulse`} contentEditable={false} />;
  const go = (href: string) => (e: React.MouseEvent) => { e.preventDefault(); window.location.href = href; };
  return (
    <div className={shell} contentEditable={false} data-query={data.view.id}>
      <div className="flex items-center gap-2.5 border-b border-line px-3.5 py-2.5">
        <TypeTile icon={data.type.icon} color={data.type.color} size={22} />
        <span className="flex-1 truncate text-sm font-semibold">{data.view.name}</span>
        <a href={data.href} onClick={go(data.href)} className="text-xs text-muted hover:text-ink">Open {data.type.name.toLowerCase()} list →</a>
      </div>
      {data.items.length === 0 ? (
        <p className="px-3.5 py-3 text-sm text-muted">Nothing matches right now.</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.items.map((o, i) => (
            <li key={`${o.group ?? ''}:${o.id}`}>
              {o.group !== undefined && o.group !== data.items[i - 1]?.group && (
                <p className="bg-panel/60 px-3.5 pb-1 pt-2 text-xs font-semibold text-muted">{o.group}</p>
              )}
              <a href={`/o/${o.id}`} onClick={go(`/o/${o.id}`)} className="flex items-center gap-3 px-3.5 py-2 text-[15px] hover:bg-hover/60">
                {o.emoji ? <TypeTile icon={o.emoji} color="transparent" size={20} /> : <TypeTile icon={o.icon} color={o.color} size={20} />}
                <span className="flex-1 truncate">{o.title}</span>
                {o.meta.map((m) => (
                  <span key={m} className="hidden max-w-[10rem] truncate rounded-md bg-panel px-1.5 py-0.5 text-xs text-muted sm:inline">{m}</span>
                ))}
              </a>
              {o.lines && (
                <ul className="space-y-1 px-3.5 pb-2.5 pl-[2.9rem]">
                  {o.lines.map((l) => <li key={l} className="border-l-2 border-line pl-2.5 text-sm text-ink/80">{l}</li>)}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
      {data.total > data.items.length && (
        <a href={data.href} onClick={go(data.href)} className="block border-t border-line px-3.5 py-2 text-xs text-muted hover:text-ink">Show all →</a>
      )}
    </div>
  );
}

export const QueryBlock = createReactBlockSpec(
  { type: 'query', propSchema: { viewId: { default: '' } }, content: 'none' },
  {
    render: ({ block, editor }) => (
      <QueryView viewId={block.props.viewId} onPick={(id) => editor.updateBlock(block, { props: { viewId: id } })} />
    ),
  },
);
