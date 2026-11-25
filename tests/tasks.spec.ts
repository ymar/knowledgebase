import { test, expect, checkItem, createObject, isoDay, mcp, putContent, uid } from './helpers';

test('inline syntax sets priority, date and time', async ({ request }) => {
  const id = uid();
  const t = await createObject(request, 'type_task', `Call bank ${id} !! tomorrow 2pm`);
  expect(t.title).toBe(`Call bank ${id}`);
  const out = await mcp(request, 'get_object', { id: t.id });
  expect(out).toContain('Priority: Medium');
  expect(out).toContain('14:00');
});

test('tasks planned today show on the daily note and can be ticked', async ({ page, request }) => {
  const id = uid();
  const t = await createObject(request, 'type_task', `Today task ${id}`, { date: isoDay() });
  await page.goto('/');
  const row = page.locator(`[data-task="${t.id}"]`);
  await expect(row).toBeVisible();
  const saved = page.waitForResponse((r) => r.url().includes(`/api/objects/${t.id}/done`));
  await row.locator('[data-toggle]').click();
  await expect(row).toHaveAttribute('data-done', 'true');
  expect((await saved).ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator(`[data-task="${t.id}"]`)).toHaveAttribute('data-done', 'true');
});

test('a repeating task moves on instead of closing', async ({ request }) => {
  const id = uid();
  const t = await createObject(request, 'type_task', `Water plants ${id}`, { date: isoDay() });
  await mcp(request, 'update_object', { id: t.id, properties: { Repeat: 'Daily' } });
  const res = await request.post(`/api/objects/${t.id}/done`, {
    headers: { origin: 'http://localhost:4321', 'content-type': 'application/json' },
    data: { value: true },
  });
  const r = await res.json();
  expect(r.done).toBe(false);
  expect(r.date > isoDay()).toBeTruthy();
});

test('task board: changing status moves the card', async ({ page, request }) => {
  const id = uid();
  const t = await createObject(request, 'type_task', `Board task ${id}`);
  await page.goto('/tasks?tab=board');
  const card = page.locator(`[data-card="${t.id}"]`);
  const saved = page.waitForResponse((r) => r.url().includes('/api/tasks/status'));
  await card.locator('[data-status]').selectOption('In progress');
  expect((await saved).ok()).toBeTruthy();
  await expect(page.locator(`[data-column="In progress"] [data-card="${t.id}"]`)).toBeVisible();
  await page.reload();
  await expect(page.locator(`[data-column="In progress"] [data-card="${t.id}"]`)).toBeVisible();
});

test('checklists across notes can be ticked from the Tasks page', async ({ page, request }) => {
  const id = uid();
  const note = await createObject(request, 'type_note', `Packing ${id}`);
  await putContent(request, note.id, [checkItem(`c1${id}`, `Passport ${id}`), checkItem(`c2${id}`, `Charger ${id}`, true)]);
  await page.goto('/tasks?tab=checklists');
  await expect(page.locator('main')).toContainText(`Passport ${id}`);
  await expect(page.locator('main')).not.toContainText(`Charger ${id}`);
  const saved = page.waitForResponse((r) => r.url().includes('/checklist'));
  await page.locator(`[data-check-item="c1${id}"] [data-check]`).click();
  await expect(page.locator(`[data-check-item="c1${id}"]`)).toHaveAttribute('data-done', 'true');
  expect((await saved).ok()).toBeTruthy();
  await page.reload();
  await expect(page.locator('main')).not.toContainText(`Passport ${id}`);
});
