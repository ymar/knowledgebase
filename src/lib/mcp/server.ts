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
  createType, freeSlug, updateType, setTaskStatus, setAliases, splitAliases, setObjectMeta, calendarEntries, daysWithNotes, reviewedDays,
} from '../db';
import { parseTypeForm, slugify, KINDS } from '../type-form';
import { TYPE_COLORS, TYPE_ICONS } from '../icons';
import { newId } from '../ulid';
import type { Workspace } from '../db';
import type { Block } from '../doc';
import { toMarkdown } from '../markdown';
import { markdownToBlocks } from '../from-markdown';
import { cleanEmoji } from '../media';
import { displayValue } from '../property-display';
import { parsePropertyForm } from '../properties';
import { parseTaskTitle } from '../task-logic';
import { addDays, dayLabel, isIsoDay, todayIn } from '../format';
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
    `# ${typeof o.properties._icon === 'string' ? `${o.properties._icon} ` : ''}${title || 'Untitled'}`,
    `id: ${o.id} · type: ${type?.name ?? '?'} · url: ${origin}/o/${o.id}`,
    splitAliases(o.aliases).length ? `Also known as: ${splitAliases(o.aliases).join(', ')}` : '',
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
    description: 'Full-text search over titles, aliases and note text in a workspace. Returns ids to use with get_object.',
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
      aliases: z.array(z.string()).optional().describe('Other names, e.g. ["Bob"] for "Robert Smith"'),
      markdown: z.string().optional(),
      properties: z.record(z.string(), z.unknown()).optional(),
      workspace: wsArg,
    }),
  }, safe(async ({ type, title, aliases, markdown, properties, workspace }) => {
    const ws = await resolveWorkspace(workspace);
    const t = await resolveType(ws.id, type);
    if (!t.enabled) throw new Error(`${t.name} is turned off in ${ws.name}.`);
    if (t.id === 'type_day') throw new Error('Use append_to_daily_note for daily notes.');
    const id = await createObject({ workspaceId: ws.id, typeId: t.id, title });
    if (properties) await saveProperties(id, t.properties, coerceProperties(t.properties, properties));
    if (aliases?.length) await setAliases(id, aliases);
    if (markdown) {
      const o = (await getObject(id))!;
      await saveContent(id, [...(o.content as Block[]), ...(await markdownToBlocks(markdown, ws.id))]);
    }
    return text(`Created ${t.name} "${title}" (id ${id}). ${origin}/o/${id}`);
  }));

  server.registerTool('update_object', {
    title: 'Update an object',
    description: 'Renames an object, replaces its aliases (other names that search and [[links]] also match), sets property values (keyed by key or label; others stay), and/or appends Markdown to its note.',
    inputSchema: z.object({
      id: z.string(),
      title: z.string().optional(),
      aliases: z.array(z.string()).optional().describe('Full list of other names; [] clears them'),
      icon: z.string().optional().describe('One emoji shown as the object\'s icon; "" removes it'),
      properties: z.record(z.string(), z.unknown()).optional(),
      append_markdown: z.string().optional(),
    }),
  }, safe(async ({ id, title, aliases, icon, properties, append_markdown }) => {
    const o = await getObject(id);
    if (!o) throw new Error(`No object with id ${id}`);
    const t = (await getTypeById(o.type_id))!;
    if (title && o.type_id !== 'type_day') await renameObject(id, title);
    if (aliases && o.type_id !== 'type_day') await setAliases(id, aliases);
    if (icon !== undefined && o.type_id !== 'type_day') {
      const e = icon === '' ? null : cleanEmoji(icon);
      if (icon !== '' && !e) throw new Error('icon must be an emoji');
      await setObjectMeta(id, '_icon', e);
    }
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

  const propertySpec = z.object({
    label: z.string().min(1).describe('Shown name, e.g. "Due"'),
    kind: z.enum(Object.keys(KINDS) as [string, ...string[]]).describe('text, number, date, url, checkbox, select, multiselect or relation'),
    options: z.array(z.string()).optional().describe('For select and multiselect'),
    links_to: z.string().optional().describe('For relation: the type name it links to; omit for any type'),
    multiple: z.boolean().optional().describe('For relation: may hold several objects'),
  });

  /** Writes a type's full property list through the type editor's parser (stable keys, validation). */
  async function saveTypeDefinition(type: TypeRow, ws: string, extra: z.infer<typeof propertySpec>[], dailyNotes?: string) {
    const all = await listTypes(ws, { includeDisabled: true });
    const fd = new FormData();
    fd.set('name', type.name);
    fd.set('icon', type.icon);
    fd.set('color', type.color);
    const rows: { key: string; label: string; kind: string; options: string; target: string; multiple: string }[] = [
      ...type.properties.map((p) => ({ key: p.key, label: p.label, kind: p.kind, options: (p.options ?? []).join(', '), target: p.target ?? '', multiple: p.multiple ? 'many' : 'one' })),
      ...extra.map((p) => {
        const target = p.links_to ? all.find((t) => t.name.toLowerCase() === p.links_to!.toLowerCase() || t.slug === p.links_to)?.slug : '';
        if (p.links_to && !target) throw new Error(`No type "${p.links_to}" to link to in this workspace.`);
        return { key: '', label: p.label, kind: p.kind, options: (p.options ?? []).join(', '), target: target ?? '', multiple: p.multiple ? 'many' : 'one' };
      }),
    ];
    for (const r of rows) {
      fd.append('p_key', r.key);
      fd.append('p_label', r.label);
      fd.append('p_kind', r.kind);
      fd.append('p_options', r.options);
      fd.append('p_target', r.target);
      fd.append('p_multiple', r.multiple);
    }
    const parsed = parseTypeForm(fd, type.properties, new Set(all.map((t) => t.slug)));
    // Daily notes: keep the current setting unless a date property label is given.
    const dayProp = dailyNotes ? parsed.properties.find((p) => p.kind === 'date' && p.label.toLowerCase() === dailyNotes.toLowerCase()) : null;
    if (dailyNotes && !dayProp) throw new Error(`"${dailyNotes}" isn't a date property of ${type.name}.`);
    await updateType(type.id, { ...parsed, dayKey: dayProp ? dayProp.key : type.day_key });
    return parsed.properties;
  }

  server.registerTool('create_type', {
    title: 'Create an object type',
    description: 'Creates a custom object type in a workspace (e.g. "Meeting", "Recipe") with its properties. Optionally pick a date property for daily notes ("+ Type" button and Date references).',
    inputSchema: z.object({
      name: z.string().min(1),
      icon: z.enum(TYPE_ICONS as [string, ...string[]]).optional(),
      color: z.enum(TYPE_COLORS as [string, ...string[]]).optional(),
      properties: z.array(propertySpec).optional(),
      daily_notes_property: z.string().optional().describe('Label of a date property to tie this type to daily notes'),
      workspace: wsArg,
    }),
  }, safe(async ({ name, icon, color, properties, daily_notes_property, workspace }) => {
    const ws = await resolveWorkspace(workspace);
    const existing = (await listTypes(ws.id, { includeDisabled: true })).find((t) => t.name.toLowerCase() === name.trim().toLowerCase());
    if (existing) throw new Error(`${ws.name} already has a type "${existing.name}". Use add_properties to extend it.`);
    const base = slugify(name) || 'type';
    const id = newId();
    await createType({ id, workspaceId: ws.id, name: name.trim().slice(0, 60), slug: await freeSlug(base), icon: icon ?? 'file-text', color: color ?? TYPE_COLORS[0] });
    const type = (await getTypeById(id))!;
    const props = await saveTypeDefinition(type, ws.id, properties ?? [], daily_notes_property);
    return text(`Created type "${type.name}" in ${ws.name}${props.length ? ` with ${props.map((p) => `${p.label} (${p.kind})`).join(', ')}` : ''}. ${origin}/types/${id}`);
  }));

  server.registerTool('add_properties', {
    title: 'Add properties to a type',
    description: 'Adds properties to an existing object type. Existing properties and stored values stay as they are.',
    inputSchema: z.object({
      type: z.string(),
      properties: z.array(propertySpec).min(1),
      daily_notes_property: z.string().optional(),
      workspace: wsArg,
    }),
  }, safe(async ({ type, properties, daily_notes_property, workspace }) => {
    const ws = await resolveWorkspace(workspace);
    const t = await resolveType(ws.id, type);
    if (t.workspace_id === null) throw new Error(`${t.name} is a shared system type; add properties in the app.`);
    const dupes = properties.filter((p) => t.properties.some((x) => x.label.toLowerCase() === p.label.toLowerCase()));
    if (dupes.length) throw new Error(`${t.name} already has: ${dupes.map((p) => p.label).join(', ')}`);
    const props = await saveTypeDefinition(t, ws.id, properties, daily_notes_property);
    return text(`${t.name} now has: ${props.map((p) => p.label).join(', ')}.`);
  }));

  server.registerTool('get_calendar', {
    title: 'Calendar',
    description: 'What is scheduled per day in a date range (default this week, Monday to Sunday): objects on their daily-notes date and tasks on their Date, with times; plus which days have a note and which are marked reviewed.',
    inputSchema: z.object({
      from: z.string().optional().describe('YYYY-MM-DD, default this Monday'),
      to: z.string().optional().describe('YYYY-MM-DD, default from + 6 days; at most 62 days after from'),
      workspace: wsArg,
    }),
    annotations: { readOnlyHint: true },
  }, safe(async ({ from, to, workspace }) => {
    const ws = await resolveWorkspace(workspace);
    const t = today();
    const start = from && isIsoDay(from) ? from : addDays(t, -((new Date(`${t}T00:00:00Z`).getUTCDay() + 6) % 7));
    let end = to && isIsoDay(to) && to >= start ? to : addDays(start, 6);
    if (end > addDays(start, 62)) end = addDays(start, 62);
    const [entries, notes, reviewed] = await Promise.all([calendarEntries(ws.id, start, end), daysWithNotes(ws.id, start, end), reviewedDays(ws.id, start, end)]);
    const out = [`# ${dayLabel(start)} to ${dayLabel(end)} (${ws.name})`];
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const items = entries.filter((e) => e.date === d);
      const marks = [notes.has(d) ? 'note' : '', reviewed.has(d) ? 'reviewed' : ''].filter(Boolean).join(', ');
      if (!items.length && !marks) continue;
      out.push('', `## ${dayLabel(d)}${marks ? ` (${marks})` : ''}`);
      for (const e of items) out.push(`- ${e.is_task ? `[${e.done ? 'x' : ' '}] ` : ''}${e.time ? `${e.time} ` : ''}${e.title || 'Untitled'} (${e.type_name}, id ${e.id})`);
    }
    if (out.length === 1) out.push('', 'Nothing scheduled.');
    return text(out.join('\n'));
  }));

  server.registerTool('list_tasks', {
    title: 'List tasks',
    description: 'Tasks in a workspace: today (planned today, due or overdue, in progress, done today), inbox (no date or status), scheduled (later), open (all open by priority), completed (recent).',
    inputSchema: z.object({ section: z.enum(['today', 'inbox', 'scheduled', 'open', 'completed', 'all']).optional(), workspace: wsArg }),
    annotations: { readOnlyHint: true },
  }, safe(async ({ section, workspace }) => {
    const ws = await resolveWorkspace(workspace);
    if (!(await taskTypeIdFor(ws.id))) return text(`Tasks are turned off in ${ws.name}.`);
    const b = await allTasks(ws.id, today());
    const fmt = (t: { title: string; id: string; date: string | null; time: string | null; deadline: string | null; priority: string | null; status: string | null; repeat: string | null; done: number; sub_total: number; sub_done: number }) =>
      `- [${t.done ? 'x' : ' '}] ${t.title} (id ${t.id})${[t.priority && `priority ${t.priority}`, t.status && t.status, t.date && `date ${t.date}${t.time ? ` ${t.time}` : ''}`, t.deadline && `deadline ${t.deadline}`, t.repeat && `repeats ${t.repeat.toLowerCase()}`, t.sub_total && `${t.sub_done}/${t.sub_total} subtasks`].filter(Boolean).map((x) => `, ${x}`).join('')}`;
    const parts: [string, typeof b.today][] = [['Today', b.today], ['Inbox', b.inbox], ['Scheduled', b.scheduled], ['Open', b.open], ['Completed', b.done]];
    const pick = section && section !== 'all' ? parts.filter(([n]) => n.toLowerCase() === section) : parts;
    return text(pick.map(([n, rows]) => `## ${n}\n${rows.length ? rows.map(fmt).join('\n') : '_none_'}`).join('\n\n'));
  }));

  server.registerTool('create_task', {
    title: 'Create a task',
    description: 'Creates a task. The title may hold "!", "!!", "!!!" for priority, a date word (today, tomorrow, a weekday, next week, YYYY-MM-DD) and a time (2pm, 14:00). Optional explicit date, time, deadline, priority (Low/Medium/High), status and context object ids.',
    inputSchema: z.object({
      title: z.string().min(1),
      date: z.string().optional(),
      deadline: z.string().optional(),
      priority: z.enum(['Low', 'Medium', 'High']).optional(),
      time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional().describe('HH:MM'),
      status: z.enum(['Not started', 'Next up', 'In progress', 'Blocked']).optional(),
      context_ids: z.array(z.string()).optional(),
      workspace: wsArg,
    }),
  }, safe(async ({ title, date, deadline, priority, time, status, context_ids, workspace }) => {
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
    if (time ?? parsed.time) values.time = time ?? parsed.time;
    if (status) values.status = status;
    if (context_ids?.length) values.context = context_ids;
    const id = await createObject({ workspaceId: ws.id, typeId, title: parsed.title });
    await saveProperties(id, t.properties, coerceProperties(t.properties, values));
    return text(`Created task "${parsed.title}" (id ${id})${d ? ` for ${d}` : ' in the inbox'}. ${origin}/o/${id}`);
  }));

  server.registerTool('set_task_status', {
    title: 'Set a task status',
    description: 'Moves a task to a status (Not started, Next up, In progress, Blocked, Done), like the board. Done ticks it.',
    inputSchema: z.object({ id: z.string(), status: z.enum(['Not started', 'Next up', 'In progress', 'Blocked', 'Done']) }),
  }, safe(async ({ id, status }) => {
    const o = await getObject(id);
    if (!o || !isTaskType(o.type_id)) throw new Error(`No task with id ${id}`);
    const r = await setTaskStatus(id, status, today());
    return text(status === 'Done' && !r.done && r.date ? `"${o.title}" repeats; next on ${r.date}.` : `"${o.title}" is now ${status}.`);
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
