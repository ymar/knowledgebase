import { extractMentionIds, type Block } from './doc';
import { getSummaries, listTypes } from './db';

/** Server-side props for the Editor island: live titles for every mention, and the type palette. */
export async function editorProps(content: unknown[]) {
  const ids = extractMentionIds(content as Block[]);
  const [summaries, types] = await Promise.all([getSummaries(ids), listTypes()]);
  return {
    refs: Object.fromEntries(Object.values(summaries).map((s) => [s.id, { title: s.title, typeId: s.type_id }])),
    types: types.map((t) => ({ id: t.id, name: t.name, icon: t.icon, color: t.color })),
  };
}
