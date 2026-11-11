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
The owner takes payment via GCash with manual reference-number checking. The system therefore:
- shows GCash instructions + exact amount, collects a reference number
- queues it for the owner to verify against their GCash history
- records the verifier (`verified_by`) — separation of duties
- keeps payments **append-only** (re-submission = new row)
- gives the customer a printable **"Order Acknowledgment"** (what was ordered, amounts, delivery address)
- keeps `or_number` / `vat_cents` columns reserved but unused

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
without current consent to `/consent`. The version now lives in the privacy policy document (D-28); saving it with "ask again" ticked re-asks everyone.
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

## D-27 — Dev-only trusted origins for BetterAuth
BetterAuth rejects POSTs (e.g. sign-out) whose `Origin` isn't `baseURL` (`INVALID_ORIGIN`). `baseURL` is the Funnel
host, so sign-out failed when browsing the dev server via `localhost`. `trustedOrigins` now lists localhost
(ports 3000/3001) when `NODE_ENV !== "production"`; production trusts `baseURL` only.

## D-28 — Footer, privacy policy and terms are owner-editable documents
`site_content` keys `site`, `legal:privacy`, `legal:terms` (alongside `home`). They are separate documents on purpose:
each admin page saves only its own, so two editors can never overwrite each other. Legal text is plain text in a
tiny format parsed to React elements (never HTML): `## Heading`, `- ` bullets, `[text](url)` links that pass
`isSafeHref`. A `## ` line is always its own heading even if text follows on the next line.
**The privacy version moved from a code constant to the policy document.** It changes only when the owner ticks
"Ask every customer to accept this policy again" (a fresh timestamp). The browser can never choose it, and a typo fix
does not re-ask anyone. `requireUser` reads it through `getPrivacyVersion()` (cached, tag `site:legal:privacy`);
`privacy.ts` stays framework-free by taking the version as an argument. The default Terms text is a draft written for
this business; the owner or a lawyer must review both texts (T-09).

## D-29 — Tables stack into cards on phones
`DataTable` rows turn into labelled cards below 640 px (CSS in `globals.css`, `<Td label="…">` supplies the label) instead
of scrolling sideways, so actions such as Verify / Reject are never off-screen. The header row stays for screen readers.
Trade-off: `display: block` on table parts can drop table semantics in some screen readers on phones; revisit if the
a11y audit (G-22) flags it. Everything else is checked with a scan for horizontal overflow at 320 and 375 px.

## D-30 — Logos are uploaded, verified on the server, and served with a long cache
Six slots (`branding-schema.ts`): wide logo (navbar, footer, customer sidebar), dark-background logo, icon mark (admin
sidebar, sign-in), favicon, phone home-screen icon, link-sharing (Open Graph) image. Each slot has a size/shape/type/size-limit rule
(`checkLogo`). The browser checks first for instant feedback, but the server re-reads the file's real bytes
(`image-size.ts` reads PNG/JPEG/WebP headers) and stores the dimensions it measured; a rejected upload is deleted from S3.
**SVG is not accepted**: it can carry script and these files are served from our own domain. `BrandLogo` is an async server
component using uploaded files (plain `<img>` with real width/height) or the built-in ones. The favicon/Apple/OG images are set in
the root `generateMetadata`; the old file-convention icons moved to `public/brand/` because a file-based icon would override the
uploaded one. `/api/files` streams `site/` files with `immutable` caching (names are unique per upload, so a replaced logo gets
a new URL) instead of redirecting each visitor to S3.

## D-31 — Legal editor keeps unsaved text, and the version stays server-side
The legal workspace keeps both editors mounted so switching tabs never loses text, warns on leaving with unsaved changes, and
compares against the last saved text (undoing an edit returns to "all changes saved"). Toolbar actions are pure functions in
`legal-format.ts` (tested). The privacy version still can't be chosen by the browser (D-28).

## D-32 — Demo data is deterministic, tagged, and removable in one command
`seed-demo.ts` uses a fixed random seed, so screenshots and bug reports are reproducible, and tags every row and file it creates, so
`clear` is exact and never touches real data. It writes through the same tables the app uses (not through the service layer) so it can backdate
timestamps; `test-data-integrity.ts` is the guard that the backdated data still obeys the app's rules (it caught the seed putting two history rows
on the same instant). The demo products are published on purpose, to review the real storefront; remove them before launch.

