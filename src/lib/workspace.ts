import type { AstroCookies } from 'astro';

export const WS_COOKIE = 'ws';

export function setWorkspaceCookie(cookies: AstroCookies, id: string): void {
  cookies.set(WS_COOKIE, id, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax', httpOnly: true, secure: true });
}

/**
 * The workspace a request acts on: an explicit, valid id (sent by the editor,
 * which is bound to the document's workspace) wins over the cookie, so a
 * switch in another tab never makes a save land in the wrong workspace.
 */
export function resolveWs(locals: App.Locals, explicit?: string | null): string {
  if (explicit && locals.workspaces.some((w) => w.id === explicit)) return explicit;
  return locals.workspace.id;
}
