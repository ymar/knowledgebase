import type { APIRoute } from 'astro';

/**
 * A page with link-preview tags, for the weblink tests (they shouldn't depend on outside sites).
 * Development only: a 404 in production.
 */
export const GET: APIRoute = ({ url }) => {
  if (!import.meta.env.DEV) return new Response('Not found', { status: 404 });
  const n = url.searchParams.get('n') ?? '1';
  return new Response(
    `<!doctype html><html><head>
      <title>Plain title ${n}</title>
      <meta property="og:title" content="Fixture article ${n} &amp; friends">
      <meta content="A page for testing link previews." name="description">
      <meta property="og:site_name" content="Fixture Site">
      <meta property="og:image" content="/favicon.svg">
    </head><body>Hello</body></html>`,
    { headers: { 'content-type': 'text/html; charset=utf-8' } },
  );
};
