import { test, expect, createObject, mention, paragraph, putContent, text, uid } from './helpers';

test('richer queries: tag, links to, words, more types, groups, blocks and saved views', async ({ page, request }) => {
  const id = uid();
  const tag = await createObject(request, 'type_tag', `idea${id}`);
  const ada = await createObject(request, 'type_person', `Ada ${id}`);
  const alpha = await createObject(request, 'type_note', `Alpha ${id}`);
  await putContent(request, alpha.id, [
    paragraph('a1', [text('Intro line')]),
    paragraph('a2', [text('A thought '), mention(tag)]),
    paragraph('a3', [text('Met '), mention(ada), text(` about rockets${id}`)]),
  ]);
  const beta = await createObject(request, 'type_note', `Beta ${id}`);
  await putContent(request, beta.id, [paragraph('b1', [text(`Nothing tagged, rockets${id} though`)])]);
  const book = await createObject(request, 'type_book', `Book ${id}`);
  await putContent(request, book.id, [paragraph('k1', [text(`A book on rockets${id}`)])]);
  const main = page.locator('main');

  await page.goto(`/t/note?tag=${tag.id}&blocks=1`);
  await expect(main).toContainText(`Alpha ${id}`);
  await expect(main).not.toContainText(`Beta ${id}`);
  await expect(main).toContainText('A thought');
  await expect(main).not.toContainText('Intro line');

  await page.goto(`/t/note?q=rockets${id}`);
  await expect(main).toContainText(`Beta ${id}`);
  await expect(main).not.toContainText(`Book ${id}`);

  await page.goto(`/t/note?q=rockets${id}&also=type_book&group=type`);
  await expect(page.locator('main section h2', { hasText: 'Book' })).toHaveCount(1);
  await expect(page.locator('main section h2', { hasText: 'Note' })).toHaveCount(1);

  await page.goto(`/t/note?links_title=${encodeURIComponent(`ada ${id}`)}`);
  await expect(page).toHaveURL(new RegExp(`links=${ada.id}`));
  await expect(main).toContainText(`Alpha ${id}`);
  await expect(main).not.toContainText(`Beta ${id}`);

  await page.goto(`/t/note?q=rockets${id}&limit=1&random=1`);
  expect((await main.innerText()).match(new RegExp(`(Alpha|Beta) ${id}`, 'g'))?.length).toBe(1);

  // Save a view and read it as the Query block does.
  await page.goto(`/t/note?q=rockets${id}&also=type_book&blocks=1`);
  await page.fill('#view-name', `Rockets ${id}`);
  await page.getByRole('button', { name: 'Save view' }).click();
  const sv = new URL(page.url()).searchParams.get('sv');
  expect(sv).toBeTruthy();
  const r = await (await request.get(`/api/views/${sv}/results`)).json();
  expect(r.items.map((i: { title: string }) => i.title)).toContain(`Book ${id}`);
  expect(r.items.some((i: { lines?: string[] }) => i.lines?.some((l) => l.includes(`rockets${id}`)))).toBeTruthy();
});

test('table and board views on a type page', async ({ page, request }) => {
  const id = uid();
  const p = await createObject(request, 'type_project', `Board ${id}`);
  await page.goto('/t/project?view=table');
  await expect(page.locator('table th', { hasText: 'Status' })).toBeVisible();
  await expect(page.locator('table')).toContainText(`Board ${id}`);
  await page.goto('/t/project?view=board');
  const target = await page.locator('[data-type-board] [data-column]').first().getAttribute('data-column');
  const saved = page.waitForResponse((r) => r.url().includes(`/api/objects/${p.id}/prop`));
  await page.locator(`[data-card="${p.id}"] [data-move]`).selectOption(target!);
  expect((await saved).ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator(`[data-column="${target}"] [data-card="${p.id}"]`)).toBeVisible();
  await page.goto('/t/project?view=list');
});

test('filter row uses the app date picker and keeps rows parallel', async ({ page }) => {
  await page.goto('/t/project');
  await page.locator('details:has(#filters) > summary').click();
  const row = page.locator('#filters > div').first();
  await row.locator('[data-filter-key]').selectOption('due');
  await expect(row.locator('[data-v-date]')).toBeVisible();
  await expect(page.locator('input[type=date]')).toHaveCount(0);
  await row.locator('[data-dp-trigger]').click();
  await page.keyboard.press('Enter');
  await page.getByRole('button', { name: 'Apply' }).click();
  const u = new URL(page.url());
  expect(u.searchParams.getAll('f').length).toBe(u.searchParams.getAll('v').length);
  expect(u.searchParams.get('v')).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});
