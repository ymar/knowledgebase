/**
 * KB as an MCP server: tools to search, read and write (no deletes) the knowledge base.
 * Served statelessly at /mcp (see src/pages/mcp.ts); a fresh server per request.
 * All data access goes through the typed DB layer.
 */
import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import {
  allTasks, completeTask, createObject, findDay, getBacklinks, getObject, getOrCreateDay, getSummaries,
  getTypeById, isTaskType, listObjectsByType, listTypes, listWorkspaces, pickedTags, saveContent,
  saveProperties, searchFullText, renameObject, taskTypeIdFor, tasksForDay, dateReferences,
} from '../db';
import type { Workspace } from '../db';
import type { Block } from '../doc';
import { toMarkdown } from '../markdown';
import { markdownToBlocks } from '../from-markdown';
import { displayValue } from '../property-display';
import { parsePropertyForm } from '../properties';
import { parseTaskTitle } from '../task-logic';
import { dayLabel, isIsoDay, todayIn } from '../format';
import { relationIds, type PropertyDef, type PropertyValue, type TypeRow } from '../schema';

const text = (s: string) => ({ content: [{ type: 'text' as const, text: s }] });
const fail = (s: string) => ({ content: [{ type: 'text' as const, text: s }], isError: true });

const wsArg = z.string().optional().describe('Workspace name, e.g. "Personal" or "Work". Defaults to the first workspace.');

async function resolveWorkspace(name?: string): Promise<Workspace> {
  const all = await listWorkspaces();
  if (!name) return all[0];
  const w = all.find((x) => x.name.toLowerCase() === name.trim().toLowerCase() || x.id === name);
  if (!w) throw new Error(`No workspace "${name}". Workspaces: ${all.map((x) => x.name).join(', ')}`);
  return w;
}

async function resolveType(ws: string, name: string): Promise<TypeRow> {
  const types = await listTypes(ws, { includeDisabled: true });
  const n = name.trim().toLowerCase();
  const t = types.find((x) => x.name.toLowerCase() === n || x.slug === n || x.id === name);
  if (!t) throw new Error(`No type "${name}". Types: ${types.filter((x) => x.enabled).map((x) => x.name).join(', ')}`);
  return t;
}

/** Property values from MCP (keyed by key or label) -> clean values, via the same parser as the form. */
function coerceProperties(defs: PropertyDef[], input: Record<string, unknown>): Record<string, PropertyValue> {
  const fd = new FormData();
  const touched = new Set<string>();
  for (const [k, v] of Object.entries(input)) {
    const def = defs.find((d) => d.key === k || d.label.toLowerCase() === k.toLowerCase());
    if (!def) continue;
    touched.add(def.key);
    const name = `p_${def.key}`;
    const list = Array.isArray(v) ? v : [v];
    if (def.kind === 'checkbox') fd.append(name, v === true || v === 'true' ? 'true' : 'false');
    else for (const x of list) if (x !== null && x !== undefined) fd.append(name, String(x));
  }
  const parsed = parsePropertyForm(defs, fd);
  return Object.fromEntries(Object.entries(parsed).filter(([k]) => touched.has(k)));
}

async function describeObject(id: string, origin: string): Promise<string> {
  const o = await getObject(id);
  if (!o) throw new Error(`No object with id ${id}`);
  const type = await getTypeById(o.type_id);
  const ids = (type?.properties ?? []).filter((d) => d.kind === 'relation').flatMap((d) => relationIds(o.properties[d.key]));
  const titles = Object.fromEntries(Object.values(await getSummaries(ids)).map((s) => [s.id, s.title]));
  const props = (type?.properties ?? [])
    .map((d) => [d.label, displayValue(d, o.properties[d.key], titles)] as const)
    .filter(([, v]) => v);
  const [tags, backlinks] = await Promise.all([pickedTags(o.id), getBacklinks(o.id, o.title)]);
  const title = o.type_id === 'type_day' ? dayLabel(o.title) : o.title;
  const lines = [
    `# ${title || 'Untitled'}`,
    `id: ${o.id} · type: ${type?.name ?? '?'} · url: ${origin}/o/${o.id}`,
    ...props.map(([k, v]) => `${k}: ${v}`),
    tags.length ? `Tags: ${tags.map((t) => `#${t.title}`).join(' ')}` : '',
    '',
    toMarkdown(o.content as unknown[], (rid, fallback) => fallback || rid, origin).trim(),
  ];
  if (backlinks.length) {
    lines.push('', '## Linked from');
    for (const b of backlinks.slice(0, 30)) lines.push(`- ${b.source.type_id === 'type_day' ? dayLabel(b.source.title) : b.source.title || 'Untitled'} (${b.source.type_name}, id ${b.source.id})${b.snippets[0] ? `: “${(b.snippets[0].before + b.snippets[0].match + b.snippets[0].after).trim()}”` : ''}`);
  }
  return lines.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n');
}

