import type { APIRoute } from 'astro';
import { MAX_UPLOAD_BYTES, storeFile } from '../../lib/files';
import { json } from '../../lib/http';

/** Editor upload target. multipart/form-data with one `file` field. */
export const POST: APIRoute = async ({ request }) => {
  const len = Number(request.headers.get('content-length') ?? 0);
  if (len > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: 'File is larger than 25 MB' }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File) || file.size === 0) return json({ error: 'No file' }, 400);
  if (file.size > MAX_UPLOAD_BYTES) return json({ error: 'File is larger than 25 MB' }, 413);
  return json({ url: await storeFile(file) }, 201);
};
