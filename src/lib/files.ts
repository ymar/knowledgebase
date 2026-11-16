import { env } from 'cloudflare:workers';
import { newId } from './ulid';

/** The only place that reaches for the R2 binding. */
const bucket = (): R2Bucket => env.FILES;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Types that may render inline. Everything else downloads. */
const INLINE = /^(image\/(png|jpe?g|gif|webp|avif|svg\+xml)|audio\/[\w.+-]+|video\/[\w.+-]+|application\/pdf|text\/plain)$/;

const safeName = (name: string) =>
  name.normalize('NFKD').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '-').slice(-120) || 'file';

/** Stores an upload under `<ulid>/<name>` and returns its app URL. */
export async function storeFile(file: File): Promise<string> {
  const key = `${newId()}/${safeName(file.name)}`;
  await bucket().put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
    customMetadata: { name: file.name.slice(0, 300) },
  });
  return `/files/${key}`;
}

/** Serves a stored file with byte-range support. Inert by default: sandboxed, no sniffing. */
export async function serveFile(key: string, request: Request): Promise<Response> {
  const hasRange = request.headers.has('range');
  const obj = await bucket().get(key, hasRange ? { range: request.headers } : undefined);
  if (!obj) return new Response('Not found', { status: 404 });

  const headers = new Headers();
  obj.writeHttpMetadata(headers);
  const type = headers.get('content-type') ?? 'application/octet-stream';
  const name = obj.customMetadata?.name ?? key.split('/').pop() ?? 'file';
  headers.set('etag', obj.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'private, max-age=31536000, immutable');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('content-security-policy', "sandbox; default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'");
  headers.set(
    'content-disposition',
    `${INLINE.test(type) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
  );

  if (!('body' in obj)) return new Response(null, { status: 304, headers });
  if (hasRange && obj.range && 'offset' in obj.range) {
    const offset = obj.range.offset ?? 0;
    const length = obj.range.length ?? obj.size - offset;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${obj.size}`);
    headers.set('content-length', String(length));
    return new Response(obj.body, { status: 206, headers });
  }
  headers.set('content-length', String(obj.size));
  return new Response(obj.body, { headers });
}

export async function listFileKeys(): Promise<{ key: string; size: number; uploaded: string }[]> {
  const out: { key: string; size: number; uploaded: string }[] = [];
  let cursor: string | undefined;
  do {
    const page = await bucket().list({ cursor, limit: 1000 });
    for (const o of page.objects) out.push({ key: o.key, size: o.size, uploaded: o.uploaded.toISOString() });
    cursor = page.truncated ? page.cursor : undefined;
  } while (cursor);
  return out;
}
