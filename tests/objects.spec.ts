import path from 'node:path';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { deflateSync } from 'node:zlib';
import { test, expect, createObject, mcp, mention, objectAction, paragraph, putContent, text, uid } from './helpers';

/** A tiny valid PNG for upload tests. */
function png(): string {
  const crc = (buf: Buffer) => {
    let c = ~0;
    for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const t = Buffer.from(type);
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const sum = Buffer.alloc(4); sum.writeUInt32BE(crc(Buffer.concat([t, data])));
    return Buffer.concat([len, t, data, sum]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(8, 0); ihdr.writeUInt32BE(4, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: 4 }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(24, 160)])));
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'kb-')), 'cover.png');
  writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
  return file;
}

test('icon and cover: pick, upload, survive a type change, show in lists', async ({ page, request }) => {
  const id = uid();
  const o = await createObject(request, 'type_project', `Garden ${id}`);
  await page.goto(`/o/${o.id}`);
  await page.locator('[data-icon-picker] summary').first().click();
  await page.getByRole('button', { name: 'Use 🌱' }).click();
  await expect(page.locator('[data-icon-picker] summary').first()).toContainText('🌱');

  await page.locator('[data-cover-picker] summary').first().click();
  await page.getByRole('button', { name: 'Cover mint' }).click();
  await expect(page.locator('[data-cover]')).toHaveAttribute('style', /gradient/);
  await page.locator('[data-cover] [data-cover-picker] summary').click();
  await page.setInputFiles('[data-cover] input[type=file]', png());
  await expect(page.locator('[data-cover]')).toHaveAttribute('style', /\/files\//);

  await page.goto('/t/project?view=list');
  await expect(page.locator('main')).toContainText('🌱');

  const res = await objectAction(request, o.id, { _action: 'change-type', typeId: 'type_note' });
  expect(res.status()).toBe(303);
  await page.goto(`/o/${o.id}`);
  await expect(page.locator('[data-icon-picker] summary').first()).toContainText('🌱');
  await expect(page.locator('[data-cover]')).toHaveCount(1);

  const bad = await objectAction(request, o.id, { _action: 'set-icon', icon: 'abc' });
  expect(bad.headers().location).toContain('notice=');
});

test('"+ Type" creates a related object from its page', async ({ page, request }) => {
  const id = uid();
  await mcp(request, 'create_type', { name: `Meeting ${id}`, properties: [{ label: 'Attendees', kind: 'relation', links_to: 'Person', multiple: true }] });
  const p = await createObject(request, 'type_person', `Grace ${id}`);
  await page.goto(`/o/${p.id}`);
  await page.locator('[data-ra]', { hasText: `Meeting ${id}` }).click();
  await page.keyboard.type(`Kickoff ${id}`);
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/o/${p.id}`));
  await expect(page.locator('main')).toContainText(`Kickoff ${id}`);
});

test('move an object to another workspace', async ({ page, request }) => {
  const id = uid();
  const p = await createObject(request, 'type_person', `Mover ${id}`);
  const n = await createObject(request, 'type_note', `Mentions ${id}`);
  await putContent(request, n.id, [paragraph('m1', [text('By '), mention(p)])]);
  await page.goto(`/o/${p.id}`);
  await expect(page.locator('main')).toContainText(`Mentions ${id}`);
  page.once('dialog', (d) => d.accept());
  await page.locator('[data-move] summary').click();
  await page.locator('[data-move] button', { hasText: 'Move to Work' }).click();
  await expect(page.locator('main')).toContainText('Moved.');
  await expect(page.locator('main')).not.toContainText(`Mentions ${id}`);
  const work = await (await request.get(`/api/search?ws=ws_work&q=Mover ${id}`)).json();
  const personal = await (await request.get(`/api/search?ws=ws_personal&q=Mover ${id}`)).json();
  expect(work.map((h: { id: string }) => h.id)).toContain(p.id);
  expect(personal.map((h: { id: string }) => h.id)).not.toContain(p.id);
  await page.context().addCookies([{ name: 'ws', value: 'ws_personal', url: 'http://localhost:4321' }]);
});

test('trash and restore', async ({ page, request }) => {
  const id = uid();
  const o = await createObject(request, 'type_note', `Trashed ${id}`);
  await objectAction(request, o.id, { _action: 'delete' });
  await page.goto('/trash');
  await expect(page.locator('main')).toContainText(`Trashed ${id}`);
  await page.locator('li', { hasText: `Trashed ${id}` }).getByRole('button', { name: /Restore/ }).click();
  await page.goto(`/o/${o.id}`);
  await expect(page.getByRole('textbox', { name: 'Title' })).toHaveValue(`Trashed ${id}`);
});

test('bulk: select rows and set a property', async ({ page, request }) => {
  const id = uid();
  const a = await createObject(request, 'type_project', `Bulk A ${id}`);
  const b = await createObject(request, 'type_project', `Bulk B ${id}`);
  await page.goto('/t/project?view=list');
  await page.getByRole('button', { name: 'Select' }).click();
  await page.locator(`[data-select="${a.id}"]`).click();
  await page.locator(`[data-select="${b.id}"]`).click();
  await page.locator('[data-bulk-action]').selectOption('set-property');
  await page.locator('[data-bulk-key]').selectOption('status');
  await page.locator('[data-for-key="status"] select').selectOption('Active');
  await page.locator('[data-bulk-apply]').click();
  await page.waitForLoadState('networkidle');
  for (const o of [a, b]) expect(await mcp(request, 'get_object', { id: o.id })).toContain('Status: Active');
});
