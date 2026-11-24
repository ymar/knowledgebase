import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TypeTile } from './TypeTile';

interface PaletteType {
  id: string;
  name: string;
  slug: string;
  icon: string;
  color: string;
}
interface Hit {
  id: string;
  title: string;
  type_id: string;
  type_name: string;
  type_icon: string;
  type_color: string;
  snippet: string;
}
interface Action {
  key: string;
  group: string;
  label: string;
  detail?: string;
  snippet?: string;
  icon: { icon: string; color: string };
  run: () => void | Promise<void>;
}

const DAY = 'type_day';

function dayLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));
}

/** Renders an FTS snippet, where matches are wrapped in \u0002 … \u0003. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(\u0002[^\u0003]*\u0003)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('\u0002') ? (
          <mark key={i} className="rounded bg-transparent font-semibold text-ink">{p.slice(1, -1)}</mark>
        ) : (
          <span key={i}>{p}</span>
        ),
      )}
    </>
  );
}

interface PaletteWorkspace {
  id: string;
  name: string;
  color: string;
}

export default function CommandPalette({
  types,
  workspaces = [],
  currentWorkspace,
  taskTypeId,
}: {
  types: PaletteType[];
  workspaces?: PaletteWorkspace[];
  currentWorkspace?: string;
  /** The workspace's Task type, if on: enables Cmd/Ctrl+Shift+T. */
  taskTypeId?: string | null;
}) {
  const [mode, setMode] = useState<'search' | 'task' | 'capture'>('search');
  const taskMode = mode === 'task';
  const captureMode = mode === 'capture';
  /** Lines captured since the palette opened (capture mode stays open for the next one). */
  const [captured, setCaptured] = useState<string[]>([]);
  const [captureError, setCaptureError] = useState(false);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [recent, setRecent] = useState(true);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const lastFocus = useRef<Element | null>(null);

  const show = useCallback(() => {
    lastFocus.current = document.activeElement;
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    setMode('search');
    setCaptured([]);
    setCaptureError(false);
    setQ('');
    (lastFocus.current as HTMLElement | null)?.focus?.();
  }, []);

  // Cmd/Ctrl+K anywhere, plus any [data-open-palette] button.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl+Shift+T: quick-add a task from anywhere (Capacities' shortcut).
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.key.toLowerCase() === 't' && taskTypeId) {
        e.preventDefault();
        e.stopPropagation();
        setMode('task');
        if (!open) show();
        return;
      }
      // Cmd/Ctrl+Shift+. (period): capture a line to today's note.
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && !e.altKey && e.code === 'Period') {
        e.preventDefault();
        e.stopPropagation();
        setMode('capture');
        if (!open) show();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'k') {
        setMode('search');
        // Capture phase + stop: Cmd+K is the palette everywhere, including inside the
        // editor (BlockNote's own Mod+K link shortcut; links stay in the formatting toolbar).
        e.preventDefault();
        e.stopPropagation();
        if (open) hide();
        else show();
      }
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element).closest?.('[data-quick-task]') && taskTypeId) {
        e.preventDefault();
        setMode('task');
        show();
        return;
      }
      if ((e.target as Element).closest?.('[data-quick-capture]')) {
        e.preventDefault();
        setMode('capture');
        show();
        return;
      }
      if ((e.target as Element).closest?.('[data-open-palette]')) {
        e.preventDefault();
        show();
      }
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('click', onClick);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('click', onClick);
    };
  }, [open, show, hide]);

  useEffect(() => {
    if (open) requestAnimationFrame(() => input.current?.focus());
  }, [open]);

  // Debounced search; the newest request wins.
  useEffect(() => {
    if (!open) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/palette?q=${encodeURIComponent(q)}`, { signal: ctrl.signal });
        const data = (await res.json()) as { hits: Hit[]; recent: boolean };
        setHits(data.hits);
        setRecent(data.recent);
        setActive(0);
      } catch {
        /* aborted or offline */
      }
    }, q ? 120 : 0);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q, open]);

  const actions = useMemo<Action[]>(() => {
    const out: Action[] = [];
    if (captureMode) {
      const text = q.trim();
      const day = types.find((t) => t.id === DAY);
      if (text) {
        out.push({
          key: 'capture',
          group: 'Add to today',
          label: text,
          detail: 'Enter to add · [[Title]] links',
          icon: day ?? { icon: 'calendar', color: '#78716c' },
          run: async () => {
            setCaptureError(false);
            // Today's note open in an editor claims it (see Editor), else the server appends.
            const detail: { text: string; workspaceId?: string; done?: Promise<boolean> } = { text, workspaceId: currentWorkspace };
            const claimed = !window.dispatchEvent(new CustomEvent('kb:capture', { detail, cancelable: true }));
            const ok = claimed
              ? await (detail.done ?? Promise.resolve(false))
              : await fetch('/api/capture', {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ text, workspaceId: currentWorkspace }),
                }).then((r) => r.ok, () => false);
            if (!ok) return setCaptureError(true);
            setCaptured((c) => [...c, text]);
            setQ('');
          },
        });
      }
      return out;
    }
    if (taskMode) {
      const title = q.trim();
      const task = types.find((t) => t.id === taskTypeId);
      if (title && task && taskTypeId) {
        out.push({
          key: 'quick-task',
          group: 'New task',
          label: title,
          detail: 'Enter to add · ! to !!! priority · today, tomorrow, a weekday',
          icon: task,
          run: async () => {
            const res = await fetch('/api/objects', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ typeId: taskTypeId, title, workspaceId: currentWorkspace }),
            });
            if (res.ok) {
              setQ('');
              hide();
              if (location.pathname === '/tasks' || location.pathname === '/' || location.pathname.startsWith('/day/')) location.reload();
            }
          },
        });
      }
      return out;
    }
    const go = (url: string) => () => void (window.location.href = url);
    for (const h of hits) {
      out.push({
        key: `o:${h.id}`,
        group: recent ? 'Recently opened' : 'Objects',
        label: h.type_id === DAY ? dayLabel(h.title) : h.title || 'Untitled',
        detail: h.type_name,
        snippet: h.snippet,
        icon: { icon: h.type_icon, color: h.type_color },
        run: go(`/o/${h.id}`),
      });
    }
    const query = q.trim();
    const lower = query.toLowerCase();
    const day = types.find((t) => t.id === DAY);
    if (!query || 'capture'.startsWith(lower) || 'add to today'.startsWith(lower) || (lower.length > 2 && 'quick capture'.includes(lower))) {
      out.push({
        key: 'mode:capture',
        group: 'Commands',
        label: 'Capture to today',
        detail: '⌘⇧.',
        icon: day ?? { icon: 'calendar', color: '#78716c' },
        run: () => {
          setMode('capture');
          setQ('');
          input.current?.focus();
        },
      });
    }
    if (day && (!query || 'today'.startsWith(lower))) {
      out.push({ key: 'today', group: 'Go to', label: 'Today', icon: day, run: go('/') });
    }
    for (const t of types) {
      if (!query || t.name.toLowerCase().startsWith(lower)) {
        out.push({ key: `t:${t.id}`, group: 'Go to', label: t.name, detail: 'Type', icon: t, run: go(`/t/${t.slug}`) });
      }
    }
    for (const w of workspaces) {
      if (w.id === currentWorkspace) continue;
      const label = `Switch to ${w.name}`;
      if (!query || label.toLowerCase().includes(lower) || w.name.toLowerCase().startsWith(lower)) {
        out.push({
          key: `w:${w.id}`,
          group: 'Workspaces',
          label,
          icon: { icon: '●', color: w.color },
          run: async () => {
            await fetch('/api/workspaces/switch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: w.id }) });
            window.location.href = '/';
          },
        });
      }
    }
    for (const [choice, label, icon] of [['light', 'Light theme', 'sun'], ['dark', 'Dark theme', 'moon'], ['system', 'System theme', 'monitor']] as const) {
      if (query && (label.toLowerCase().includes(lower) || ('theme'.startsWith(lower) && lower.length > 1) || (lower === 'mode'))) {
        out.push({
          key: `theme:${choice}`,
          group: 'Appearance',
          label,
          icon: { icon, color: '#78716c' },
          run: () => {
            (window as unknown as { kbSetTheme?: (c: string) => void }).kbSetTheme?.(choice);
            hide();
          },
        });
      }
    }
    for (const [label, url, icon] of [['Tasks', '/tasks', 'check-square'], ['Workspaces', '/workspaces', 'users'], ['Types', '/types', 'sliders'], ['Trash', '/trash', 'archive'], ['Export', '/export', 'download']]) {
      if (query && label.toLowerCase().startsWith(lower)) {
        out.push({ key: `p:${url}`, group: 'Go to', label, detail: 'Page', icon: { icon, color: '#78716c' }, run: go(url) });
      }
    }
    if (query) {
      for (const t of types) {
        if (t.id === DAY) continue;
        out.push({
          key: `c:${t.id}`,
          group: 'Create',
          label: `New ${t.name.toLowerCase()} “${query}”`,
          icon: t,
          run: async () => {
            const res = await fetch('/api/objects', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify({ typeId: t.id, title: query }),
            });
            if (res.ok) window.location.href = `/o/${((await res.json()) as { id: string }).id}`;
          },
        });
      }
    }
    return out;
  }, [hits, recent, q, types, workspaces, currentWorkspace, hide, taskMode, captureMode, taskTypeId]);

  const run = useCallback(
    async (a: Action | undefined) => {
      if (!a || busy) return;
      setBusy(true);
      try {
        await a.run();
      } finally {
        setBusy(false);
      }
    },
    [busy],
  );

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || (e.ctrlKey && e.key === 'n')) {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, actions.length - 1));
    } else if (e.key === 'ArrowUp' || (e.ctrlKey && e.key === 'p')) {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void run(actions[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      hide();
    }
  };

  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/25 px-3 pt-[8vh] backdrop-blur-[2px] sm:pt-[14vh]"
      onMouseDown={(e) => e.target === e.currentTarget && hide()}>
      <div role="dialog" aria-modal="true" aria-label="Search and commands"
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-card shadow-2xl" onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 border-b border-line px-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted" aria-hidden="true">
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={taskMode ? 'New task… try “Call the bank !! friday”' : captureMode ? 'Add a line to today’s note…' : 'Search, jump to, or create…'}
            aria-label={captureMode ? 'Capture to today' : taskMode ? 'New task' : 'Search'}
            aria-controls="palette-list"
            aria-activedescendant={actions[active] ? `pal-${active}` : undefined}
            role="combobox"
            aria-expanded="true"
            className="h-14 flex-1 bg-transparent text-base text-ink placeholder:text-muted focus:outline-none focus-visible:outline-none"
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden sm:inline">esc</kbd>
        </div>
        <ul ref={list} id="palette-list" role="listbox" className="max-h-[60vh] overflow-y-auto p-2">
          {captureMode && actions.length === 0 && (
            <li className="px-3 py-5 text-sm text-muted" role="presentation">
              {captureError
                ? <span className="text-red-600">Couldn’t save that. Try again.</span>
                : captured.length
                  ? <span role="status">Added to today: {captured.length === 1 ? `“${captured[0]}”` : `${captured.length} lines`}. Type the next one, or Esc to close.</span>
                  : <>Type a thought, press Enter. It lands at the bottom of today’s note. <kbd>[[</kbd> links an object, <kbd>- [ ]</kbd> makes a checkbox.</>}
            </li>
          )}
          {captureMode && captureError && actions.length > 0 && (
            <li className="px-3 pb-1 pt-2 text-sm text-red-600" role="alert">Couldn’t save that. Try again.</li>
          )}
          {!captureMode && actions.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No matches.</li>}
          {actions.map((a, i) => {
            const header = a.group !== lastGroup ? a.group : null;
            lastGroup = a.group;
            return (
              <li key={a.key} role="presentation">
                {header && <p className="eyebrow px-3 pb-1 pt-3 first:pt-1">{header}</p>}
                <div
                  id={`pal-${i}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={() => void run(a)}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 ${i === active ? 'bg-hover' : ''}`}
                >
                  <span className="mt-0.5"><TypeTile icon={a.icon.icon} color={a.icon.color} size={22} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-[15px] font-medium">{a.label}</span>
                      {a.detail && <span className="shrink-0 text-xs text-muted">{a.detail}</span>}
                    </span>
                    {a.snippet && (
                      <span className="mt-0.5 line-clamp-2 block text-[13px] leading-snug text-muted"><Snippet text={a.snippet} /></span>
                    )}
                  </span>
                  {i === active && <kbd className="mt-0.5 hidden sm:inline">↵</kbd>}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
