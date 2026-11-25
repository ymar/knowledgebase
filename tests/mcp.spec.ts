import { test, expect, mcp, uid } from './helpers';

test('MCP: create, read, update, search and calendar', async ({ request }) => {
  const id = uid();
  const created = await mcp(request, 'create_object', { type: 'Person', title: `Alexandra ${id}`, aliases: [`Lex${id}`] });
  const objId = created.match(/id (\w+)/)?.[1];
  expect(objId).toBeTruthy();
  await mcp(request, 'update_object', { id: objId, icon: '🦊', append_markdown: `Notes about **${id}**` });
  const read = await mcp(request, 'get_object', { id: objId });
  expect(read).toContain(`🦊 Alexandra ${id}`);
  expect(read).toContain(`Also known as: Lex${id}`);
  expect(await mcp(request, 'search', { query: `lex${id}` })).toContain(`Alexandra ${id}`);
  await mcp(request, 'append_to_daily_note', { markdown: `Coffee with [[lex${id}]]` });
  expect(await mcp(request, 'get_daily_note')).toContain(`[[Alexandra ${id}]]`);
  expect(await mcp(request, 'get_calendar')).toMatch(/^# /);
  expect(await mcp(request, 'list_workspaces')).toContain('Personal');
});
