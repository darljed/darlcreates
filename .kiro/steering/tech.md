# Darl Creates — Tech Stack & Conventions

## Stack (as installed — verify versions in package.json, don't assume)
- **Next.js 16** (App Router) + **React 19** + TypeScript. `src/` dir, `@/*` alias.
- **Tailwind v4** (CSS config in `src/app/globals.css`, no `tailwind.config`).
- **shadcn/ui** (new-york, Radix base, CSS variables) — components in
  `src/components/ui`, util `cn` in `src/lib/utils`.
- **Drizzle ORM** + `drizzle-kit` (schema in `src/db/schema/*`, client `src/db`).
- **PostgreSQL** — DB Stack on the agent-server (`100.90.200.13:5432`, db
  `darlcreates`), reached via Tailscale. Local Postgres acceptable for dev.
- **BetterAuth** (`src/lib/auth.ts`) — Google OAuth only. Client in
  `src/lib/auth-client.ts`; route handler at `app/api/auth/[...all]`.
- **3D**: `three` + `@react-three/fiber` + `@react-three/drei` (STL viewer),
  dynamically imported (`ssr:false`), reduced-motion aware.
- **AWS S3** (`darlcreates-uploads`, ap-south-1) for STL/photos/customer images.
- **Zod v4** at every trust boundary. **Email** via SMTP/SES.

## Next.js 16 gotchas (THIS is not the Next.js you may know — read the docs)
- Always read `node_modules/next/dist/docs/` before using an unfamiliar API.
- **Cache Components is ON** (`cacheComponents: true`). Pages are static by
  default: a runtime value like `new Date()` during prerender FAILS the build.
  For dynamic/per-user data (cart, orders, admin), access dynamic APIs
  (`cookies()`, `headers()`, `await params`) or mark the boundary; cache only
  public catalog data with `"use cache"` + `cacheLife`.
- `params` and `searchParams` are **Promises** — `await` them.
- Server Actions must self-guard: `requireUser()`/`requireAdmin()` + Zod FIRST.
  Use `revalidatePath`/`revalidateTag`/`refresh` from `next/cache` after mutations.

## Conventions
- **Mutations via Server Actions**, never business logic in client components.
- **RBAC server-side** on every `/admin` route + admin action
  (`src/lib/session.ts`: `requireUser`, `requireAdmin`, `isAdmin`).
- **Money** only through `src/lib/money.ts` (integer centavos).
- **shadcn note**: this registry variant emits `import { cn } from "cn"`. After
  `shadcn add`, rewrite those to `@/lib/utils`. Do NOT install the `cn` npm pkg.
- **Secrets** in `.env.local` (gitignored). `.env.example` documents the keys.

## Commands
- Dev server: `npx next dev -p 3001` (3000 belongs to another project; the public Funnel URL forwards to 3001). Build next to a running dev server: `NEXT_DIST_DIR=.next-build npx next build`, then `rm -rf .next-build`.
- `npm run dev` / `build` / `start` / `lint` / `typecheck`
- `npm run db:generate` (migration from schema) / `db:migrate` / `db:push` /
  `db:studio`
- Tests: `npx tsx scripts/test-<feature>.ts` (isolated prefixed data, assert,
  clean up). Run before marking work done.

## Verification gate (before declaring any task done)
1. `npm run build` (0 errors) 2. `npm run typecheck` 3. `npx eslint src scripts` (0 warnings) 4. `scripts/test-docs.ts` + relevant `scripts/test-*.ts`
5. for data writes, check DB consistency (no orphans/dupes).

## AWS — right account (critical)
Use AWS profile **`darljed`** (account `551892774595`, djam.devteam@gmail.com)
only. Never `default` / `pmpc-preprod` / `pmpc-prod` (PMPC account). Always pass
`--profile darljed` and confirm identity before writes. App S3 key = dedicated,
scoped to `darlcreates-uploads`.

## Tracking
Gaps/next steps: `docs/roadmap-and-gaps.md` (G-/T-/F- IDs). Setup & ops:
`docs/setup.md`. Decisions: `docs/decisions.md`.

## Session reads
`getCurrentUser()` (src/lib/session.ts) calls `await connection()` first, because the session check uses the current time and Cache Components forbids that during prerender. Callers must be inside `<Suspense>` or a dynamic segment (`instant = false`). Don't use `use cache: private` for it. See docs/decisions.md D-16.

## Instant validation
A layout's `export const instant = false` does NOT cover its child pages. A page that `await`s any uncached data (DB, params, searchParams) outside `<Suspense>` needs its own `instant = false` (admin/per-user pages) or a Suspense boundary. Direct browser uploads to S3 also need the page's origin in the bucket CORS (`scripts/test-cors.ts`). `npx tsx scripts/test-instant.ts` checks every admin page has the opt-out (the build does NOT catch this; it is a dev-overlay warning).

## Docs to read before changing things
`docs/README.md` indexes everything. Most useful: `configuration.md` (env and constants), `order-lifecycle.md`, `security.md`,
`design-system.md` (UI rules), `code-map.md` (where everything is), `operations.md` (run, migrate, troubleshoot).
