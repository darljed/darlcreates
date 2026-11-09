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
- `npm run dev` / `build` / `start` / `lint` / `typecheck`
- `npm run db:generate` (migration from schema) / `db:migrate` / `db:push` /
  `db:studio`
- Tests: `npx tsx scripts/test-<feature>.ts` (isolated prefixed data, assert,
  clean up). Run before marking work done.

## Verification gate (before declaring any task done)
1. `npm run build` (0 errors) 2. `npm run typecheck` 3. relevant `scripts/test-*.ts`
4. for data writes, check DB consistency (no orphans/dupes).
