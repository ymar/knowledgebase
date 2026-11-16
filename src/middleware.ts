import { defineMiddleware } from 'astro:middleware';
import { listWorkspaces } from './lib/db';
import { WS_COOKIE } from './lib/workspace';

/** Resolves the current workspace for every page and API request. */
export const onRequest = defineMiddleware(async (ctx, next) => {
  if (ctx.url.pathname.startsWith('/files/')) return next();
  const all = await listWorkspaces();
  const wanted = ctx.cookies.get(WS_COOKIE)?.value;
  ctx.locals.workspaces = all;
  ctx.locals.workspace = all.find((w) => w.id === wanted) ?? all[0];
  return next();
});