## D-33 — User management for a Google-only app
There are no passwords, so "reset password" is: **sign out everywhere** (the next sign-in is a fresh Google sign-in), plus block/unblock and re-consent.
Blocking is enforced in two places: a BetterAuth `session.create.before` hook (no session can ever be created for a blocked user) and `requireUser`;
blocking also deletes existing sessions in the same transaction. The block reason is private and the user only sees a generic "can't sign in right now".
Admins can't be blocked or deleted from the UI and you can't act on yourself (so the owner can never lock themselves out). Editing an email changes what *we* hold; the
Google link is by account id, so they still sign in normally. Every action writes `admin_audit` in the same transaction as the change. We deliberately did not add
"sign in as this user" (impersonation): it would let an admin act as a customer unseen. Role changes (making someone an admin) are not in the UI either.

## D-34 — Removing things must expire the cache immediately
`revalidateTag(tag, "max")` is stale-while-revalidate: the next visitor still gets the old page. For a removed or unpublished product that means a link that 404s.
Admin Server Actions now use `updateTag` (immediate), and the scripts endpoint uses `{ expire: 0 }`. Next's built-in 404 page also forces its own black/white
colours (and a dark variant) over the site theme, so every route group has a `not-found.tsx` built from the site's tokens, and `color-scheme: light` is set until a real dark theme exists (G-30).

## D-35 — Add to cart never redirects; the product page resumes it
`addToCartAction` used to call `requireUser()`, which redirects. From a client component that redirect threw away a customized product (and `requireUser()` with no argument sent users home after consent, not back to the product). Now the action returns `{ needs: "sign_in" | "consent" }` (from `getAccess()` in `session.ts`). The customizer stores the choices plus an "add" flag in `sessionStorage` (30 minutes, at most 2 retries), sends the customer through `/sign-in` or `/consent` with `redirect` set to the product page, and on return finishes the add by itself ("Added to cart" toast). Other actions still use `requireUser()`: they are not tied to unsaved client-side work.

## D-36 — The internal waybill is a derived page, not a stored record
The waybill is the order number as a Code 128 barcode plus ship-to, pack list and tick boxes, rendered on demand at `/admin/orders/[id]/waybill` (A6). Nothing is stored: the order number is already unique, so a separate waybill number would only add a second identifier to keep in sync. The barcode encoder is ~40 lines of pure code (`lib/code128.ts`) instead of a package, and was checked against Chromium's own `BarcodeDetector`. Prices and the customer's email are left off because the slip travels around the workshop. It is not a courier label: the courier's own waybill is still needed.

## D-37 — PWA with a deliberately tiny service worker
Installable (manifest, icons, theme colour) with an offline page, nothing more. `public/sw.js` caches only content-hashed build assets and the logos and **never caches pages**, because pages hold carts, orders and admin data; a failed page load shows `/offline.html`. No push notifications and no offline ordering (they would need a sync design for payments). The worker is registered only in production; in development `PwaRegister` removes any leftover one so it cannot serve stale files. Bumping `VERSION` in `sw.js` drops old caches.

## D-38 — SEO and answer-engine markup is generated from data the owner already edits
Titles, descriptions, canonical URLs, Open Graph, schema.org (Organization, WebSite, FAQPage from the landing-page FAQ, Product with PHP price and rating, BreadcrumbList, ItemList), `sitemap.xml`, `robots.txt` and `/llms.txt` all come from store info, the CMS FAQ and the product records, so the markup never claims anything the page doesn't show. The one new owner field is "Search title / description" in Admin → Store & footer (`seo` in the `site` document; old rows fall back to defaults). Private pages (admin, customer area, cart, checkout, sign-in, consent) are `noindex` and disallowed in robots.txt. AI answer-engine crawlers are allowed on public pages on purpose: being quoted is how this shop gets found. Product price in markup is the base ("from") price. Individual Review markup is not emitted because reviewer names are not collected yet (G-17).

## D-39 — Names on models: raised letters, one shared mesh builder, 3MF out, no CSG
Proof of concept for Phase 2 (see [name-on-model.md](./name-on-model.md)). Letters are raised and sunk 0.4 mm into the surface so the slicer merges the shells, which avoids boolean/CSG maths and its dependency. Text outlines come from the font with `opentype.js` and are extruded with `three`'s `ExtrudeGeometry`; **one module (`name-mesh.ts`) runs in the browser (live preview, admin editor) and on the server (print file, add-to-cart check)**, so the customer sees what is made. The slot lives in the text option's `constraints.slot` (jsonb) instead of a new table: no migration for a proof of concept, and it travels with the option. The print file is a 3MF with `Base` and `Name` as separate objects (colour per object in the slicer), built per download from the saved text and never from a mesh the browser sends. Known shortcuts, each listed with its fix in name-on-model.md: the slot is not snapshotted per order yet, there is no on-surface fit check, and 3MF bases are not supported.
