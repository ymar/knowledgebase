import { linkFirstOccurrence, type Block } from './doc';
import { getObject, parseJson, saveContent, unlinkedCandidates, type SearchHit } from './db';
import type { ObjectRow } from './schema';

/** Objects that mention `target` by name in plain text but don't link to it. */
export async function unlinkedMentions(target: ObjectRow): Promise<SearchHit[]> {
  if (target.type_id === 'type_day') return [];
  const props = { id: target.id, title: target.title, typeId: target.type_id };
  const found = await unlinkedCandidates(target.id, target.title);
  // FTS matches tokens, including mention chips; keep only real plain-text occurrences.
  return found
    .filter((c) => linkFirstOccurrence(parseJson<Block[]>(c.content, []), target.title, props))
    .map(({ content: _c, ...hit }) => hit);
}

/** Converts the first plain-text occurrence of target's title in source into a mention. */
export async function linkMention(target: ObjectRow, sourceId: string): Promise<boolean> {
  const source = await getObject(sourceId);
  if (!source) return false;
  const next = linkFirstOccurrence(source.content as Block[], target.title, {
    id: target.id,
    title: target.title,
    typeId: target.type_id,
  });
  if (!next) return false;
  await saveContent(source.id, next);
  return true;
}
