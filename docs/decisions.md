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
`~/Downloads/Logo`. The first set (1-6.png) was black-only, so the blue primary is
an owner choice, not derived from the logo.

**Second logo set (2026-11-10), adopted:** `logo+text-black.png` and
`logo+text-white.png` — the same icon + wordmark, differing only in wordmark
color. Measured: the icon is pixel-identical in both (black with opaque white
fills and a white outline), so it reads on any background; only the wordmark
needs swapping. The black file disappears on dark backgrounds and the white file
on light ones, so both are wired in: `BrandLogo` renders the black one with
`dark:hidden` and the white one with `hidden dark:block`. This replaced the
earlier `dark:invert` hack, and the old stacked/tagline art was removed.
Sources are kept in `brand/source/`; `scripts/build-brand-assets.py` regenerates
`public/brand/*` and the favicon/apple-icon (white mark on brand blue).
The tagline ("Your 3D Printing and Modeling Partner") is not in the new files.

## D-18 — STL viewer: size-independent framing
Models arrive in unpredictable positions and units (slicers export at the bed
middle; CAD may use meters). The viewer therefore never trusts the file's origin or
scale: it centers the geometry on its own bounding box, derives camera distance,
clip planes and zoom limits from the bounding radius, and orbits the *camera*
(OrbitControls `autoRotate`) instead of spinning the mesh. Default elevation is
10°: with perspective, the higher the camera looks down on an elongated part the
lower its silhouette sits (measured 0.07 NDC offset at 0°, 0.11 at 10°, 0.22 at
32°). Logic lives in `src/lib/viewer-framing.ts` (pure, tested).

## D-19 — 3MF alongside STL (owner request)
Owner wants to use 3MF in place of STL. Supported for upload and preview; STL still
works. Choices: (1) new prefix `models/`, legacy `stl/` keys remain valid; (2) DB
column `stl_key` keeps its name; (3) 3MF is checked for the ZIP signature server-side
before attaching, content type is forced from the extension; (4) the viewer keeps
colors that are in the file and only paints parts that have none with the customer's
swatch, so multi-color files stay multi-color; (5) viewer framing is size-independent
because 3MF and STL differ in units and origin. 3MF parsing needs a browser
(`DOMParser`), so it is tested in a real browser, not in Node. Detail and the
personalization plan: [personalization-and-3mf.md](./personalization-and-3mf.md).

## D-20 — Order logic lives in a service layer; the DB enforces payment rules
Server Actions mixed auth, validation and business rules, which made the rules untestable
without a request context and left check-then-write races (two admin clicks could both verify;
a payment on a cancelled order could be marked verified). Rules now live in `order-service.ts`
(transactions + `FOR UPDATE`), and the invariants that must never break are also enforced by
partial unique indexes, so a bug in app code cannot create a duplicate live reference.
The client never supplies money: amounts come from the order row.

## D-21 — Customer uploads are untrusted and never public
Customers can now put files in our bucket, so: (1) keys are bound to the uploader (`customer/<userId>/`);
(2) type is decided from the file's bytes, not its name or the browser's content type; (3) SVG/GIF are
refused (SVG can carry script); (4) the server rebuilds the stored selection from the product schema so
no foreign S3 key can ride along; (5) `/api/files` never serves `customer/` or `proof/`; only the owner
(signed URL on their own pages) and the admin can see them. Nothing prints automatically; the admin reviews.

## D-22 — Account deletion anonymizes; it does not erase business records
RA 10173 gives people the right to erasure, but a seller also has to keep sales records. So deletion
removes everything that identifies the person (name, email, linked Google account, sessions, saved
addresses, cart, reviews, uploaded images, the delivery address on past orders) and keeps the order and
payment rows (amounts, status, GCash reference) with no link back to a named person. It is refused while
an order is still in progress so we never lose the address of something we owe someone. The Order
Acknowledgment of a deleted account shows "address removed". The retention period itself is an open
question for the owner/accountant (G-43).

## D-23 — Consent is versioned and enforced in `requireUser`
Every page and action that needs a signed-in customer goes through `requireUser`, which sends users
without current consent to `/consent`. Changing `PRIVACY_VERSION` (src/lib/business.ts) re-asks everyone.
`/consent` itself uses `getCurrentUser` to avoid a redirect loop. The admin area is gated by `requireAdmin`
only (the owner is the data controller).

## D-24 — One custom inset shell, density from one place
`npx shadcn add sidebar` hung (like `init` before it), and the CLI re-adds a stray `cn` npm package, so
`src/components/shell/inset-shell.tsx` is hand-built (collapsible desktop sidebar, mobile sheet, breadcrumbs,
skip link). The shell sets `data-density="compact|comfortable"`; the page primitives (`shell/ui.tsx`) and an
unlayered block in `globals.css` key off it, so a control is never edited per page. Tables are square
(`DataTable`); panels `rounded-lg`. Admin = compact, customer area = comfortable. The storefront, cart,
checkout and consent keep the top-header layout. After any `shadcn add`: `npm uninstall cn` and rewrite
`from "cn"` imports to `@/lib/utils`.

## D-25 — Landing page is content in the DB, validated by code
`site_content(key, data jsonb)` holds one row, `home`. The JSON shape lives in
`src/lib/site-content-schema.ts` (Zod + defaults), not in the DB, and is re-validated on every read: an
invalid or missing row falls back to the built-in defaults, so the page cannot break. Safety: everything renders
as React text (no raw HTML); links pass `isSafeHref` (paths, `#anchors`, https/http, mailto, tel; never
`javascript:` or `//host`); icons come from an allowlist. `getHomeContent()` is `"use cache"` + tag `site:home`;
saving calls `revalidateTag("site:home","max")`. The optional hero image uses a new public `site/` prefix: presign kind
`site` (admin only), the save action checks the object exists, size and magic bytes, and `/api/files` serves a
`site/` key only while it is the current hero image. A replaced or removed image is deleted (best effort); an image
uploaded but never saved stays orphaned in S3.

## D-26 — Customer cancel is limited to unpaid orders
`cancelOwnOrder` works only on `awaiting_payment` with no pending payment (row-locked, recorded in the append-only
history with the customer as actor). Once money may have been sent, the owner decides. Known tiny race: a
reference submitted in the same instant as a cancel can leave a pending payment on a cancelled order; `verifyPayment`
refuses it, so the owner rejects it. "Buy again" re-adds items through `addToCart`, so prices are recomputed and
unpublished products are skipped with a reason.
