# Cairn

Personal, single-user knowledge app. Everything is a typed object; objects link to each other.
Inspired by the feel of Capacities (calm, neutral, object-first). Own name, logo, layout and copy.
Do not copy Capacities assets, icons, logo or wording.

## Working rules

- Push only to the session's `claude/*` branch. Never push to `main`. This is not a production app.
- Stop after each phase (and each gap batch below), report what was built and how to test it, wait for "go".
- Show schema changes before applying them. Migrations are append-only: never edit an applied file.
- If two requirements conflict or something is unclear, ask. Don't guess.
- After each phase: `npm run check`, `npm run build`, and run the main flow against local D1 before reporting.

## Stack

- Astro 7, `output: 'server'`, `@astrojs/cloudflare` 14 (Workers, not Pages). Worker name: `knowledgebase`.
- Bindings via `import { env } from 'cloudflare:workers'` (`Astro.locals.runtime` no longer exists).
  `DB` = D1 `kb-db`, `FILES` = R2 `kb-files`. Run `npm run types` after editing `wrangler.jsonc`.
- Tailwind 4 via `@tailwindcss/vite`. React islands only for the editor and command palette.
- BlockNote 0.57 (`@blocknote/core`, `/react`, `/mantine`), content stored as JSON.
- Plain SQL migrations in `migrations/`, applied with `wrangler d1 migrations apply`. No ORM.
- No auth code. Cloudflare Access sits in front (enabled on `knowledgebase.ymar.workers.dev`; email one-time PIN).
  The only token check in the app is `/mcp`, which verifies the Access JWT (`src/lib/access.ts`).
- `src/fetch.ts` is a reserved filename in Astro 7. Don't use it.

## Editor notes

- Mentions are a custom inline content type `mention` with props `{ id, title, typeId }`. `title` is a
  snapshot; pages pass live titles to the island (`src/lib/editor-props.ts`), so chips follow renames.
- Triggers: `@` and `[[` (objects, days, inline create), `#` (tags; not at line start, so `# ` stays a heading),
  `/` (blocks). Date words: today, tomorrow, yesterday, or `YYYY-MM-DD`.
- Autosave: 800 ms debounce, PUT JSON, retry on failure, flush on tab hide, Cmd/Ctrl+S saves now.
- Day notes are created on first save (`PUT /api/days/:date/content`), so browsing dates leaves no empty rows.
  "Today" uses Cloudflare's `request.cf.timezone`, UTC in local dev.
- Cmd/Ctrl+K always opens the palette (capture phase), also inside the editor. BlockNote's own Mod+K link
  shortcut is overridden; links stay in the formatting toolbar. The palette hydrates `client:load`.
- Tags: inline `#tag` mentions are `content` links; the tag field under the title adds `tag` links. Both count
  for tag pages and the "Untagged" view.
- Unlinked mentions "Link" rewrites the source document (first plain-text occurrence becomes a mention) and
  saves it, so the link survives that object's next autosave.
- Uploads: `POST /api/files` stores in R2 under `<ulid>/<safe-name>` (25 MB max); `/files/<key>` serves them
  with byte ranges, a sandbox CSP and `nosniff`. Only images, audio, video, PDF and plain text render inline;
  everything else downloads. R2 access lives in `src/lib/files.ts` only.
- Type editor (`/types/:id`): property keys are fixed once created, so renaming a label keeps stored values.
  Saving a type rebuilds its objects' `property` links in the same batch. Starter and system types can't be deleted;
  custom types only when they have no objects at all (trash included, because of the foreign key).
- Trash (`/trash`): restore, or "Delete forever", the only hard delete. Merging tags rewrites every document
  that mentions the old tag, moves picker links and trashes the old tag, in one batch.
