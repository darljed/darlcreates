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
Proof of concept for Phase 2 (see [name-on-model.md](./name-on-model.md)). Letters are raised and sunk 0.4 mm into the surface so the slicer merges the shells, which avoids boolean/CSG maths and its dependency. Text outlines come from the font with `opentype.js` and are extruded with `three`'s `ExtrudeGeometry`; **one module (`name-mesh.ts`) runs in the browser (live preview, admin editor) and on the server (print file, add-to-cart check)**, so the customer sees what is made. The slot lives in the text option's `constraints.slot` (jsonb) instead of a new table: no migration for a proof of concept, and it travels with the option. The name is a separate **part of the same object** (a 3MF object made of components), not a second object on the plate: slicers merge the overlapping shells of parts but not of separate objects, and a part can still take its own filament. The print file is built per download from the saved text and never from a mesh the browser sends. Known shortcuts, each listed with its fix in name-on-model.md: the slot is not snapshotted per order yet, there is no on-surface fit check, and 3MF bases are only supported in the common layout (see below). Update 2026-11-11: 3MF slicer projects are supported by adding the name as one more component of the plate object (build-space slot, item transform undone), and `saveNameSlotAction` now rejects a slot whose widest name would hang off the surface (nine ray samples against the model), telling the admin the widest name that fits.

## D-40 — Uploading a 3MF configures the product; the customer can pick the font
The owner's workflow is to prepare the model in Bambu Studio, so the file is the source of truth: on upload the designer's example text becomes the name slot (position, size, depth, facing), the example is cut out of the stored model (a cleaned copy is attached; the upload stays in storage), and the project's filament colours become the Colors swatches when the product has none. Existing options are never overwritten, so the owner's own catalogue wins; the slot is refreshed because a new model means a new spot. The example's filament is kept only when it differs from the model's (`nameColor`), otherwise the name follows the customer's colour. Fonts: six bundled OFL fonts, a per-slot offered list, and the customer's choice stored in the order config and validated against that list. The printability check now uses the average stroke width of the real letters instead of the width of an "I", which is wrong for decorative fonts.

## D-41 — The name area is the ink box, not the capital-height band
A name's real height depends on the font and the letters (descenders, ascenders, script loops), so checking only `maxWidth` × capital height let Script names overflow the model. The slot now has `maxHeight` (the tallest ink allowed), `buildName` scales each name until its whole outline fits `maxWidth` × `maxHeight` and centres the ink in it, and the save-time fit check, the auto-configuration and the print report all use that same rectangle. The designer's example gives it for free (its own bounding box is known to sit on the surface). Slots saved before this keep working with `maxHeight = 1.5 × height`; the two live slots were given explicit values after re-checking them against their models.

## D-42 — Limit the inputs instead of rejecting the save; name colour is a customer choice
Rejecting a save after the fact told the admin something was wrong but not what to type. The editor now asks the server for the room at the clicked spot and limits the size inputs to it, so an overflowing value cannot be entered; the save-time check stays as the backstop. The room is measured with a grid lookup in the slot's plane (not a ray per sample) so it takes about 0.13 s on a 523k-triangle model, and the parsed model is cached for a few minutes. The width/height trade-off is resolved by "the value you just changed wins; the other shrinks". Name colour: the slot lists the colours the customer may pick (`nameColors`, with an optional filament number), the choice is stored in the order and validated against that list, the preview draws it, and a 3MF print file assigns the name part to that filament. A fixed contrasting colour from the designer's file (`nameColor`) still works as the default.

