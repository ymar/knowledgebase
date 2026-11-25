import { test, expect, createObject, isoDay, mcp, uid } from './helpers';

test('week view shows scheduled objects with times, timed first', async ({ page, request }) => {
  const id = uid();
  const day = isoDay(1);
  await mcp(request, 'add_properties', { type: 'Project', properties: [{ label: `Start ${id}`, kind: 'time' }] });
  await mcp(request, 'create_object', { type: 'Project', title: `Untimed ${id}`, properties: { Due: day } });
  await mcp(request, 'create_object', { type: 'Project', title: `Timed ${id}`, properties: { Due: day, [`Start ${id}`]: '2:30pm' } });
  await page.goto(`/calendar?view=week&d=${day}`);
  const cell = page.locator(`[data-day="${day}"]`);
  await expect(cell).toContainText('14:30');
  const txt = await cell.innerText();
  expect(txt.indexOf(`Timed ${id}`)).toBeLessThan(txt.indexOf(`Untimed ${id}`));
});

test('month view and keyboard navigation', async ({ page }) => {
  await page.goto(`/calendar?view=week&d=${isoDay()}`);
  await page.waitForLoadState('networkidle');
  await page.keyboard.press('m');
  await expect(page).toHaveURL(/view=month/);
  expect((await page.locator('[data-day]').count()) % 7).toBe(0);
  await page.keyboard.press(']');
  await expect(page).toHaveURL(/view=month&d=\d{4}-\d{2}-01/);
});

test('mark a daily note reviewed and undo', async ({ page }) => {
  await page.goto('/');
  const mark = page.getByRole('button', { name: /Mark reviewed|^Reviewed/ });
  if ((await mark.getAttribute('aria-pressed')) === 'true') {
    await mark.click();
    await page.waitForLoadState('networkidle');
  }
  await page.getByRole('button', { name: /Mark reviewed/ }).click();
  await expect(page.getByRole('button', { name: /^Reviewed/ })).toHaveAttribute('aria-pressed', 'true');
  await page.goto(`/calendar?view=week&d=${isoDay()}`);
  await expect(page.locator(`[data-day="${isoDay()}"]`)).toContainText('Reviewed');
  await page.goto('/');
  await page.getByRole('button', { name: /^Reviewed/ }).click();
  await expect(page.getByRole('button', { name: /Mark reviewed/ })).toBeVisible();
});

test('time property accepts loose input', async ({ page, request }) => {
  const id = uid();
  await mcp(request, 'add_properties', { type: 'Book', properties: [{ label: 'At', kind: 'time' }] }).catch(() => '');
  const b = await createObject(request, 'type_book', `Timed book ${id}`);
  await page.goto(`/o/${b.id}`);
  await page.fill('input[name="p_at"]', '9.15');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('input[name="p_at"]')).toHaveValue('09:15');
});
