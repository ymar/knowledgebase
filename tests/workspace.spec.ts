import { test, expect } from './helpers';

test('Day and Tag can be switched off per workspace', async ({ page }) => {
  await page.goto('/types');
  const tagLink = page.locator('nav a[href="/t/tag"]');
  await expect(tagLink).toHaveCount(1);
  await page.getByRole('switch', { name: 'Tag on' }).click();
  await expect(page.getByRole('switch', { name: 'Tag off' })).toBeVisible();
  await expect(tagLink).toHaveCount(0);
  await page.getByRole('switch', { name: 'Tag off' }).click();
  await expect(tagLink).toHaveCount(1);
});

test('switching workspace changes the sidebar', async ({ page }) => {
  await page.context().addCookies([{ name: 'ws', value: 'ws_work', url: 'http://localhost:4321' }]);
  await page.goto('/types');
  await expect(page.locator('nav a[href="/t/person-work"]')).toHaveCount(1);
  await page.context().addCookies([{ name: 'ws', value: 'ws_personal', url: 'http://localhost:4321' }]);
});