## D-43 — Engraving is a negative part; the colour of a part is a customer option
An engraved name is added to the 3MF as an object of type `other` plus a `negative_part` entry in the slicer's part list, so the slicer subtracts it and there is no CSG code. The letters run from `depth` below the surface to 0.2 mm above it, so the cut leaves no skin. STL cannot hold a negative part, so engraved needs a 3MF. The save refuses a depth that leaves less than 0.8 mm of wall (rays into the model, `wallThickness`). The preview cuts the letters into the surface with a stencil pass (no CSG) and shows them in the part's colour (an engraving has no colour of its own). Negative parts in the product file (the clicker's chain hole) are kept for printing and named `dc-hide` in the stored copy so the 3D viewer does not draw them.
A model made of parts in different filaments (the ball and the holder) gets one colour option per part, with `partName` (mesh name the viewer colours), `parts` (slicer parts), `filaments` (hex to filament number) and `defaultHex` in the option's `constraints`. The print file sets each part's filament from the customer's choice (`setFilaments`).

## D-44 — A bulk order is a list of names; each name is its own cart line
The product page of a name product is a list of rows (text, font, name colour, part colours, quantity); size, image and other text are shared. `addManyToCart` validates every row and inserts all lines in one statement, so a bad name adds nothing. Each line keeps its own snapshot, price and print file, so they ship and print separately. Limit 20 names per add (`MAX_NAMES_PER_ADD`).

## D-45 — Painted areas: split for the preview only, never for printing
A painted part is one closed solid whose SURFACE is coloured. Cutting the paint into separate meshes gives open shells that a slicer cannot print. So the print model keeps the paint codes (and only remaps the painted filament); the split meshes exist only as hidden-in-print preview helpers (type other, modifier parts named `dc-preview`), removed from every print file. The decoder follows Bambu Studio's TriangleSelector (read from the last hex character, children stored last-first, one/two/three-side split rules).

## D-46 — Cart and checkout speed is about round trips, not queries
The database can be far away (about 250 to 500 ms per round trip over Tailscale in development), so a page costs the number of SEQUENTIAL trips. The cart read each line's product one after another (several queries each), so a bulk order of 20 names took 20 times as long. Now: a product and its photos, options and values are read together in one round for any number of products (`getProductsByIds`, which also takes a subquery so the cart needs no earlier trip); `getCurrentUser` and the consent lookup are cached per request (`React.cache`) so the header, page and guard share one session read; the consent check runs together with the cart read; the order page reads its payment, shipment, history and products together. The cart page is now one trip for its data (about 0.5 s here) however many lines it has. Not changed: BetterAuth's cookie cache would also skip the session read, but it delays a block or role change by its window, so it stays off.

## D-47 — Hosting on Vercel: what the model processing needs
The name, engraving and colour work is plain JavaScript (zip + XML parsing, opentype.js, three), with no native library, so it runs in a Vercel function. Measured: a 3.5 MB upload took 1.3 s and about 530 MB; a 7.5 MB print file 1.7 s and about 690 MB (Vercel's default is 2 GB and 300 s). Two things were needed: (1) the print-file download is sent as a stream (`bytesToStream`) because Vercel refuses a buffered response over 4.5 MB; (2) the database must be reached through the PgBouncer pooler on `darl-workspace-db.darl.dev:6432` (public, TLS, SCRAM; see the wiki runbook "DB Stack Networking"), with prepared statements off and one connection per instance (`src/db/options.ts`). The Cloudflare tunnel carries only HTTP services, not Postgres, so it is not the route for the database. The fonts were already in the function trace (`.next/server/**/*.nft.json` lists all six), so no tracing config is needed. Before launch: put the Vercel region near the database, set `DATABASE_URL` to the pooled URL, and run `test-deploy.ts`.

## D-48 — Pieces are non-overlapping flat slabs, one per colour (the engine; the product changed in D-52)
Each colour must be its own filament piece, so the design is cut into non-overlapping flat pieces (body, top minus design, border, one per design colour) and upper layers cover lower ones. Every piece is extruded to a closed solid. Found by testing, all required for watertight output: collinear points are dropped before triangulation (earcut would leave gaps), each piece is opened to remove zero-width slivers, and every vertex gets a deterministic sub-micrometre offset so letters on one baseline are not exactly collinear. `clipper-lib` (pure JS) does the polygon work; `clipper2-js` (broken negative offsets), `js-angusj-clipper` (wasm) and `polygon-clipping` (no offset) were rejected.

## D-49 — The design is plain data; the server rebuilds the geometry (still true; the schema is now version 2)
`config[optionId].design` holds a `ClickerSpec` (text and font for text, traced outlines for pictures). The server validates it against the owner's settings and rebuilds the solids for the print file. A mesh from the browser is never used. Pictures are traced in the browser and never uploaded. No migration: the owner's settings live in the constraints of one text option.

## D-50 — The price is recomputed on the server
Product price + size step + extra colours + keyring + picture, from the owner's settings. `computeUnitPrice` runs on the server when a line is added; the browser's number is only a preview.

## D-51 — Size limits for designs
A design with traced pictures can be a few MB of JSON. Caps: 16,000 points in all pictures, 300,000 characters per design, 3.5 MB per add to cart. The Server Action body limit is raised to 4 MB in `next.config.ts` (the default is 1 MB).

## D-52 — A clicker is a mechanical-switch clicker: a base, a key and a real MX switch
The first build made a flat keyring tag, which is not what customers or the reference makers mean by a clicker. The product is now two printed objects (a base that holds the switch, and a key you press) around an MX keyboard switch the shop fits. The flat-tag model, its border and engraving modes, and its thickness settings were removed. The polygon engine, text, picture tracing, cart, order and 3MF code were kept. A second kind, name keys, puts one key and switch under each letter using the same base and key machinery (a key is just an outline with a switch at its centre).

## D-53 — The printer's colour limit is a first-class rule
The Bambu Lab X2D prints at most 4 colours in one job, and the base, the key and every artwork colour share them. `maxColours` is an owner setting (default 4), `clickerColours` counts them, the designer shows "3 of 4 colours used", pictures start with the colours that are left, adding a picture moves the key to a colour that keeps it visible, and `checkAgainstConfig` refuses an over-limit design on the server. Name keys offer one or two alternating key colours and one letter colour (rainbow would exceed the limit).

## D-54 — Fit numbers are measured from a good sample and tuned by a test print
The dimensions (14 mm pocket, 1.2 / 7.2 / 8.7 / 10 / 18 mm base levels, 12.2 mm key cavity, Ø5.6 boss with a cross socket, 2.5 mm key-to-edge inset, key resting 16.6 mm above the base bottom) were measured from a sample clicker that works, then written from scratch (no files or code from the reference sites, whose licences forbid it). They live in one table (`FIT`). Printers and filaments differ, so three fit adjustments (`tune`: pocket, stem, gap) are an owner setting, found with a downloadable fit-test plate. Nothing has been printed yet: see G-100 and G-101.

## D-55 — A key can follow its artwork, and the size is the design's size
The "outline" shape (the one people like in AF Inventions) makes the key the union of the artwork and the switch squares, closed up (grow then shrink, with a bigger bridge until it is one piece, else the convex hull), holes filled, then grown by the border. The key colour is the border colour. The size of the key is therefore not a free choice; "Longest side" scales every layer. Pricing and the owner's limits read `width`/`height`, so for an outline key the designer writes the real size onto the design (rounded up, not an undo step) and the server rebuilds the shape and refuses a written size that is smaller than the real one. The owner's minimum size does not apply to an outline key (the switch square sets its floor).

## D-56 — One switch type; the choice is how many and where
The shop only fits Cherry MX, so the clicky / tactile / linear choice, its stock toggle and its prices were removed. A clicker has a list of switch positions (mm from the key's centre). The first is included; each extra adds `extraSwitchCents`. Switches must be at least `FIT.switchPitchMm` (17 mm, along x or y) apart: their 15.6 mm flanges must not touch, and the chambers need solid wall between them. The schema refuses closer positions, the placement map refuses the move, and the layout reports an error as a last line of defence. Old designs without `switches` read as one switch in the middle.

