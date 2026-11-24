import { extractMentionIds, type Block } from './doc';
import { getSummaries, listTypes } from './db';

/** Server-side props for the Editor island: live titles for every mention, and the type palette. */
export async function editorProps(ws: string, content: unknown[]) {
  const ids = extractMentionIds(content as Block[]);
  const [summaries, types] = await Promise.all([getSummaries(ids), listTypes(ws, { includeDisabled: true })]);
  return {
    refs: Object.fromEntries(Object.values(summaries).map((s) => [s.id, { title: s.title, typeId: s.type_id, icon: s.icon ?? null }])),
    types: types.map((t) => ({ id: t.id, name: t.name, icon: t.icon, color: t.color, enabled: t.enabled })),
  };
}
