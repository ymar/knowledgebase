import { test, expect, isoDay } from './helpers';

test.use({ viewport: { width: 390, height: 844 } });

for (const path of ['/', '/tasks', '/tasks?tab=board', `/calendar?view=week&d=${isoDay()}`, `/calendar?view=month&d=${isoDay()}`,
  '/t/project', '/t/project?view=table', '/t/project?view=board', '/types', '/trash']) {
  test(`no horizontal overflow at 390px: ${path}`, async ({ page }) => {
    await page.goto(path);
    await page.waitForLoadState('networkidle');
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
}

test('capture from the phone header', async ({ page }) => {
  await page.goto('/tasks');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-quick-capture]').click();
  await page.getByRole('combobox').fill('From my phone');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('Added to today');
});