- Export: `/api/export.json` (all rows, trash included, plus R2 keys) and `/api/export.zip` (Markdown per object).
- Workspaces (migration 0006): `objects.workspace_id`, default `ws_personal`; seeded Personal and Work.
  Every list, search, count, pin, recent, trash and day query takes a workspace id.
  Link inserts only match targets in the source's workspace, so links never cross. The current workspace
  is the `ws` cookie, resolved into `Astro.locals.workspace` by `src/middleware.ts`. The editor sends its
  document's workspace explicitly (`?ws=` / `workspaceId`), so a switch in another tab can't misroute a save.
  Opening an object from another workspace switches to it. "Move to workspace" (object page footer,
  `moveObjectToWorkspace`) picks a type there (same name preselected), drops all its link rows, collection items and
  relation values (its own and others' pointing at it), keeps hidden keys, unpins it; one batch.
- Types per workspace (migration 0007): `types.workspace_id` (owner) and `types.enabled` (on/off in it).
  Day and Tag are system types with `workspace_id` NULL: shared, always on, fixed ids. Every other type
  belongs to one workspace; Work's copies of the starters have ids `type_note__ws_work` etc. and slugs with
  a workspace suffix (`/t/person-work`), because slugs are unique across the table. New workspaces get
  their own starter copies (`src/lib/default-types.ts`) in the same batch that creates them. Objects can
  only be created with, or changed to, a type that belongs to their workspace and is on. Turned-off types
  vanish from the sidebar and create menus; their objects stay in search, links and backlinks.
  Opening a type page from another workspace switches to it. Day and Tag can be switched off per workspace: a
  "-<type id>" entry in `workspaces.type_order` (no schema; `setSystemTypeEnabled`, `moveType` keeps the markers).
  Off only hides them from the sidebar and menus; daily notes and # tags keep working.
- Type order is per workspace (migration 0008): `workspaces.type_order` is a JSON array of type ids, read
  with `json_each` in `listTypes`; unlisted types follow by `sort_order`. Day and Tag are ordered per workspace too.
- Dates are picked with `src/components/DatePicker.astro` (own calendar, Monday-first, keyboard: arrows,
  PageUp/Down, Home/End, Enter, Esc). `navigate` mode opens a day note; `field` mode fills a hidden input.
  No native date inputs remain: the type-page filter row and the bulk bar use it too (the unused input is
  disabled so rows stay parallel). Theme: `theme` cookie -> `<html data-theme>`.
- App name in the UI and tab title is "KB".
- Daily notes work like Capacities' calendar quick actions (migration 0009): `types.day_key` names the date
  property that ties a type to days (set under "Daily notes" in the type editor; NULL = off; Project uses Due by
  default). Daily notes show a "+ Type" button per enabled type with a `day_key` (`QuickAdd.astro`); it creates the
  object with that property set to the day, lists it under "Date references" and leaves the note text alone.
  Day pages are `wide`: at xl a side panel holds the month calendar (dots: note, scheduled) and Date references;
  below xl the week strip and an inline Date references list show instead.
- Property kinds: text, number, date, url, checkbox (boolean), select, multiselect (string[]), relation
  (single id, or id[] when `multiple`). `relationIds()` reads either shape; filters use `json_each`, so a single
  value counts as a list of one. Relation links are rebuilt from both shapes.
- Tasks (migration 0010): starter type Task per workspace (`type_task`, `type_task__<ws>`; `isTaskType()`), with
  Done (checkbox), Date (its daily-notes property) and Deadline. Daily notes show a Tasks list: planned for the
  day, plus on today open tasks planned earlier or due today or earlier. Ticking calls
  `POST /api/objects/:id/done` (sets one checkbox via `json_set`). Tasks are left out of Date references.
  "/ Turn into task" in the editor turns the current line into a Task (planned for the day on a daily note,
  done if the checklist item was ticked) and replaces the line with a link to it.
- Tasks page (`/tasks`, sidebar under Home; Task leaves the types list): Today (planned today or due today
  or earlier), Inbox (no date, no deadline), Scheduled (grouped per day, overdue first), Completed (20 latest).
  Forms may post `back=/tasks` to `POST /api/objects` to return there.
- Saved views and collections (migration 0011): `views` (a type page's filters as JSON spec; URL marker `sv`,
  because `v` carries filter values) and `collections` + `collection_items` (hand-picked, one type). Type pages
  show view and collection chips; "Save this as a view" sits in Filter and sort. Objects get a collections field.
- Editor embeds (`src/components/react/blocks.tsx`): `/ Query` embeds a saved view as a live list; `/ Object card`
  shows an object as a small or wide card and counts as a link (doc.ts `OBJECT_CARD`). Selected-embed highlight is
  hidden while the editor isn't focused (global.css).
- Tasks, closer to Capacities (migration 0012): Task also has Status, Priority, Context (relation to any type,
  several), Repeat and Repeat from. Ticking goes through `completeTask` (`src/lib/db/tasks.ts`): one-off tasks get
  `done_at` (shown on that day's note under "Completed this day"); repeating tasks move their Date on
  (`src/lib/task-logic.ts`) and record `last_done`. Property saves merge with `json_patch` so these hidden keys
  survive. Inline title syntax for new tasks: `!`..`!!!` and today/tomorrow/weekday/next week/YYYY-MM-DD (a typed
  date word wins over the page's date). Shortcuts: `() title` + Enter in the editor, Cmd/Ctrl+Shift+T anywhere.
  Today's note offers "Move open to tomorrow / Monday". Objects show a Tasks section for tasks with them as Context.
- Task views (Capacities' task page): `/tasks` has tabs Today (planned today, due/overdue, In progress, done today),
  Inbox (no date, deadline or status), Scheduled, Open (by priority), Board, Completed, plus the Task type's saved
  views. Board (`TaskBoard.astro`): columns by Status, drag or per-card select, `POST /api/tasks/status`; Done ticks
  (repeating tasks move on). Objects' Tasks section toggles List/Board (`?tasks=board`). Time (migration 0013, "2pm",
  "14:00") sorts Today. Subtasks = checkboxes in a task's note, counted with `json_tree` (progress ring).
  Sidebar Tasks has a "+" (`[data-quick-task]`) that opens the palette in task mode.
- Bulk actions (`BulkBar.astro`, `POST /api/bulk`, `src/lib/db/bulk.ts`): "Select" on type pages and the Tasks page;
  rows with `data-select="<id>"` become selectable (click/Space selects, Ctrl/Cmd+A all, Esc stops). Actions: set a
  property (one type; multi-select adds a value; relations excluded; a task's Done goes through `completeTask`),
  add tag, add to collection, move to trash. Only objects in the current workspace are touched.
- Styling: `.field`, `.btn`, `.btn-primary`, `.card`, `.eyebrow`, `kbd` live in `@layer components`, so utilities on
  the same element (w-auto, px-2, py-1.5) override them.
- MCP server at `/mcp` (`src/lib/mcp/server.ts`, MCP SDK v2 `createMcpHandler`, stateless). Tools: list_workspaces,
  list_types, search, get_object, list_objects, get_daily_note, append_to_daily_note, create_object, update_object,
  create_type, add_properties, list_tasks, create_task, set_task_status, complete_task, get_calendar. No deletes. Markdown in, via `src/lib/from-markdown.ts` ([[Title]] links).
  Auth: Cloudflare Access with Managed OAuth; vars ACCESS_TEAM_DOMAIN, ACCESS_AUD, TIMEZONE in wrangler.jsonc.
- Aliases (migration 0014): `objects.aliases`, one per line (`splitAliases`), edited under the title as a comma list
  (`set-aliases`; deduped, never the title). FTS columns are title, aliases, text_content (snippet column 2, bm25
  8/6/1). `@` search ranks title prefix, then alias prefix; the menu shows the matched alias. Unlinked mentions and
  "Link" try the title, then aliases (longest first); the chip shows the real title. MCP `[[Alias]]` resolves too.
- Quick capture: Cmd/Ctrl+Shift+. (`e.code === 'Period'`), the palette command "Capture to today", or the pen button
  in the mobile header (`[data-quick-capture]`). `POST /api/capture` appends Markdown to today's note in the current
  workspace. When today's note is open, its editor claims the `kb:capture` event and inserts the blocks itself
  (`preview: true` only converts), so its autosave can't overwrite a server-side append.
- Calendar depth (migration 0015 turns Task's Time into the new `time` kind): property kind `time` stores "HH:MM"
  (`parseTime` reads "2pm", "9.30", "14:00"). An object's time is its type's first time property, shown next to its
  daily-notes date (Date references, calendar). `/calendar` (sidebar under Tasks): Week (7 columns at xl, a list per
  day below) and Month (cells with up to 3 entries at md+, colored dots on phones); `?view=week|month&d=`, view kept
  in the `cal_view` cookie; keys [ ] t w m. Entries come from `calendarEntries` (`src/lib/db/calendar.ts`): every type
  with a `day_key`, tasks included. Repeating tasks show only their next date. Daily notes up to today have a
  "Mark reviewed" toggle (`POST /api/days/:date/reviewed`, stored as `reviewed_at` in the day's properties); the
  calendar shows it. `DatePicker` navigate mode takes `href` (with `{date}`) and `compact`. MCP: `get_calendar`.
- Icons and covers (no schema): hidden properties `_icon` (one emoji, `cleanEmoji`) and `_cover` (a `preset:<name>` from
  `COVER_PRESETS` or a `/files/` URL), in `src/lib/media.ts`. Keys from labels never start with `_`, and `changeType`
  keeps `_` keys. Summary queries select `icon`; `TypeTile` takes `emoji` and shows it instead of the type icon (lists,
  cards, pinned, palette, @ menu, mention chips via `refs[id].icon`). Object page: `IconPicker` / `CoverPicker`, actions set-icon, remove-icon, set-cover
  (preset or image upload to R2), remove-cover. MCP `update_object` takes `icon`.
- Checklists (no schema): Tasks › Checklists lists unticked `checkListItem` blocks from every non-task object
  (`objectsWithOpenChecklists` finds them with `json_tree`; `openChecklistItems` in doc.ts extracts them). Ticking
  posts `POST /api/objects/:id/checklist {blockId, checked}`, which rewrites that block and saves the note. Not on
  Home on purpose: today's open editor would overwrite the change on its next autosave.
- "+ Type" on object pages (`RelatedAdd.astro`): one button per enabled non-task type with a relation property whose
  target is this object's type. It posts `POST /api/objects` with `relKey` and `relTo` (same workspace only), which
  fills that relation and writes its link rows; the new object shows under "Linked here".
- Richer queries (no schema; all in the URL and the saved view's spec): `also` (more types), `tag` (has every tag),
  `links` (links to an object; the form's `links_title` is resolved to an id by a redirect), `q` (FTS words), `group`
  ('type' or a property; multi-value properties put an item in each group), `limit`, `random=1`, `blocks=1` (show the
  lines that mention the tag / linked object or contain the words). `runQuery` (`src/lib/query-run.ts`) serves the
  type page and the Query block (`viewResults`), so both show the same thing.
- More editor blocks (`blocks.tsx`): `/ Math` (`math`, prop `latex`, KaTeX loaded on first use; click to edit, Esc or
  Cmd+Enter to finish), `/ Columns` (`columns`, prop `count` 2|3; the blocks nested under it sit side by side via CSS
  grid on its child group, stacked under 640px; Tab / Shift+Tab move blocks in and out), `/ Block reference`
  (`blockRef`, props `objectId` + `blockId`; read-only live copy of a block from another note, picked from
  `GET /api/objects/:id/blocks`; counts as a link like an object card). Markdown export: `$$…$$`, `> ↪ from [[Title]]`.
  Custom blocks sit inside `.react-renderer`, so CSS targets `.bn-block > .react-renderer > .bn-block-content`.
- Type page views: List, Cards, Table (all properties as columns, horizontal scroll on phones) and Board (columns
  from the grouped select property, else the first select; `TypeBoard.astro`, drag or per-card select,
  `POST /api/objects/:id/prop {key, value}`; a task's Status goes through `setTaskStatus`). Board and Table use the
  wide layout. The choice is kept in the `view_<slug>` cookie and saved views.
- `astro dev` runs as a managed background process: stop it with `npx astro dev stop` before `db:reset`.

## Code rules

- All SQL lives in `src/lib/db/`. Pages, components and endpoints call typed functions only.
- Prepared statements always. `db().batch()` for any multi-statement write.
- IDs are ULIDs from `src/lib/ulid.ts`. Seed type ids are fixed strings (`type_note`, `type_day`, `type_person`,
  `type_project`, `type_book`, `type_tag`).
- Soft delete only (`deleted_at`). Every read filters `deleted_at IS NULL`, and every list/search filters `workspace_id`.
- `links.origin` is `content` | `tag` | `property`. Autosave rewrites only `origin = 'content'` rows.
- Server-render everything else. Forms post to `src/pages/api/*` and redirect 303.
- Keyboard-first, works at 390px wide.

## Commands

```bash
npm run dev            # local, workerd + local D1
npm run db:migrate     # local migrations
npm run db:reset       # wipe local D1, re-migrate
npm run db:migrate:remote
npm run check && npm run build
```

## Design system ("the feel")

- Neutral light UI: page `#fafaf9`, panels `#f5f5f4`, borders `#e7e5e4`, text `#1c1917`, muted `#78716c`.
  Dark mode mirrors it in stone tones.
- One font: Inter. Titles heavy (`font-bold`, `tracking-tight`). No serif.
- Primary action = solid near-black button. Secondary = white with hairline border.
- Cards: `rounded-xl`, hairline border, soft hover shadow, generous padding.
- Each type has a color and a line icon. Shown as a pastel tile: icon in the type color on a
  ~14% tint of it (`color-mix`). Icons are inline SVG by name in `src/components/Icon.astro`.
- Object pages: small type label (tile + name) above the title.
- Minimal decoration. Whitespace over lines.

## Roadmap

Phases from the original spec. Status in brackets.

1. Foundation [done]: setup, migrations, seed, sidebar, list per type, detail, create/rename/delete, property form.
2. Editor and links [done]: BlockNote with debounced autosave, `@` mention search + inline create,
   backlinks with surrounding text, today's daily note as home with prev/next.
3. Find things [done]: Cmd+K palette (FTS, jump, create), filter and sort list pages, tag pages.
4. Files and types [done]: R2 upload from editor, type editor UI, JSON export.

## Gap analysis vs Capacities

Compared against docs.capacities.io (object types, blocks, organizational structures, daily notes, glossary).
Out of scope by decision, do not build or add hooks for: graph, whiteboard, AI, real-time sync, offline,
native apps, sharing, multi-user, third-party integrations (Readwise, WhatsApp, email-in, API).

Each gap has a priority (P1 = do with its phase, P2 = after phase 4, P3 = only if asked) and the phase it fits.
Items marked SCHEMA need approval of the SQL before building.

### Fold into phase 2 (P1)

- [x] **`[[` as a second link trigger**, same menu as `@`.
- [x] **Inline tags in the editor**: `#` opens a tag picker, inserts a tag mention (stored as a `content` link
      to the tag object). Creates the tag inline if missing. Gives tags on blocks for free.
- [x] **Date mentions**: `@today`, `@tomorrow`, `@2026-11-20` resolve to (and create) Day objects.
- [x] **Daily note date bar**: a week strip with the current day highlighted, prev/next, and a date picker to jump.
- [x] **"On this day" on daily notes**: objects created or edited that day, listed under the editor.
- [x] **Templates per type** SCHEMA: `types.template TEXT` (BlockNote JSON). New objects start with it.
- [x] **Enable BlockNote's built-in blocks**: headings, lists, checklists, toggles, quote, code (with
      highlighting), table, divider. No custom work beyond config.

### Fold into phase 3 (P1)

- [x] **Type dashboard** instead of a flat list: sections "Recent", "Untagged", "No backlinks", and "All"
      (the filter/sort view from phase 3).
- [x] **List / card / table / board views** on type pages. Remembered per type in a cookie (`view_<slug>`) so the server renders it without a flash.
- [x] **Unlinked mentions** on each object: FTS hits on its title in objects that don't link to it, with a
      one-click "link" action.
- [x] **Recently opened** SCHEMA: `objects.opened_at TEXT`, updated on detail view (`waitUntil`, off the
      critical path). Feeds the palette's empty state and the dashboard.
- [x] **Pinned objects in the sidebar** SCHEMA: `objects.pinned_at TEXT`. Toggle on the detail page.
- [x] **Change an object's type** from the type label. Keep property values whose keys match, drop the rest
      after a confirm.

### Fold into phase 4 (P1)

- [x] **Trash view**: list soft-deleted objects, restore, and (only here) permanent purge after confirm.
- [x] **Merge tags**: move all links from tag A to tag B in one batch, soft-delete A.
- [x] **Markdown export** alongside JSON (one `.md` per object, front matter for properties).
- [x] **Type color and icon picker** in the type editor (fixed palette + icon set from `Icon.astro`).

### After phase 4 (P2)

- [x] **Collections** (built as N4) SCHEMA: hand-picked groups within a type. Proposal: a `collections` table
      (`id, type_id, name, created_at, deleted_at`) and `collection_items (collection_id, object_id, position)`.
      Shown as a dashboard section and a filter.
- [x] **Saved queries** (built as N3) SCHEMA: store a type page's filter/sort as a named view. `views (id, type_id, name, spec JSON)`.
- [x] **Object cards in the editor** (built as N5): a custom BlockNote block that renders a linked object as a small or wide
      card (title, type tile, two properties).
- [x] **Open to-dos across objects**: built without a table, read from note content (Tasks › Checklists).
- [x] **Object icon/emoji and cover image**: built without schema, as hidden properties `_icon` and `_cover`.
- [x] **Quick capture**: a global shortcut and a phone-friendly button that appends a line to today's note.

### Gap analysis round 2 (after daily notes, workspaces, per-workspace types)

Checked against docs.capacities.io: properties, object properties, views, task management, daily notes.
Ranked by value for daily use. SCHEMA items need the SQL approved first.

- [x] **N1 Property kinds** SCHEMA-free (JSON): `checkbox`, multi-select labels, and multi-value relation
      ("object select" defaults to multiple in Capacities; ours is single). Foundation for tasks and filters.
- [x] **N2 Tasks** SCHEMA: a Task type with Done (checkbox), Date (when to work on it) and Deadline; the daily
      note gets a Tasks section with tasks dated that day plus overdue ones; checklist items can be turned into
      tasks. Recurring tasks later.
- [x] **N3 Queries in notes** SCHEMA: save a type page's filter/sort as a named view and embed it as a live
      block in any note (Capacities' query blocks). Replaces "Saved queries" above.
- [x] **N4 Collections** (as above).
- [x] **N5 Object embeds / cards** in the editor (as above), then block references (P3).
- [x] **N6 Bulk actions** on type pages: select several, set a property, tag, move to trash.
- [x] **N7 Aliases**: extra names per object, used by `@` search and unlinked mentions.
- [x] **N8 Calendar depth**: a time property and times on scheduled objects; week and month views;
      a "reviewed" mark on daily notes.
- [x] **N9 Icons/covers** and quick capture.
- [x] **Small**: move an object to another workspace [done]; Day/Tag switchable per workspace [done]; date picker in the
      filter row [done]; "+ Type" buttons on other object pages [done].

### Follow-ups from the Capacities docs (tasks, queries, collections, bulk actions)

- [x] **Tasks, closer to Capacities**: Status (Not started / Next up / In progress / Done) and Priority (`!`..`!!!`),
      Context (link to a project or meeting; a Tasks tab on that object), `()` + space and Cmd/Ctrl+Shift+T to
      create, inline syntax ("!! tomorrow"), recurring tasks (fixed schedule or after completion), "move today's
      tasks to tomorrow", and tasks completed on a day shown on that day's note (needs a done date).
- [x] **Queries, closer to Capacities**: several types in one query, filters on tags / backlinks / words,
      group by a property, a limit (also random), and queries that include blocks.
- [x] **Bulk actions** (N6): see docs.capacities.io/reference/bulk-actions.
- Calendar integrations (Google/Outlook sync) stay out of scope: third-party integrations.

### Only if asked (P3)

- [x] Block references and transclusion (read-only live copy; editing happens in the source).
- [x] Math blocks (TeX).
- [x] Two-column and group blocks (Columns block, 2 or 3).
- [x] Tasks as first-class objects with due date and priority syntax (`!!`, `Friday`).
