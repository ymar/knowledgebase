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
- No auth code. Cloudflare Access sits in front.
- `src/fetch.ts` is a reserved filename in Astro 7. Don't use it.

## Code rules

- All SQL lives in `src/lib/db/`. Pages, components and endpoints call typed functions only.
- Prepared statements always. `db().batch()` for any multi-statement write.
- IDs are ULIDs from `src/lib/ulid.ts`. Seed type ids are fixed strings (`type_note`, `type_day`, `type_person`,
  `type_project`, `type_book`, `type_tag`).
- Soft delete only (`deleted_at`). Every read filters `deleted_at IS NULL`.
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
2. Editor and links: BlockNote with debounced autosave, `@` mention search + inline create,
   backlinks with surrounding text, today's daily note as home with prev/next.
3. Find things: Cmd+K palette (FTS, jump, create), filter and sort list pages, tag pages.
4. Files and types: R2 upload from editor, type editor UI, JSON export.

## Gap analysis vs Capacities

Compared against docs.capacities.io (object types, blocks, organizational structures, daily notes, glossary).
Out of scope by decision, do not build or add hooks for: graph, whiteboard, AI, real-time sync, offline,
native apps, sharing, multi-user, third-party integrations (Readwise, WhatsApp, email-in, API).

Each gap has a priority (P1 = do with its phase, P2 = after phase 4, P3 = only if asked) and the phase it fits.
Items marked SCHEMA need approval of the SQL before building.

### Fold into phase 2 (P1)

- [ ] **`[[` as a second link trigger**, same menu as `@`.
- [ ] **Inline tags in the editor**: `#` opens a tag picker, inserts a tag mention (stored as a `content` link
      to the tag object). Creates the tag inline if missing. Gives tags on blocks for free.
- [ ] **Date mentions**: `@today`, `@tomorrow`, `@2026-11-20` resolve to (and create) Day objects.
- [ ] **Daily note date bar**: a week strip with the current day highlighted, prev/next, and a date picker to jump.
- [ ] **"On this day" on daily notes**: objects created or edited that day, listed under the editor.
- [ ] **Templates per type** SCHEMA: `types.template TEXT` (BlockNote JSON). New objects start with it.
- [ ] **Enable BlockNote's built-in blocks**: headings, lists, checklists, toggles, quote, code (with
      highlighting), table, divider. No custom work beyond config.

### Fold into phase 3 (P1)

- [ ] **Type dashboard** instead of a flat list: sections "Recent", "Untagged", "No backlinks", and "All"
      (the filter/sort view from phase 3).
- [ ] **List / card view toggle** on type pages. Remember the choice per type in localStorage.
- [ ] **Unlinked mentions** on each object: FTS hits on its title in objects that don't link to it, with a
      one-click "link" action.
- [ ] **Recently opened** SCHEMA: `objects.opened_at TEXT`, updated on detail view (`waitUntil`, off the
      critical path). Feeds the palette's empty state and the dashboard.
- [ ] **Pinned objects in the sidebar** SCHEMA: `objects.pinned_at TEXT`. Toggle on the detail page.
- [ ] **Change an object's type** from the type label. Keep property values whose keys match, drop the rest
      after a confirm.

### Fold into phase 4 (P1)

- [ ] **Trash view**: list soft-deleted objects, restore, and (only here) permanent purge after confirm.
- [ ] **Merge tags**: move all links from tag A to tag B in one batch, soft-delete A.
- [ ] **Markdown export** alongside JSON (one `.md` per object, front matter for properties).
- [ ] **Type color and icon picker** in the type editor (fixed palette + icon set from `Icon.astro`).

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

### Only if asked (P3)

- [ ] Block references and transclusion (embed another object's block, edit in place).
- [ ] Math blocks (TeX).
- [ ] Two-column and group blocks.
- [ ] Tasks as first-class objects with due date and priority syntax (`!!`, `Friday`).
