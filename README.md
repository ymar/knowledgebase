# Cairn

A personal, single-user knowledge app. Everything is a typed object, and objects link to each other.

Astro 7 (SSR) on Cloudflare Workers, D1 for data, R2 for files, Tailwind 4. React is used only for the editor and command palette (from phase 2). Cloudflare Access handles auth, so the app has none.

## Local development

```bash
npm install
npm run db:migrate   # applies migrations/ to the local D1 (kept in .wrangler/state)
npm run dev          # http://localhost:4321
```

```bash
npm run db:reset     # wipe local D1 and re-apply migrations
npm run check        # astro type check
npm run build
```

Bindings (`DB`, `FILES`) are declared in `wrangler.jsonc` and read in code with
`import { env } from 'cloudflare:workers'`. Run `npm run types` after changing that file.

## Deploy

1. `npx wrangler d1 create cairn-db`, then put the returned `database_id` in `wrangler.jsonc`.
2. `npx wrangler r2 bucket create cairn-files`.
3. `npm run db:migrate:remote`, then `npx astro build && npx wrangler deploy`.
4. Put Cloudflare Access in front of the Worker.

All SQL lives in `src/lib/db/`. Pages and components never touch SQL.
