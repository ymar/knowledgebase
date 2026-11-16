import type { APIRoute } from 'astro';
import { serveFile } from '../../lib/files';

export const GET: APIRoute = async ({ params, request }) => {
  const key = params.key ?? '';
  if (!/^[0-9A-HJKMNP-TV-Z]{26}\/[\w.\- ]+$/.test(key)) return new Response('Not found', { status: 404 });
  return serveFile(key, request);
};
