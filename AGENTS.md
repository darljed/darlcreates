<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Darl Creates — Agent Guide (shared: opencode, Claude, Kiro, Codex)

> This is the cross-agent source of truth. Kiro additionally reads the same rules
> from `.kiro/steering/{product,tech,structure}.md` (kept in sync with this file).
> The full spec lives in `.kiro/specs/darl-creates-ecommerce/` — read it first.

## What this is
A 3D-printing e-commerce platform for a PH micro-business. Customers browse
ready-to-print products, view them in 3D, customize (color/text/size/image), pay
via **GCash with manual reference verification**, and track orders. The owner
(admin) runs catalog, customization schemas, fulfilment, payment verification,
shipping, sales analytics. **Phase 1** = catalog of ready-to-print products.
**Phase 2 (deferred)** = in-browser STL generators producing downloadable
print-ready STLs (admin reviews before printing).

## Stack (verify versions in package.json — don't assume)
Next.js 16 (App Router) · React 19 · TS · Tailwind v4 (CSS config in
`src/app/globals.css`) · shadcn/ui (Radix base, CSS vars) · Drizzle ORM +
PostgreSQL (DB Stack `100.90.200.13:5432` db `darlcreates`, via Tailscale) ·
BetterAuth (Google only) · three + @react-three/fiber/drei (STL viewer) ·
AWS S3 (`darlcreates-uploads`, ap-south-1) · Zod v4.

## Next.js 16 — THIS IS NOT the Next.js you may know
- Read `node_modules/next/dist/docs/` before using an unfamiliar API.
- **Cache Components ON** (`cacheComponents: true`): pages are static by default;
  a runtime value (`new Date()`) during prerender FAILS the build. Use dynamic
  APIs (`cookies()`, `headers()`, `await params`) for per-user data; cache public
  catalog data with `"use cache"` + `cacheLife`.
- `params`/`searchParams` are Promises — `await` them.
- Server Actions self-guard: `requireUser()`/`requireAdmin()` + Zod FIRST; then
  mutate; then `revalidatePath`/`revalidateTag`/`refresh` from `next/cache`.

## Hard rules (non-negotiable)
- **Money = integer centavos** (PHP), floats never; format via `src/lib/money.ts`.
- **Append-only** `payments` + `order_status_history`; no destructive edits to
  financial/audit rows.
- **Immutable snapshots** on cart/order items (config + price at the time).
- **Manual GCash** verification with **separation of duties** (`verifiedBy`).
- **Not BIR-registered**: "Order Acknowledgment" (non-VAT), never "Official
  Receipt"; schema BIR-ready (`orNumber`, `vatCents`) but off.
- **RA 10173**: consent at signup, privacy policy, deletion path.
- **RBAC server-side** on every `/admin` route + admin action
  (`src/lib/session.ts`).
- **shadcn note**: this registry emits `import { cn } from "cn"` — rewrite to
  `@/lib/utils` after `shadcn add`; do NOT install the `cn` npm package.
- **Secrets** in `.env.local` (gitignored); keys documented in `.env.example`.

## Workflow
Plan → branch off `develop` → implement (follow existing patterns) → self-review
→ **gate** (`npm run build` 0 errors, `npm run typecheck`, relevant
`scripts/test-*.ts`) → browser E2E on storefront happy path → PR → review →
docs. Never merge without explicit permission. Don't push to `develop`/`master`
directly. Don't run destructive git/DB ops without confirmation.

## Commands
`npm run dev|build|start|lint|typecheck` · `npm run db:generate|db:migrate|db:push|db:studio`
· tests: `npx tsx scripts/test-<feature>.ts`.

## AWS — use the right account (critical)
- Darl Creates uses AWS profile **`darljed`** = account `551892774595`
  (djam.devteam@gmail.com). **Never** use `default`, `pmpc-preprod`, `pmpc-prod`
  (PMPC account `535066803233`).
- Always pass `--profile darljed`; confirm with
  `aws sts get-caller-identity --profile darljed` before any write.
- App S3 credentials in `.env.local` must be a dedicated key scoped to
  `darlcreates-uploads` only. Region `ap-south-1`.

## Where the work is tracked
`docs/roadmap-and-gaps.md` is the live gap tracker (IDs G-xx / T-xx / F-xx).
Reference IDs in commits; move rows to Resolved when fixed. Setup/ops detail:
`docs/setup.md`. Why-decisions: `docs/decisions.md`.

## Session reads (Next 16)
`getCurrentUser()` calls `await connection()` (session expiry uses the current time; forbidden during prerender). Call it only inside `<Suspense>` or a dynamic segment. See `docs/decisions.md` D-16.

## Instant validation + S3 CORS
A layout's `instant = false` does not cover child pages: a page that awaits `params`/`searchParams` outside `<Suspense>` needs its own `instant = false` or a Suspense boundary. Browser uploads to S3 need the page origin in the bucket CORS rules; check with `npx tsx scripts/test-cors.ts`.