export function buildMcpServer(opts: { origin: string; timeZone: string }): McpServer {
  const { origin } = opts;
  const today = () => todayIn(opts.timeZone);
  const server = new McpServer({ name: 'kb', version: '1.0.0' });
  const safe = <A>(fn: (a: A) => Promise<{ content: { type: 'text'; text: string }[] }>) => async (a: A) => {
    try {
      return await fn(a);
    } catch (e) {
      return fail((e as Error).message);
    }
  };

  server.registerTool('list_workspaces', {
    title: 'List workspaces',
    description: 'The workspaces in KB (e.g. Personal, Work). Objects, notes and tasks live in one workspace.',
    annotations: { readOnlyHint: true },
  }, safe(async () => text((await listWorkspaces()).map((w) => `- ${w.name}`).join('\n'))));

  server.registerTool('list_types', {
    title: 'List object types',
    description: 'Object types in a workspace with their properties (key, label, kind). Use the type name with other tools.',
    inputSchema: z.object({ workspace: wsArg }),
    annotations: { readOnlyHint: true },
  }, safe(async ({ workspace }) => {
    const ws = await resolveWorkspace(workspace);
    const types = await listTypes(ws.id);
    return text(types.map((t) => `- ${t.name}${t.properties.length ? `: ${t.properties.map((p) => `${p.label} (${p.key}, ${p.kind}${p.options ? `: ${p.options.join('/')}` : ''})`).join(', ')}` : ''}`).join('\n'));
  }));

  server.registerTool('search', {
    title: 'Search',
    description: 'Full-text search over titles and note text in a workspace. Returns ids to use with get_object.',
    inputSchema: z.object({ query: z.string().min(1), workspace: wsArg, limit: z.number().int().min(1).max(50).optional() }),
    annotations: { readOnlyHint: true },
  }, safe(async ({ query, workspace, limit }) => {
    const ws = await resolveWorkspace(workspace);
    const hits = await searchFullText(ws.id, query, limit ?? 15);
    if (!hits.length) return text(`No results for "${query}" in ${ws.name}.`);
    return text(hits.map((h) => `- ${h.type_id === 'type_day' ? dayLabel(h.title) : h.title || 'Untitled'} (${h.type_name}, id ${h.id})${h.snippet ? `: ${h.snippet.replace(/[\u0002\u0003]/g, '')}` : ''}`).join('\n'));
  }));

  server.registerTool('get_object', {
    title: 'Read an object',
    description: 'An object by id: title, type, properties, tags, its note as Markdown, and what links to it.',
    inputSchema: z.object({ id: z.string() }),
    annotations: { readOnlyHint: true },
  }, safe(async ({ id }) => text(await describeObject(id, origin))));

  server.registerTool('list_objects', {
    title: 'List objects of a type',
    description: 'Objects of one type in a workspace, most recently edited first.',
    inputSchema: z.object({ type: z.string().describe('Type name, e.g. "Project"'), workspace: wsArg, limit: z.number().int().min(1).max(200).optional() }),
    annotations: { readOnlyHint: true },
  }, safe(async ({ type, workspace, limit }) => {
    const ws = await resolveWorkspace(workspace);
    const t = await resolveType(ws.id, type);
    const rows = await listObjectsByType(ws.id, t.id, limit ?? 50);
    return text(rows.length ? rows.map((r) => `- ${r.type_id === 'type_day' ? dayLabel(r.title) : r.title || 'Untitled'} (id ${r.id})`).join('\n') : `No ${t.name} objects in ${ws.name}.`);
  }));

  server.registerTool('get_daily_note', {
    title: 'Read a daily note',
    description: "A day's note (default today) with its tasks and the objects scheduled on that day.",
    inputSchema: z.object({ date: z.string().optional().describe('YYYY-MM-DD, default today'), workspace: wsArg }),
    annotations: { readOnlyHint: true },
  }, safe(async ({ date, workspace }) => {
    const ws = await resolveWorkspace(workspace);
    const day = date && isIsoDay(date) ? date : today();
    const id = await findDay(ws.id, day);
    const note = id ? await getObject(id) : null;
    const [tasks, refs] = await Promise.all([tasksForDay(ws.id, day, today()), dateReferences(ws.id, day)]);
    const taskLine = (t: { title: string; done: number; priority: string | null; id: string }) =>
      `- [${t.done ? 'x' : ' '}] ${t.title}${t.priority ? ` (${t.priority})` : ''} (id ${t.id})`;
    const out = [`# ${dayLabel(day)} (${ws.name})`, ''];
    out.push(note && (note.content as unknown[]).length ? toMarkdown(note.content as unknown[], (rid, f) => f || rid, origin).trim() : '_No note yet._');
    if (tasks.planned.length || tasks.due.length || tasks.completed.length) {
      out.push('', '## Tasks', ...tasks.planned.map(taskLine));
      if (tasks.due.length) out.push('', 'Overdue and due:', ...tasks.due.map(taskLine));
      if (tasks.completed.length) out.push('', 'Completed this day:', ...tasks.completed.map(taskLine));
    }
    const nonTask = refs.filter((r) => !isTaskType(r.type_id));
    if (nonTask.length) out.push('', '## Scheduled this day', ...nonTask.map((r) => `- ${r.title} (${r.type_name}, id ${r.id})`));
    return text(out.join('\n'));
  }));

  server.registerTool('append_to_daily_note', {
    title: 'Add to a daily note',
    description: 'Appends Markdown to a day\'s note (default today), creating the note if needed. Lists, checkboxes, headings and **bold** work; [[Exact Title]] links to an existing object.',
    inputSchema: z.object({ markdown: z.string().min(1), date: z.string().optional().describe('YYYY-MM-DD, default today'), workspace: wsArg }),
  }, safe(async ({ markdown, date, workspace }) => {
    const ws = await resolveWorkspace(workspace);
    const day = date && isIsoDay(date) ? date : today();
    const id = await getOrCreateDay(ws.id, day);
    const note = (await getObject(id))!;
    const blocks = await markdownToBlocks(markdown, ws.id);
    await saveContent(id, [...(note.content as Block[]), ...blocks]);
    return text(`Added ${blocks.length} block(s) to ${dayLabel(day)} in ${ws.name}. ${origin}/day/${day}`);
  }));

  server.registerTool('create_object', {
    title: 'Create an object',
    description: 'Creates an object of a type (e.g. Note, Person, Project) with an optional Markdown note and property values (keyed by property key or label).',
    inputSchema: z.object({
      type: z.string(),
      title: z.string().min(1),
      markdown: z.string().optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
      workspace: wsArg,
    }),
  }, safe(async ({ type, title, markdown, properties, workspace }) => {
    const ws = await resolveWorkspace(workspace);
    const t = await resolveType(ws.id, type);
    if (!t.enabled) throw new Error(`${t.name} is turned off in ${ws.name}.`);
    if (t.id === 'type_day') throw new Error('Use append_to_daily_note for daily notes.');
    const id = await createObject({ workspaceId: ws.id, typeId: t.id, title });
    if (properties) await saveProperties(id, t.properties, coerceProperties(t.properties, properties));
    if (markdown) {
      const o = (await getObject(id))!;
      await saveContent(id, [...(o.content as Block[]), ...(await markdownToBlocks(markdown, ws.id))]);
    }
    return text(`Created ${t.name} "${title}" (id ${id}). ${origin}/o/${id}`);
  }));

  server.registerTool('update_object', {
    title: 'Update an object',
    description: 'Renames an object, sets property values (keyed by key or label; others stay), and/or appends Markdown to its note.',
    inputSchema: z.object({
      id: z.string(),
      title: z.string().optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
      append_markdown: z.string().optional(),
    }),
  }, safe(async ({ id, title, properties, append_markdown }) => {
    const o = await getObject(id);
    if (!o) throw new Error(`No object with id ${id}`);
    const t = (await getTypeById(o.type_id))!;
    if (title && o.type_id !== 'type_day') await renameObject(id, title);
    if (properties) {
      const values = { ...o.properties, ...coerceProperties(t.properties, properties) };
      await saveProperties(id, t.properties, values);
      if (isTaskType(t.id) && 'done' in values && (values.done === true) !== (o.properties.done === true)) {
        await completeTask(id, values.done === true, today());
      }
    }
    if (append_markdown) await saveContent(id, [...(o.content as Block[]), ...(await markdownToBlocks(append_markdown, o.workspace_id))]);
    return text(`Updated "${title ?? o.title}". ${origin}/o/${id}`);
  }));

  server.registerTool('list_tasks', {
    title: 'List tasks',
    description: 'Tasks in a workspace: today (planned today or due/overdue), inbox (no date), scheduled (later), completed (recent).',
    inputSchema: z.object({ section: z.enum(['today', 'inbox', 'scheduled', 'completed', 'all']).optional(), workspace: wsArg }),
    annotations: { readOnlyHint: true },
  }, safe(async ({ section, workspace }) => {
    const ws = await resolveWorkspace(workspace);
    if (!(await taskTypeIdFor(ws.id))) return text(`Tasks are turned off in ${ws.name}.`);
    const b = await allTasks(ws.id, today());
    const fmt = (t: { title: string; id: string; date: string | null; deadline: string | null; priority: string | null; status: string | null; done: number }) =>
      `- [${t.done ? 'x' : ' '}] ${t.title} (id ${t.id})${[t.priority && `priority ${t.priority}`, t.status && t.status, t.date && `date ${t.date}`, t.deadline && `deadline ${t.deadline}`].filter(Boolean).map((x) => `, ${x}`).join('')}`;
    const parts: [string, typeof b.today][] = [['Today', b.today], ['Inbox', b.inbox], ['Scheduled', b.scheduled], ['Completed', b.done]];
    const pick = section && section !== 'all' ? parts.filter(([n]) => n.toLowerCase() === section) : parts;
    return text(pick.map(([n, rows]) => `## ${n}\n${rows.length ? rows.map(fmt).join('\n') : '_none_'}`).join('\n\n'));
  }));

  server.registerTool('create_task', {
    title: 'Create a task',
    description: 'Creates a task. The title may hold "!", "!!", "!!!" for priority and a date word (today, tomorrow, a weekday, next week, YYYY-MM-DD). Optional explicit date/deadline, priority (Low/Medium/High) and context object ids.',
    inputSchema: z.object({
      title: z.string().min(1),
      date: z.string().optional(),
      deadline: z.string().optional(),
      priority: z.enum(['Low', 'Medium', 'High']).optional(),
      context_ids: z.array(z.string()).optional(),
      workspace: wsArg,
    }),
  }, safe(async ({ title, date, deadline, priority, context_ids, workspace }) => {
    const ws = await resolveWorkspace(workspace);
    const typeId = await taskTypeIdFor(ws.id);
    if (!typeId) throw new Error(`Tasks are turned off in ${ws.name}.`);
    const t = (await getTypeById(typeId))!;
    const parsed = parseTaskTitle(title, today());
    const values: Record<string, unknown> = { done: false };
    const d = date && isIsoDay(date) ? date : parsed.date;
    if (d) values.date = d;
    if (deadline && isIsoDay(deadline)) values.deadline = deadline;
    if (priority ?? parsed.priority) values.priority = priority ?? parsed.priority;
    if (context_ids?.length) values.context = context_ids;
    const id = await createObject({ workspaceId: ws.id, typeId, title: parsed.title });
    await saveProperties(id, t.properties, coerceProperties(t.properties, values));
    return text(`Created task "${parsed.title}" (id ${id})${d ? ` for ${d}` : ' in the inbox'}. ${origin}/o/${id}`);
  }));

  server.registerTool('complete_task', {
    title: 'Complete a task',
    description: 'Ticks a task done (or open again with done=false). A repeating task moves to its next date instead of closing.',
    inputSchema: z.object({ id: z.string(), done: z.boolean().optional() }),
  }, safe(async ({ id, done }) => {
    const o = await getObject(id);
    if (!o || !isTaskType(o.type_id)) throw new Error(`No task with id ${id}`);
    const r = await completeTask(id, done ?? true, today());
    return text(r.done ? `Done: "${o.title}".` : r.date && done !== false ? `"${o.title}" repeats; next on ${r.date}.` : `Reopened "${o.title}".`);
  }));

  return server;
}
