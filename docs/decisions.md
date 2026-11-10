# Decision Log

Why things are the way they are. Newest at the bottom. Add an entry when a
decision changes the architecture, scope, or a hard rule.

## D-01 — Brand & product
**Darl Creates** — a 3D-printing shop. Start with simple products (phone-stand
keychain, clickers, name keychains). Pipeline: login → pick → customize →
checkout → track → review. Owner controls catalog, options, orders, payment
verification, shipping, revenue.

## D-02 — Phasing (owner decision)
- **Phase 1:** catalog of standard, ready-to-print products; customizations are
  *predefined options* (color / size / text / image). Admin uploads pre-made
  print-ready STLs.
- **Phase 2:** custom-product **generators** that create a real downloadable STL.
  Rationale: generating print-ready geometry is the hardest part; shipping the
  catalog first gets the shop selling. See [phase-2-generators.md](./phase-2-generators.md).
- The owner chose "generate real STL" (not preview-only) as the end goal.

## D-03 — Stack
Next.js (App Router) + TypeScript, shadcn/ui, Drizzle ORM, PostgreSQL (DB Stack),
BetterAuth with Google only, react-three-fiber for the STL viewer, AWS S3 for
files, Zod at trust boundaries. Chosen by the owner except where noted; BetterAuth
and Drizzle were explicit picks.

## D-04 — Manual GCash verification
The owner is **not BIR-registered** and takes payment via GCash with manual
reference-number checking. The system therefore:
- shows GCash instructions + exact amount, collects a reference number
- queues it for the owner to verify against their GCash history
- records the verifier (`verified_by`) — separation of duties
- keeps payments **append-only** (re-submission = new row)
- issues a non-VAT **"Order Acknowledgment"**, never an "Official Receipt"
- keeps `or_number` / `vat_cents` columns ready but unused until BIR registration

## D-05 — Money is integer centavos
All amounts are integers (`*_cents`); one module (`src/lib/money.ts`) formats and
parses. No floats anywhere in the money path.

## D-06 — Immutable snapshots
Cart and order items snapshot the customization config and price; orders snapshot
the shipping address and the product's STL key. Editing a product later never
changes history. Prices are **recomputed server-side** at add-to-cart and at
order placement — the client price is a preview only.

## D-07 — Append-only ledgers
`payments` and `order_status_history` are never destructively edited. Order status
changes follow a fixed forward-only map (`ORDER_TRANSITIONS`).

## D-08 — Next.js 16 with Cache Components
The scaffold is Next 16.4 / React 19.3 and ships Cache Components on. Consequences
we built around:
- public catalog + reviews are cached with `"use cache"` + tags, invalidated via
  `revalidateTag(tag, "max")` on admin edits
- per-user pages stream dynamic content inside `<Suspense>`
- `/admin` and `/orders/[orderNo]` use `export const instant = false`
- `params`/`searchParams` are Promises; runtime values like `new Date()` can't
  be read during prerender
- consequence still open: signed S3 URLs inside cached pages (G-03) and
  build-time DB access (G-04)

## D-09 — Authorization
Server-side only: `requireAdmin()` in the admin layout and in every admin Server
Action / route handler (Server Actions are directly POST-able, so the layout check
alone is not enough). The `role` column is never settable from the client
(`input: false`). Promotion to admin is a CLI script.

## D-10 — Design system: "Vibrant Pop"
Requested direction: bold saturated accents, strong type hierarchy, energetic
rounded shapes, playful interactions.
**Update 2026-11-10:** primary is now cyan-blue and the real logo is applied (D-17).
**Caveat:** the reference page (`unslop.site/reference/vibrant-pop`) is JS-rendered
and could not be fetched, so the theme was built from the written brief alone
(magenta primary, cyan secondary, lime accent, Plus Jakarta Sans, 2px borders,
hover lift). If you export the unslop.site HTML, we can match exact computed
values. Tokens live in `src/app/globals.css`; swap for the real logo palette when
available (G-24).

## D-11 — Multi-agent steering
One shared rules file (`AGENTS.md`) for opencode/Codex, `CLAUDE.md` pointing to
it, and `.kiro/steering/*` for Kiro, plus the Kiro spec as the scope source.

## D-12 — Infrastructure
- DB: new database `darlcreates` + role on the agent-server Postgres (created
  2026-11-09, owner-approved). Additive only; nothing else on that box touched.
- AWS: **profile `darljed` / account `551892774595` (djam.devteam@gmail.com)**
  only. PMPC profiles are a different account and are off-limits for this project.
- S3 bucket `darlcreates-uploads` approved in principle; **not yet created**.

## D-13 — Testing approach
`scripts/test-*.ts` run with `tsx`: assert helpers, isolated prefixed data,
cleanup, no framework. Currently money, pricing, and an order-lifecycle script.
Known weakness: the lifecycle script doesn't call the real Server Actions (G-15).

## D-14 — File delivery: request-time signing, no CloudFront (resolves G-03)
Cached/prerendered pages must not contain expiring signed URLs. Pages embed the
stable path `/api/files/<key>` (`fileUrl()`); the route signs a fresh 5-minute S3
URL on each request and redirects. Bucket stays fully private. Trade-off: one
extra redirect per image/STL and a DB lookup to authorize; fine at this scale.
Upgrade path: CloudFront with signed cookies/URLs if traffic or latency demands it.
Customer uploads and payment proofs (`customer/`, `proof/`) are never served by
this route.

## D-15 — Dedicated app credentials for S3
Bucket created in account 551892774595 (profile `darljed`). The app uses IAM user
`darlcreates-app` whose only permissions are Get/Put/DeleteObject on
`darlcreates-uploads/*` and ListBucket on the bucket. Verified denied on other
buckets, list-buckets and IAM. Presigned PUTs sign `content-type`
(an unsigned header was found to let a different type through — fixed and tested).

## D-16 — Session reads are marked request-time (`connection()`)
Next 16 (Cache Components) refuses to evaluate `new Date()` during prerender.
BetterAuth's session check compares the expiry to the current time, so the dev
server raised a "Blocking Route: unstable value new Date()" error on `/products`
(stack: `getCurrentUser` -> `SiteHeader` -> `ShopLayout`). Fix per the Next docs:
`getCurrentUser()` calls `await connection()` first, so the whole read is
excluded from prerendering. Every caller must therefore sit inside `<Suspense>`
or a dynamic segment (`instant = false`) — the build enforces this.
Rejected alternative: `"use cache: private"` — it would cache the signed-in
state in the browser and could show a stale session after sign-out.

## D-17 — Brand: blue theme and logo
Owner asked for cyan/blue as the main color and to use the logo set in
`~/Downloads/Logo`. Logo is black-only (no brand color), so primary is a chosen
cyan-blue. Files used: the three **transparent** versions (stacked, icon,
horizontal); the white-background duplicates are not used. Originals are kept in
`brand/source/`; web assets are generated by `scripts/build-brand-assets.py`
(re-run it if the logo changes). Header uses the horizontal logo without its
tagline (illegible at header size); the tagline version is available as
`BrandLogo variant="tagline"`.
