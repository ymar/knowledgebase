import { test as base, expect, type APIRequestContext, type Page } from '@playwright/test';

export const WS = 'ws_personal';
const ORIGIN = 'http://localhost:4321';
const JSON_HEADERS = { origin: ORIGIN, 'content-type': 'application/json' };

/** A short unique suffix, so every test's titles are its own. */
export const uid = () => Math.random().toString(36).slice(2, 7);

/** Today and offsets as YYYY-MM-DD in UTC (local dev has no request.cf, so the app uses UTC too). */
export const isoDay = (offset = 0) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

export interface Created { id: string; title: string; type_id: string }

export async function createObject(api: APIRequestContext, typeId: string, title: string, extra: Record<string, unknown> = {}): Promise<Created> {
  const res = await api.post('/api/objects', { headers: JSON_HEADERS, data: { typeId, title, workspaceId: WS, ...extra } });
  expect(res.ok(), `create ${typeId} "${title}"`).toBeTruthy();
  return res.json();
}

/** Form action on an object page (`_action` plus fields), like the page's own forms. */
export async function objectAction(api: APIRequestContext, id: string, form: Record<string, string>) {
  return api.post(`/api/objects/${id}`, { headers: { origin: ORIGIN }, form, maxRedirects: 0 });
}

export const text = (t: string) => ({ type: 'text', text: t, styles: {} });
export const mention = (o: Created) => ({ type: 'mention', props: { id: o.id, title: o.title, typeId: o.type_id } });
export const paragraph = (id: string, content: unknown[]) => ({ id, type: 'paragraph', props: {}, content, children: [] });
export const checkItem = (id: string, t: string, checked = false, children: unknown[] = []) =>
  ({ id, type: 'checkListItem', props: { checked }, content: [text(t)], children });

export async function putContent(api: APIRequestContext, id: string, content: unknown[]) {
  const res = await api.put(`/api/objects/${id}/content`, { headers: JSON_HEADERS, data: { content } });
  expect(res.ok(), 'save content').toBeTruthy();
}

/** Calls an MCP tool on the local server (auth is skipped in dev). Returns the text result. */
export async function mcp(api: APIRequestContext, name: string, args: Record<string, unknown> = {}): Promise<string> {
  const res = await api.post('/mcp', {
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    data: { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } },
  });
  const body = await res.text();
  const json = body.includes('data:') ? JSON.parse(body.split('\n').find((l) => l.startsWith('data:'))!.slice(5)) : JSON.parse(body);
  return (json.result?.content ?? []).map((c: { text?: string }) => c.text ?? '').join('\n') || JSON.stringify(json.error ?? json);
}

/** Saves the open editor now (Cmd/Ctrl+S) and waits for the server to accept it. */
export async function saveNow(page: Page) {
  const saved = page.waitForResponse((r) => r.request().method() === 'PUT' && r.url().includes('/content'));
  await page.keyboard.press('ControlOrMeta+s');
  expect((await saved).ok(), 'editor save').toBeTruthy();
}

/** Waits until the island has hydrated (the editor is client-only). */
export async function editor(page: Page) {
  const ed = page.locator('.bn-editor');
  await ed.waitFor();
  return ed;
}

/** Every test starts in the Personal workspace and fails on uncaught page errors. */
export const test = base.extend<{ errors: string[] }>({
  context: async ({ context }, use) => {
    await context.addCookies([{ name: 'ws', value: WS, url: ORIGIN }]);
    await use(context);
  },
  errors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await use(errors);
    expect(errors, 'uncaught errors in the page').toEqual([]);
  }, { auto: true }],
});
export { expect };
