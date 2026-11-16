import { isDocument, type Block } from './doc';

export const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });

const MAX_DOC_BYTES = 1_000_000;

/** Reads `{ content }` from a JSON body. Returns a Response on bad input. */
export async function readDocument(request: Request): Promise<Block[] | Response> {
  const raw = await request.text();
  if (raw.length > MAX_DOC_BYTES) return json({ error: 'Document too large' }, 413);
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }
  const content = (body as { content?: unknown })?.content;
  if (!isDocument(content)) return json({ error: 'content must be a BlockNote document' }, 400);
  return content;
}
