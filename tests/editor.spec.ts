import { test, expect, createObject, editor, saveNow, uid } from './helpers';

test('mentions, tags and inline create persist, and chips follow renames', async ({ page, request }) => {
  const id = uid();
  const person = await createObject(request, 'type_person', `Ada ${id}`);
  const note = await createObject(request, 'type_note', `Meeting ${id}`);
  await page.goto(`/o/${note.id}`);
  const ed = await editor(page);
  await ed.click();

  await page.keyboard.type(`Met @Ada ${id}`);
  await page.locator('.bn-suggestion-menu-item', { hasText: `Ada ${id}` }).first().click();
  await expect(page.locator('[data-mention]')).toHaveCount(1);
  await page.keyboard.type(`about #topic${id}`);
  await page.locator('.bn-suggestion-menu-item', { hasText: `topic${id}` }).first().click();
  await expect(page.locator('[data-mention]')).toHaveCount(2);
  await page.keyboard.type(`for [[Garden ${id}`);
  await page.locator('.bn-suggestion-menu-item', { hasText: `New project “Garden ${id}”` }).click();
  await expect(page.locator('[data-mention]')).toHaveCount(3);
  await saveNow(page);

  await page.reload();
  await expect(page.locator('[data-mention]')).toHaveCount(3);

  // Backlink with context on the person.
  await page.goto(`/o/${person.id}`);
  await expect(page.locator('main')).toContainText(`Meeting ${id}`);

  // Rename: the chip shows the new title.
  await page.getByRole('textbox', { name: 'Title' }).fill(`Ada King ${id}`);
  await Promise.all([page.waitForNavigation(), page.keyboard.press('Enter')]);
  await page.goto(`/o/${note.id}`);
  await expect(page.locator(`[data-mention="${person.id}"]`)).toContainText(`Ada King ${id}`);
});

test('daily note: typing autosaves and today is home', async ({ page }) => {
  const id = uid();
  await page.goto('/');
  const ed = await editor(page);
  await ed.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(`Daily line ${id}`);
  await saveNow(page);
  await page.reload();
  await expect(page.locator('.bn-editor')).toContainText(`Daily line ${id}`);
});

test('math, columns and block references', async ({ page, request }) => {
  const id = uid();
  const source = await createObject(request, 'type_note', `Source ${id}`);
  await request.put(`/api/objects/${source.id}/content`, {
    headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' },
    data: { content: [{ id: `blk${id}`, type: 'paragraph', props: {}, content: [{ type: 'text', text: `Quoted sentence ${id}`, styles: {} }], children: [] }] },
  });
  const doc = await createObject(request, 'type_note', `Doc ${id}`);
  await page.goto(`/o/${doc.id}`);
  await (await editor(page)).click();

  await page.keyboard.type('/math');
  await page.locator('.bn-suggestion-menu-item', { hasText: 'Math' }).first().click();
  await page.locator('[data-math] textarea').fill('\\frac{a}{b}');
  await expect(page.locator('[data-math] .katex').first()).toBeVisible();
  await page.keyboard.press('Escape');

  await page.locator('.bn-editor .bn-block-content[data-content-type="paragraph"]').last().click();
  await page.keyboard.type('/block ref');
  await page.locator('.bn-suggestion-menu-item', { hasText: 'Block reference' }).first().click();
  await page.locator('[contenteditable=false] input').last().fill(`Source ${id}`);
  await page.locator('[contenteditable=false] button', { hasText: `Source ${id}` }).first().dispatchEvent('mousedown');
  await page.locator('button', { hasText: `Quoted sentence ${id}` }).dispatchEvent('mousedown');
  await expect(page.locator('[data-block-ref]')).toContainText(`Quoted sentence ${id}`);

  await page.locator('.bn-editor .bn-block-content[data-content-type="paragraph"]').last().click();
  await page.keyboard.type('/columns');
  await page.locator('.bn-suggestion-menu-item', { hasText: 'Columns' }).first().click();
  const group = page.locator('.bn-block:has(> .react-renderer > .bn-block-content[data-content-type="columns"]) > .bn-block-group');
  await expect(group).toHaveCSS('display', 'grid');
  await saveNow(page);

  await page.reload();
  await expect(page.locator('[data-math] .katex').first()).toBeVisible();
  await expect(page.locator('.bn-block-content[data-content-type="columns"]')).toHaveCount(1);
  await expect(page.locator('[data-block-ref]')).toContainText(`Quoted sentence ${id}`);
  // A block reference counts as a link.
  await page.goto(`/o/${source.id}`);
  await expect(page.locator('main')).toContainText(`Doc ${id}`);
});
