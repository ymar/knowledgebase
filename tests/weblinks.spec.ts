import { test, expect, createObject, editor, mcp, objectAction, saveNow, uid } from './helpers';

// The fixture page lives on the dev server (src/pages/dev-fixtures/article.ts), so no outside site is needed.
const fixture = (n: string) => `http://localhost:4321/dev-fixtures/article?n=${n}`;

test('saving a URL fetches title, site, description and image, and de-duplicates', async ({ page, request }) => {
  const id = uid();
  const res = await request.post('/api/weblinks', { headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' }, data: { url: fixture(id) } });
  expect(res.status()).toBe(201);
  const s = await res.json();
  expect(s.title).toBe(`Fixture article ${id} & friends`);

  const again = await (await request.post('/api/weblinks', { headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' }, data: { url: fixture(id) } })).json();
  expect(again.id).toBe(s.id);
  expect(again.existed).toBe(true);

  await page.goto(`/o/${s.id}`);
  const card = page.locator('[data-weblink]');
  await expect(card).toContainText('Fixture Site');
  await expect(card).toContainText('A page for testing link previews.');
  await expect(card.getByRole('link', { name: /Open/ })).toHaveAttribute('href', fixture(id));
  await expect(page.locator('[data-cover]')).toHaveAttribute('style', /favicon\.svg/);
});

test('an unreachable or non-HTML URL still saves, titled by its host', async ({ request }) => {
  const id = uid();
  const r = await (await request.post('/api/weblinks', { headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' }, data: { url: `http://localhost:4321/favicon.svg?x=${id}` } })).json();
  expect(r.title).toContain('localhost');
  const bad = await request.post('/api/weblinks', { headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' }, data: { url: 'not a url' } });
  expect(bad.status()).toBe(400);
});

test('the Weblink type page creates from a pasted URL', async ({ page }) => {
  const id = uid();
  await page.goto('/t/weblink');
  await page.fill('[data-new-object]', fixture(id));
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/o\//);
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(`Fixture article ${id} & friends`);
});

test('@ with a URL saves the link and inserts a mention', async ({ page, request }) => {
  const id = uid();
  const note = await createObject(request, 'type_note', `Reading list ${id}`);
  await page.goto(`/o/${note.id}`);
  await (await editor(page)).click();
  // Pasted, as you would: typing a "/" opens the slash menu instead.
  await page.keyboard.type('@');
  await page.keyboard.insertText(fixture(id));
  await expect(page.locator('.bn-suggestion-menu-item[aria-selected=true]')).toContainText('Save link');
  await page.keyboard.press('Enter');
  await expect(page.locator('[data-mention]')).toContainText(`Fixture article ${id}`);
  await saveNow(page);
});

test('Cmd+K with a URL saves and opens it; capture of a URL links it on today', async ({ page }) => {
  const id = uid();
  await page.goto('/tasks');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox', { name: 'Search' }).fill(fixture(id));
  await page.locator('[role=option]', { hasText: 'Save link' }).click();
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(`Fixture article ${id} & friends`);

  const id2 = uid();
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Control+Shift+Period');
  await page.getByRole('combobox', { name: 'Capture to today' }).fill(fixture(id2));
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Added to today');
  await page.goto('/');
  await expect(page.locator('.bn-editor [data-mention]', { hasText: `Fixture article ${id2}` })).toBeVisible();
});

test('refresh keeps a title you typed yourself; MCP saves links', async ({ page, request }) => {
  const id = uid();
  const s = await (await request.post('/api/weblinks', { headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' }, data: { url: fixture(id) } })).json();
  await objectAction(request, s.id, { _action: 'rename', title: `My own name ${id}` });
  await page.goto(`/o/${s.id}`);
  await page.getByRole('button', { name: 'Refresh preview' }).click();
  await expect(page.locator('main')).toContainText('Preview refreshed.');
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(`My own name ${id}`);

  const out = await mcp(request, 'save_weblink', { url: fixture(`m${id}`), markdown: 'Worth a read.' });
  expect(out).toContain(`Saved: "Fixture article m${id} & friends"`);
  expect(await mcp(request, 'save_weblink', { url: fixture(`m${id}`) })).toContain('Already saved');
});
