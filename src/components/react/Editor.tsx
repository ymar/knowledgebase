import '@blocknote/mantine/style.css';
import { BlockNoteSchema, createCodeBlockSpec, defaultBlockSpecs, defaultInlineContentSpecs } from '@blocknote/core';
import { filterSuggestionItems } from '@blocknote/core/extensions';
import {
  createReactInlineContentSpec,
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
  type DefaultReactSuggestionItem,
} from '@blocknote/react';
import { BlockNoteView } from '@blocknote/mantine';
import { codeBlockOptions, syntaxHighlighter } from '@blocknote/code-block';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { TypeTile } from './TypeTile';

export interface TypeInfo {
  id: string;
  name: string;
  icon: string;
  color: string;
  /** Turned-off types still render chips but aren't offered for inline create. */
  enabled?: boolean;
}
export interface RefInfo {
  title: string;
  typeId: string;
}
interface Summary {
  id: string;
  title: string;
  type_id: string;
  type_name: string;
  type_icon: string;
  type_color: string;
}

const TAG = 'type_tag';
const DAY = 'type_day';

const RefsContext = createContext<{ refs: Record<string, RefInfo>; types: Record<string, TypeInfo> }>({
  refs: {},
  types: {},
});

/* ---------- mention inline content ---------- */

const Mention = createReactInlineContentSpec(
  {
    type: 'mention',
    propSchema: { id: { default: '' }, title: { default: '' }, typeId: { default: '' } },
    content: 'none',
  },
  {
    render: ({ inlineContent }) => <MentionChip {...inlineContent.props} />,
  },
);

function MentionChip({ id, title, typeId }: { id: string; title: string; typeId: string }) {
  const { refs, types } = useContext(RefsContext);
  const live = refs[id];
  // The server passes every live mentioned object; inserts add to it. Absent = deleted.
  const missing = !live;
  const tId = live?.typeId ?? typeId;
  const t = types[tId];
  const label = live?.title ?? title;
  const isTag = tId === TAG;
  const shown = tId === DAY ? dayLabel(label) : label || 'Untitled';

  const open = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const url = `/o/${id}`;
    if (e.metaKey || e.ctrlKey) window.open(url, '_blank');
    else window.location.href = url;
  };

  return (
    <a
      href={`/o/${id}`}
      onClick={open}
      data-mention={id}
      className={`mention ${isTag ? 'mention-tag' : ''} ${missing ? 'mention-missing' : ''}`}
      style={{ ['--c' as string]: t?.color ?? '#78716c' }}
      title={missing ? 'Deleted object' : undefined}
    >
      {isTag ? <span aria-hidden="true">#</span> : t && <TypeTile icon={t.icon} color={t.color} size={16} />}
      <span>{shown}</span>
    </a>
  );
}

const schema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    codeBlock: createCodeBlockSpec(codeBlockOptions),
  },
  inlineContentSpecs: { ...defaultInlineContentSpecs, mention: Mention },
});

/* ---------- helpers ---------- */

