import type { APIRoute } from 'astro';
import { exportAll } from '../../lib/db';
import { listFileKeys } from '../../lib/files';

/** Everything in the database (trash included) plus the list of stored files. */
export const GET: APIRoute = async () => {
  const [data, files] = await Promise.all([exportAll(), listFileKeys()]);
  const body = JSON.stringify({ app: 'cairn', version: 1, exported_at: new Date().toISOString(), ...data, files }, null, 2);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="kb-export-${stamp}.json"`,
      'cache-control': 'no-store',
    },
  });
};
