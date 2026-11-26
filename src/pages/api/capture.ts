import type { APIRoute } from 'astro';
import { getObject, getOrCreateDay, saveContent } from '../../lib/db';
import type { Block } from '../../lib/doc';
import { markdownToBlocks } from '../../lib/from-markdown';
import { requestTimeZone, todayIn } from '../../lib/format';
import { resolveWs } from '../../lib/workspace';
import { isUrlLike } from '../../lib/weblink';
import { saveWeblink } from '../../lib/weblink-save';

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

/**
 * Quick capture: appends a line (Markdown; [[Title]] links) to today's note in a workspace,
 * creating the note if needed. With `preview: true` it only converts the text, for when
 * today's note is open in an editor: that editor inserts the blocks itself, so its next
 * autosave doesn't overwrite the server's copy.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  const input = (await request.json().catch(() => ({}))) as { text?: string; workspaceId?: string; preview?: boolean };
  const text = String(input.text ?? '').trim().slice(0, 10_000);
  if (!text) return json({ error: 'Nothing to capture' }, 400);
  const ws = resolveWs(locals, input.workspaceId ?? null);
  const date = todayIn(requestTimeZone(request));
  // Just a URL: save it as a Weblink and capture a link to it.
  let blocks: Block[];
  if (isUrlLike(text)) {
    const r = await saveWeblink(ws, text);
    blocks = r.ok
      ? [{ type: 'paragraph', props: {}, content: [{ type: 'mention', props: { id: r.summary.id, title: r.summary.title, typeId: r.summary.type_id } }, { type: 'text', text: ' ', styles: {} }] as never, children: [] }]
      : await markdownToBlocks(text, ws);
  } else {
    blocks = await markdownToBlocks(text, ws);
  }
  if (input.preview) return json({ date, blocks });

  const id = await getOrCreateDay(ws, date);
  const note = (await getObject(id))!;
  await saveContent(id, [...dropTrailingEmpty(note.content as Block[]), ...blocks]);
  return json({ date, id, added: blocks.length });
};

/** An empty last paragraph (BlockNote's trailing block) would leave a gap before the capture. */
function dropTrailingEmpty(blocks: Block[]): Block[] {
  const last = blocks[blocks.length - 1] as { type?: string; content?: unknown[]; children?: unknown[] } | undefined;
  const empty = last && last.type === 'paragraph' && !(last.content ?? []).length && !(last.children ?? []).length;
  return empty ? blocks.slice(0, -1) : blocks;
}
