import { linkFirstOccurrence, type Block } from './doc';
import { getObject, parseJson, saveContent, splitAliases, unlinkedCandidates, type SearchHit } from './db';
import type { ObjectRow } from './schema';

/** The names an object goes by: title first, then aliases, longest first (so "Bob Smith" wins over "Bob"). */
const namesOf = (o: ObjectRow) => [
  o.title,
  ...splitAliases(o.aliases).sort((a, b) => b.length - a.length),
].filter((n) => n.trim().length >= 3);

const propsOf = (o: ObjectRow) => ({ id: o.id, title: o.title, typeId: o.type_id });

/** First name of `target` that occurs as plain text in `blocks`, linked; null if none. */
function linkAny(blocks: Block[], target: ObjectRow): Block[] | null {
  for (const name of namesOf(target)) {
    const next = linkFirstOccurrence(blocks, name, propsOf(target));
    if (next) return next;
  }
  return null;
}

/** Objects that mention `target` by name or alias in plain text but don't link to it. */
export async function unlinkedMentions(target: ObjectRow): Promise<SearchHit[]> {
  if (target.type_id === 'type_day') return [];
  const found = await unlinkedCandidates(target.id, namesOf(target));
  // FTS matches tokens, including mention chips; keep only real plain-text occurrences.
  return found
    .filter((c) => linkAny(parseJson<Block[]>(c.content, []), target))
    .map(({ content: _c, ...hit }) => hit);
}

/** Converts the first plain-text occurrence of target's title (or an alias) in source into a mention. */
export async function linkMention(target: ObjectRow, sourceId: string): Promise<boolean> {
  const source = await getObject(sourceId);
  if (!source) return false;
  const next = linkAny(source.content as Block[], target);
  if (!next) return false;
  await saveContent(source.id, next);
  return true;
}
