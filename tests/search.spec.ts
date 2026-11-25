import { test, expect, createObject, objectAction, paragraph, putContent, text, uid, editor, saveNow } from './helpers';

test('aliases: @ search, full-text search and unlinked mentions', async ({ page, request }) => {
  const id = uid();
  const robert = await createObject(request, 'type_person', `Robert ${id}`);
  await objectAction(request, robert.id, { _action: 'set-aliases', aliases: `Bob${id}, Robby${id}` });
  const hits = await (await request.get(`/api/search?ws=ws_personal&q=bob${id}`)).json();
  expect(hits[0]?.id).toBe(robert.id);
  const pal = await (await request.get(`/api/palette?q=robby${id}`)).json();
  expect(pal.hits.map((h: { id: string }) => h.id)).toContain(robert.id);

  const note = await createObject(request, 'type_note', `Lunch ${id}`);
  await putContent(request, note.id, [paragraph('p1', [text(`Had lunch with Bob${id} today.`)])]);
  await page.goto(`/o/${robert.id}`);
  await expect(page.locator('main')).toContainText(`Lunch ${id}`);
  await page.locator('form:has(input[name="_action"][value="link-mention"]) button').first().click();
  await page.goto(`/o/${note.id}`);
  await expect(page.locator(`[data-mention="${robert.id}"]`)).toContainText(`Robert ${id}`);
});

test('Cmd+K finds an object and opens it', async ({ page, request }) => {
  const id = uid();
  const o = await createObject(request, 'type_book', `Palette book ${id}`);
  await page.goto('/tasks');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Control+k');
  await page.getByRole('combobox').fill(`Palette book ${id}`);
  // Wait for the search hit itself, not the "New … “Palette book”" create action.
  await page.locator('[role=option]', { hasText: `Palette book ${id}` }).filter({ hasNotText: 'New ' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/o/${o.id}`));
});

test('quick capture appends to today, also while today is open', async ({ page }) => {
  const id = uid();
  await page.goto('/tasks');
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('Control+Shift+Period');
  const input = page.getByRole('combobox');
  await input.fill(`Captured ${id}`);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Added to today');
  await page.keyboard.press('Escape');

  await page.goto('/');
  const ed = await editor(page);
  await expect(ed).toContainText(`Captured ${id}`);
  await page.keyboard.press('Control+Shift+Period');
  await input.fill(`While open ${id}`);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Added to today');
  await page.keyboard.press('Escape');
  await expect(ed).toContainText(`While open ${id}`);
  await saveNow(page);
  await page.reload();
  await expect(page.locator('.bn-editor')).toContainText(`While open ${id}`);
});
