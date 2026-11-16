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
  Opening an object from another workspace switches to it. Moving objects between workspaces is not built.
- Types per workspace (migration 0007): `types.workspace_id` (owner) and `types.enabled` (on/off in it).
  Day and Tag are system types with `workspace_id` NULL: shared, always on, fixed ids. Every other type
  belongs to one workspace; Work's copies of the starters have ids `type_note__ws_work` etc. and slugs with
  a workspace suffix (`/t/person-work`), because slugs are unique across the table. New workspaces get
  their own starter copies (`src/lib/default-types.ts`) in the same batch that creates them. Objects can
  only be created with, or changed to, a type that belongs to their workspace and is on. Turned-off types
  vanish from the sidebar and create menus; their objects stay in search, links and backlinks.
  Opening a type page from another workspace switches to it.
- Type order is per workspace (migration 0008): `workspaces.type_order` is a JSON array of type ids, read
  with `json_each` in `listTypes`; unlisted types follow by `sort_order`. Day and Tag are ordered per workspace too.
- Dates are picked with `src/components/DatePicker.astro` (own calendar, Monday-first, keyboard: arrows,
  PageUp/Down, Home/End, Enter, Esc). `navigate` mode opens a day note; `field` mode fills a hidden input.
  Native date inputs remain only in the type-page filter row. Theme: `theme` cookie -> `<html data-theme>`.
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
- [x] **List / card view toggle** on type pages. Remembered per type in a cookie (`view_<slug>`) so the server renders it without a flash.
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

- [ ] **Collections** SCHEMA: hand-picked groups within a type. Proposal: a `collections` table
      (`id, type_id, name, created_at, deleted_at`) and `collection_items (collection_id, object_id, position)`.
      Shown as a dashboard section and a filter.
- [ ] **Saved queries** SCHEMA: store a type page's filter/sort as a named view. `views (id, type_id, name, spec JSON)`.
- [ ] **Object cards in the editor**: a custom BlockNote block that renders a linked object as a small or wide
      card (title, type tile, two properties).
- [ ] **Open to-dos across objects**: extract checklist items on save into a `todos` table
      (`object_id, block_id, text, done`) and show an "Open to-dos" list on the home page. SCHEMA.
- [ ] **Object icon/emoji and cover image** SCHEMA: `objects.icon`, `objects.cover_key` (R2).
- [ ] **Quick capture**: a global shortcut and a phone-friendly button that appends a line to today's note.

### Gap analysis round 2 (after daily notes, workspaces, per-workspace types)

Checked against docs.capacities.io: properties, object properties, views, task management, daily notes.
Ranked by value for daily use. SCHEMA items need the SQL approved first.

- [x] **N1 Property kinds** SCHEMA-free (JSON): `checkbox`, multi-select labels, and multi-value relation
      ("object select" defaults to multiple in Capacities; ours is single). Foundation for tasks and filters.
- [x] **N2 Tasks** SCHEMA: a Task type with Done (checkbox), Date (when to work on it) and Deadline; the daily
      note gets a Tasks section with tasks dated that day plus overdue ones; checklist items can be turned into
      tasks. Recurring tasks later.
- [ ] **N3 Queries in notes** SCHEMA: save a type page's filter/sort as a named view and embed it as a live
      block in any note (Capacities' query blocks). Replaces "Saved queries" above.
- [ ] **N4 Collections** (as above).
- [ ] **N5 Object embeds / cards** in the editor (as above), then block references (P3).
- [ ] **N6 Bulk actions** on type pages: select several, set a property, tag, move to trash.
- [ ] **N7 Aliases**: extra names per object, used by `@` search and unlinked mentions.
- [ ] **N8 Calendar depth**: a time property and times on scheduled objects; week and month views;
      a "reviewed" mark on daily notes.
- [ ] **N9 Icons/covers** and **quick capture** (as above).
- [ ] **Small**: move an object to another workspace; Day/Tag switchable per workspace; date picker in the
      filter row; "+ Type" buttons on other object pages (KB's own idea, not in Capacities).

### Only if asked (P3)

- [ ] Block references and transclusion (embed another object's block, edit in place).
- [ ] Math blocks (TeX).
- [ ] Two-column and group blocks.
- [ ] Tasks as first-class objects with due date and priority syntax (`!!`, `Friday`).