const localIso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function dayLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  return new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${iso}T00:00:00Z`));
}

/** "today", "tomorrow", "yesterday" or an ISO date -> list of [label, iso]. */
function dateMatches(query: string): [string, string][] {
  const q = query.trim().toLowerCase();
  const shift = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return localIso(d);
  };
  const words: [string, string][] = [
    ['Today', shift(0)],
    ['Tomorrow', shift(1)],
    ['Yesterday', shift(-1)],
  ];
  if (/^\d{4}-\d{2}-\d{2}$/.test(q) && !Number.isNaN(Date.parse(q))) return [[dayLabel(q), q]];
  if (!q) return [words[0]];
  return words.filter(([w]) => w.toLowerCase().startsWith(q));
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

/** Uploads to R2 through the app; BlockNote stores the returned URL in the block. */
async function uploadFile(file: File): Promise<string> {
  const body = new FormData();
  body.append('file', file);
  const res = await fetch('/api/files', { method: 'POST', body });
  const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!res.ok || !data.url) {
    alert(data.error ?? 'Upload failed');
    throw new Error(data.error ?? 'Upload failed');
  }
  return data.url;
}

/** Effective theme: <html data-theme> if set, else the system preference. Updates live. */
function subscribeTheme(cb: () => void) {
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  mq.addEventListener('change', cb);
  return () => {
    mo.disconnect();
    mq.removeEventListener('change', cb);
  };
}
const readTheme = (): 'light' | 'dark' => {
  const forced = document.documentElement.dataset.theme;
  if (forced === 'light' || forced === 'dark') return forced;
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

/* ---------- editor ---------- */

type SaveState = 'saved' | 'dirty' | 'saving' | 'error';

export default function Editor(props: {
  saveUrl: string;
  initialContent: unknown[];
  refs: Record<string, RefInfo>;
  types: TypeInfo[];
  /** Object id of the document being edited, if it exists yet. Excluded from mention results. */
  selfId?: string | null;
  /** Workspace of the document. Search, inline create and date links stay inside it. */
  workspaceId: string;
  /** The workspace's Task type, if on: enables "Turn into task" in the / menu. */
  taskTypeId?: string | null;
  /** On a daily note: new tasks are planned for this day. */
  dayDate?: string;
}) {
  const wsq = `ws=${encodeURIComponent(props.workspaceId)}`;
  const typesById = useMemo(() => Object.fromEntries(props.types.map((t) => [t.id, t])), [props.types]);
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'light' as const);
  const [refs, setRefs] = useState(props.refs);

  const editor = useCreateBlockNote({
    schema,
    extensions: [syntaxHighlighter],
    uploadFile,
    initialContent: props.initialContent.length ? (props.initialContent as never) : undefined,
    placeholders: { emptyDocument: 'Start writing. Type @ to link, # to tag, / for blocks.', default: "Type '/' for blocks" },
  });

  /* autosave */
  const [state, setState] = useState<SaveState>('saved');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const pending = useRef(false);

  const save = useCallback(
    async (keepalive = false): Promise<void> => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (inFlight.current) {
        pending.current = true;
        return inFlight.current;
      }
      pending.current = false;
      setState('saving');
      const body = JSON.stringify({ content: editor.document });
      inFlight.current = fetch(props.saveUrl, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: keepalive && body.length < 60_000,
      })
        .then((r) => {
          if (!r.ok) throw new Error(String(r.status));
          setState(pending.current ? 'dirty' : 'saved');
        })
        .catch(() => {
          setState('error');
          timer.current = setTimeout(() => void save(), 4000);
        })
        .finally(() => {
          inFlight.current = null;
          if (pending.current) void save();
        });
      return inFlight.current;
    },
    [editor, props.saveUrl],
  );

  const onChange = useCallback(() => {
    setState('dirty');
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 800);
  }, [save]);

  useEffect(() => {
    const flush = () => {
      if (timer.current) void save(true);
    };
    const onHide = () => document.visibilityState === 'hidden' && flush();
    const onUnload = (e: BeforeUnloadEvent) => {
      if (timer.current || inFlight.current) {
        flush();
        e.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('beforeunload', onUnload);
    // Cmd/Ctrl+S saves now.
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('beforeunload', onUnload);
      window.removeEventListener('keydown', onKey);
    };
  }, [save]);

  /* mentions */
  const insertMention = useCallback(
    (s: Summary) => {
      setRefs((r) => ({ ...r, [s.id]: { title: s.title, typeId: s.type_id } }));
      editor.insertInlineContent([{ type: 'mention', props: { id: s.id, title: s.title, typeId: s.type_id } }, ' ']);
    },
    [editor],
  );

  /**
   * "/ Turn into task": the current line becomes a Task object (title = the line's text,
   * planned for this day on a daily note, done if it was a ticked checklist item) and the
   * line is replaced by a link to it, so the task shows in the day's task list.
   */
  const turnIntoTask = useCallback(async () => {
    if (!props.taskTypeId) return;
    const block = editor.getTextCursorPosition().block;
    const text = (Array.isArray(block.content) ? block.content : [])
      .map((c) => ('text' in c ? c.text : ''))
      .join('')
      .trim();
    if (!text) return;
    const s = await api<Summary>('/api/objects', {
      method: 'POST',
      body: JSON.stringify({ typeId: props.taskTypeId, title: text, workspaceId: props.workspaceId, date: props.dayDate }),
    });
    if (block.type === 'checkListItem' && (block.props as { checked?: boolean }).checked) {
      await fetch(`/api/objects/${s.id}/done`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ value: true }) });
    }
    setRefs((r) => ({ ...r, [s.id]: { title: s.title, typeId: s.type_id } }));
    editor.updateBlock(block, {
      type: 'paragraph',
      content: [{ type: 'mention', props: { id: s.id, title: s.title, typeId: s.type_id } }, ' '],
    } as never);
  }, [editor, props.taskTypeId, props.workspaceId, props.dayDate]);

  const taskItems: DefaultReactSuggestionItem[] = props.taskTypeId
    ? [{
        title: 'Turn into task',
        subtext: props.dayDate ? 'This line becomes a task planned for this day' : 'This line becomes a task',
        aliases: ['task', 'todo'],
        group: 'Tasks',
        icon: (() => {
          const t = typesById[props.taskTypeId!];
          return t ? <TypeTile icon={t.icon} color={t.color} size={22} /> : undefined;
        })(),
        onItemClick: () => void turnIntoTask(),
      }]
    : [];

  const toItem = useCallback(
    (s: Summary, group: string): DefaultReactSuggestionItem => ({
      title: s.type_id === DAY ? dayLabel(s.title) : s.title || 'Untitled',
      subtext: s.type_name,
      group,
      icon: <TypeTile icon={s.type_icon} color={s.type_color} size={22} />,
      onItemClick: () => insertMention(s),
    }),
    [insertMention],
  );

  const create = useCallback(
    async (typeId: string, title: string) => insertMention(await api<Summary>('/api/objects', { method: 'POST', body: JSON.stringify({ typeId, title, workspaceId: props.workspaceId }) })),
    [insertMention, props.workspaceId],
  );

  const getObjectItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const found = await api<Summary[]>(`/api/search?${wsq}&q=${encodeURIComponent(query)}`).catch(() => []);
      const items = found.filter((s) => s.id !== props.selfId && s.type_id !== DAY).map((s) => toItem(s, 'Objects'));

      const day = typesById[DAY];
      for (const [label, iso] of dateMatches(query)) {
        items.push({
          title: label,
          subtext: label.startsWith(iso.slice(0, 4)) ? 'Day' : dayLabel(iso),
          group: 'Days',
          icon: day ? <TypeTile icon={day.icon} color={day.color} size={22} /> : undefined,
          onItemClick: () => void api<Summary>(`/api/days/${iso}?${wsq}`, { method: 'POST' }).then(insertMention),
        });
      }

      const q = query.trim();
      if (q && !found.some((s) => s.title.toLowerCase() === q.toLowerCase())) {
        for (const t of props.types) {
          if (t.id === DAY || t.enabled === false) continue;
          items.push({
            title: `New ${t.name.toLowerCase()} “${q}”`,
            group: 'Create',
            icon: <TypeTile icon={t.icon} color={t.color} size={22} />,
            onItemClick: () => void create(t.id, q),
          });
        }
      }
      return items;
    },
    [props.selfId, props.types, typesById, toItem, insertMention, create, wsq],
  );

  const getTagItems = useCallback(
    async (query: string): Promise<DefaultReactSuggestionItem[]> => {
      const found = await api<Summary[]>(`/api/search?${wsq}&type=${TAG}&q=${encodeURIComponent(query)}`).catch(() => []);
      const items: DefaultReactSuggestionItem[] = found
        .filter((s) => s.id !== props.selfId)
        .map((s) => ({ ...toItem(s, 'Tags'), subtext: undefined }));
      const q = query.trim();
      const tag = typesById[TAG];
      if (q && !/\s/.test(q) && !found.some((s) => s.title.toLowerCase() === q.toLowerCase())) {
        items.push({
          title: `New tag “${q}”`,
          group: 'Create',
          icon: tag ? <TypeTile icon={tag.icon} color={tag.color} size={22} /> : undefined,
          onItemClick: () => void create(TAG, q),
        });
      }
      return items;
    },
    [props.selfId, typesById, toItem, create, wsq],
  );

  return (
    <RefsContext.Provider value={{ refs, types: typesById }}>
      <div className="editor-shell">
        <BlockNoteView editor={editor} onChange={onChange} slashMenu={false} theme={theme}>
          <SuggestionMenuController
            triggerCharacter="/"
            getItems={async (q) => filterSuggestionItems([...taskItems, ...getDefaultReactSlashMenuItems(editor)], q)}
          />
          <SuggestionMenuController triggerCharacter="@" getItems={getObjectItems} />
          <SuggestionMenuController triggerCharacter="[[" getItems={getObjectItems} />
          <SuggestionMenuController
            triggerCharacter="#"
            getItems={getTagItems}
            // Leave "# " at the start of a line to the heading shortcut.
            shouldOpen={(tr) => tr.selection.$from.parentOffset > 0}
          />
        </BlockNoteView>
        <p className="save-state" data-state={state} aria-live="polite">
          {state === 'saved' ? 'Saved' : state === 'saving' ? 'Saving…' : state === 'dirty' ? 'Editing' : 'Not saved, retrying'}
        </p>
      </div>
    </RefsContext.Provider>
  );
}
