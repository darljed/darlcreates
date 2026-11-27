# Code map

> Last updated: 2026-11-22. Every route, library file, component, script and top-level config, with one line on what it is for.
> `npx tsx scripts/test-docs.ts` fails if a file, route, table, env var, Server Action, cache tag or npm script is missing here or in the linked docs, so keep this page current when you add code.

Linked docs: env vars → [configuration.md](./configuration.md) · tables → [database.md](./database.md) · actions, routes and cache tags → [api-routes.md](./api-routes.md) · UI rules → [design-system.md](./design-system.md).

## Routes (`src/app`)

Three surfaces share one root layout (`layout.tsx`: fonts, `<Toaster>`, metadata, brand icons).

### Storefront `(shop)` (public; `layout.tsx` adds the header and footer)

| Route | Purpose |
|---|---|
| `/` | Landing page from the CMS (`site_content` "home"): hero, highlights, featured products, FAQ, CTA |
| `/products` | Catalog with instant search and category filter |
| `/products/[slug]` | Product page: gallery + 3D viewer, customizer (or the clicker designer for a clicker product), add to cart, reviews. `review-actions.ts` holds the review actions |
| `/services` | The design-tools hub: a card per set-up service (name keychain, clicker) |
| `/keychain` | Short link: redirects to the first published name keychain product (404 if none). Linked from the landing page, the footer, /services and the call-to-action bands (not the navbar) |
| `/clicker` | Short link: redirects to the first published clicker product (404 if none). Linked from the landing page, the footer, /services and the call-to-action bands (not the navbar) |
| `/cart` | Cart with line editing |
| `/checkout` | Address (province / city / barangay pickers), live shipping fee, order summary, place order |
| `/shipping` | The shipping rates: how the fee works, the rate table, provinces per zone, a "check your fee" box |
| `/sign-in` | Google sign-in card |
| `/consent` | Privacy-consent screen shown until the current version is accepted |
| `/privacy`, `/terms` | Owner-editable legal pages from the CMS |

### Customer area `(portal)` (signed-in; `layout.tsx` runs `requireUser()` and wraps in `InsetShell`, comfortable density)

| Route | Purpose |
|---|---|
| `/orders` | My orders table (Pay now / Track / Buy again) |
| `/orders/[orderNo]` | One order: progress, GCash panel, history, shipment, cancel, review prompt |
| `/orders/[orderNo]/acknowledgment` | Printable Order Acknowledgment |
| `/account` | Saved addresses, download my data, delete account |
| `/account/export` | GET: JSON download of the user's own data (RA 10173) |

### Admin `(admin)/admin` (owner only; `layout.tsx` runs `requireAdmin()`, compact density)

| Route | Purpose |
|---|---|
| `/admin` | Dashboard |
| `/admin/orders` | Orders list: search, status chips, 25 per page |
| `/admin/shipping` | The shipping rate table, parcel settings and each province's zone, with a "try it" box |
| `/admin/orders/[id]` | Order detail, status buttons, shipping form, payment actions |
| `/admin/orders/[id]/acknowledgment` | Admin copy of the Order Acknowledgment |
| `/admin/orders/[id]/job-sheet` | Print job sheet: per order line, the colour (name + hex) and filament of every part, name, sizes, clicker design, colours to load, and what to set by hand. Print or copy as text |
| `/admin/orders/[id]/waybill` | Internal printable waybill (A6) for our own tracking: barcode, ship-to, pack list, tick boxes |
| `/admin/orders/[id]/stl/[itemId]` | GET: redirect to a 120 s signed S3 link for an item's print file |
| `/admin/studio` | Design studio: the clicker and keychain designers without a cart, for orders that came in off the site. `?tool=keychain|clicker` |
| `/admin/studio/file` | POST: checks a studio design against the product's settings and returns the 3MF, or a ZIP of STLs (one per object and colour) |
| `/admin/clicker-fit-test` | GET: the clicker fit-test plate as a 3MF (four pocket and four stem tolerances) |
| `/admin/payments` | Pending GCash verification queue |
| `/admin/reviews` | Approve / hide reviews |
| `/admin/products`, `/admin/products/new`, `/admin/products/[id]` | Product list, create, edit (files, photos, customization builder) |
| `/admin/users`, `/admin/users/[id]` | Customer list and account page (profile, addresses, sessions, controls, activity log) |
| `/admin/content` | Landing-page editor |
| `/clicker-examples/*.jpg` | (static files in `public/clicker-examples`) before / after examples for the picture chooser |
| `/admin/ai` | Product studio: one chat per product (`?product=<id>`, or `?draft=<id>` for a product not created yet): listing, mockups, price, designs and options |
| `/admin/ai/settings` | AI settings: OpenRouter and Ollama Cloud keys (encrypted, write-only), model selector, test |
| `/admin/ai` | Product studio's right side has two tabs: "Listing & pictures" (the review panels) and "AI images" (the product's generated pictures), see [image-gallery.md](../docs/image-gallery.md) |
| `/admin/estimator` | Workshop: the price estimator (cost + three prices), saved estimates, "save as product" |
| `/admin/inventory` | Workshop: parts, purchase lots, stock adjustments and history |
| `/admin/sales` | Workshop: the off-site sales (sales taken outside the website), table and kanban |
| `/admin/colours` | The filament colours in stock (the shop-wide colour inventory) |
| `/admin/branding` | Logo and brand-image uploads |
| `/admin/store` | Store details and footer |
| `/admin/legal` | Privacy Policy / Terms editor |

### API route handlers (`src/app/api`)

| Route | Purpose |
|---|---|
| `/api/auth/[...all]` | BetterAuth (Google OAuth, sessions) |
| `/api/uploads/presign` | Presigned S3 PUT for model, photo, site and customer images |
| `/api/files/[...key]` | Stable file URLs (signed redirect, or streamed for `site/`) |
| `/llms.txt` | Plain-Markdown summary of the shop for AI assistants, built from live data |
| `/robots.txt`, `/sitemap.xml` | Generated by `robots.ts` and `sitemap.ts`: what search and AI crawlers may fetch, and every public URL |
| `/manifest.webmanifest` | Generated by `manifest.ts`: makes the site installable (PWA) |
| `/api/revalidate` | POST: tells the running app to drop cached storefront data (used by scripts) |

### Not-found pages

`src/app/not-found.tsx` (root), `(shop)/not-found.tsx`, `(portal)/not-found.tsx`, `(admin)/admin/not-found.tsx`. All render `NotFoundView` inside the surface's own chrome.

### Server Action files (all start with `"use server"`; list in [api-routes.md](./api-routes.md))

`(admin)/admin/agent/actions.ts`, `(admin)/admin/ai/actions.ts`, `(admin)/admin/ai/image-actions.ts`, `(admin)/admin/ai/settings/actions.ts`, `(admin)/admin/colours/actions.ts`, `(shop)/clicker/actions.ts`, `(shop)/cart/actions.ts`, `(shop)/checkout/actions.ts`, `(shop)/consent/actions.ts`, `(shop)/products/[slug]/review-actions.ts`, `(portal)/orders/actions.ts`, `(portal)/account/actions.ts`, `(admin)/admin/orders/actions.ts`, `(admin)/admin/products/actions.ts`, `(admin)/admin/products/preset-actions.ts`, `(admin)/admin/products/costing-actions.ts`, `(admin)/admin/estimator/actions.ts`, `(admin)/admin/inventory/actions.ts`, `(admin)/admin/sales/actions.ts`, `(admin)/admin/shipping/actions.ts`, `(admin)/admin/users/actions.ts`, `(admin)/admin/content/actions.ts`.

## Libraries (`src/lib`)

Rule: files marked **pure** or **service** use no `next/*`, so scripts and tests import them directly. Server Actions stay thin: guard, Zod parse, call a service, refresh caches, send email.

| File | Purpose |
|---|---|
| `addresses.ts` | Saved address book: list, save, set default (keeps a default), delete, cap of 10 |
| `admin-counts.ts` | Sidebar badge numbers (pending payments, reviews awaiting approval, orders awaiting payment) |
| `admin.ts` | Admin read queries: dashboard totals and chart, order list and detail, status counts, top products |
| `auth-client.ts` | BetterAuth browser client (sign in / out) |
| `auth.ts` | BetterAuth server config: Google only, `role` field, trusted origins in dev, block-on-sign-in hook |
| `clicker/redraw.ts` | **Server only** (holds the API key). AI picture redraw through OpenRouter: the two modes (flat, stencil), the prompts, the backdrop colour, model choice with fallback, plain-sentence errors, the image check and the per-customer daily limit |
| `clicker/redraw-post.ts` | **Pure.** What the browser does with the AI answer before tracing: `thresholdPixels` (exactly two tones), `keyOutPixels` (cut out the solid backdrop and its blended rim) and `flatColourCount` (how many colours a flat redraw may use) |
| `colour-inventory-schema.ts` | **Pure.** The colour inventory (name + hex, 2 to 24, no duplicates), `parseInventory`, `inStock`, and `applyInventory`, which filters a product's colour options, clicker palette and name colours to what is in stock |
| `branding-schema.ts` | **Pure.** The six logo slots, where each is used, size and type rules |
| `branding-verify.ts` | Server proof that an uploaded logo is acceptable (exists, size, magic bytes, pixel shape) |
| `business.ts` | Business identity for customer documents; env-overridable |
| `cart-service.ts` | **Service.** Add to cart: normalize choices to the product schema, recompute price, presets-only check, verify customer image |
| `cart.ts` | Cart reads: get or create the active cart, lines with signed image links, config summary, subtotal, item count |
| `catalog.ts` | Cached storefront product reads (`products`, `product:<slug>` tags); a product carries its tags, design mode and resolved presets |
| `color-name.ts` | **Pure.** Plain-English name for a hex colour ("Pink", "Dark green"), used to label swatches made from filament colours |
| `customer-images.ts` | Proof that a customer-uploaded image is theirs, exists, is small enough and is a real image |
| `email.ts` | Order emails (placed, verified, rejected, shipped); logs instead of sending when SMTP is not set |
| `files.ts` | Decides whether a storage key may be served publicly |
| `image-size.ts` | **Pure.** Reads PNG/JPEG/WebP pixel size from the first bytes |
| `legal-format.ts` | **Pure.** Legal-text parser and the editor toolbar's text transforms (rejects unsafe links) |
| `model-autoconfig.ts` | **Service (server).** After a 3MF upload: example text → name slot (+ cleaned model), filament colours → Colors option |
| `threemf.ts` | **Service (pure, server).** Generic 3MF reading/editing, nothing name-specific: unzip with a size cap, plate items and objects, multi-object `threeMfSurface` (skips negative parts; remembers which triangles came from which plate object), the slicer's part list (`readConfigObjects`), colour groups (`colorGroups`), `annotateGroups` (names meshes for the viewer, hides negative parts), `setFilaments`, `addPartTo3mf` (raised = normal part, engraved = negative part), `plateObjectNear` |
| `part-colors.ts` | **Pure.** Multi-colour models: a colour option can colour one part. `partColorsFor` (viewer), `defaultPartSelection`, `filamentAssignments` (print file), `wholeModelColor` |
| `ai/crypto.ts` | **Pure.** AES-256-GCM encrypt/decrypt for the saved AI keys |
| `ai/settings.ts` | **Service (server).** Provider keys (saved wins over env), key status, model preferences (writing, agent, image), the default `IMAGE_MODEL` |
| `ai/providers.ts` | **Service (server).** OpenRouter and Ollama Cloud: text and image model lists, chat (OpenAI format), image generation (also image-only models) |
| `ai/studio.ts` | **Service (server).** The Product studio chat: one chat per product, locked read-modify-write of the draft, snapshot with proposal cards, file checks, the assistant loop (listing, mockups, and the product and option tools forced to the chat's product) |
| `ai/image-presets.ts` | **Pure.** The image prompts and the image gallery's presets (Cover / Studio / Lifestyle / Detail / Custom), the scene prompts with the real-product guard, and the cover prompt that overlays the product's name (browser-safe; re-exported by `ai/product-copy.ts`) |
| `ai/image-studio.ts` | **Service (server).** The image gallery: generation from presets with the product's real photos (Cover / Studio / Lifestyle / Detail / Custom, prompts in `ai/product-copy.ts`), `productGallery` (tiles with what is on the product), place on / take off the product (`product_photos.hidden`), set cover, delete (refused while on the product), alt text from the chat model; costs recorded per picture |
| `ai/agent/tools.ts` | **Service (server).** The agent's tools: read tools and write tools (preview + apply through the existing Server Actions) |
| `ai/agent/options-tools.ts` | **Service (server).** Tools for one product's customization (the Product studio chat, also offered to the agent): read the options, designs and shop colours; propose designs, design mode, colours per option, option and choice edits, new size / text / colour options. Words are matched to real ids; apply runs the product editor's Server Actions |
| `ai/agent/run.ts` | **Service (server).** The agent loop: system prompt, tool calls, proposals, step limit, claim guard |
| `ai/agent/apply.ts` | **Service (server).** Apply / reject a proposal with the stale-data check, expiry, audit |
| `ai/agent/page-context.ts` | **Service (server).** Turns the admin page's address into what the agent is looking at |
| `ai/draft-types.ts` | **Pure, client-safe.** Copy schema, scenes, limits, the draft payload schema incl. the chat (the browser imports this, never `product-copy.ts`) |
| `ai/product-copy.ts` | **Pure (server: reads model files).** Model facts, copy prompt/parser/banned-word check, image prompts |
| `stl-export.ts` | **Pure.** `meshToStl` (binary STL) and `objectsToStlZip` (one STL per print object and colour, plus a README) for the design studio |
| `name-3mf.ts` | **Service (server).** Print file for a named item: STL or 3MF base + the name as a part; reads 3MF packages; detects and strips the designer's text element; `checkFit`; `nameProblem` for add-to-cart |
| `stream-bytes.ts` | **Pure.** A byte array as a streamed response body (Vercel limits buffered responses to 4.5 MB, not streamed ones) |
| `config-summary.ts` | **Pure.** `summarizeConfig`: the readable summary of a customer's selection (re-exported by `cart.ts`) |
| `name-font-client.ts` | Browser: fetches and parses the name fonts from `/fonts` |
| `name-space.ts` | **Pure (server use).** `SurfaceProbe` and `measureSpace`: how much room a name has at a spot, as a table of widest-area-per-height |
| `name-surface.ts` | **Service (server).** The product model as one mesh, cached in memory for 10 minutes |
| `clicker/fit.ts` | **Pure.** Every mechanical number of the switch clicker (`FIT`: pocket, deck, rim, cap cavity, socket, heights), rim and relief options, ring builders |
| `clicker/spec.ts` | **Pure.** Clicker / name-keys design schema (`ClickerSpec`), owner settings (`ClickerConfig`: switch limit and price, colour limit, name keys, printer fit), switch positions and spacing rule (`switchesApart`, `switchPattern`), limits, defaults, colours in use, price, readable summary |
| `clicker/shapes.ts` | **Pure.** The shape outlines and keyring placement |
| `clicker/poly.ts` | **Pure.** 2D polygon work on `clipper-lib`: union, difference, intersect, offset, small-feature removal |
| `clicker/text.ts` | **Pure.** Text layers to flat regions |
| `clicker/trace.ts` | **Pure.** Picture colour analysis and tracing into outlines (runs in the browser) |
| `clicker/layout.ts` | **Pure.** `buildLayout`: the base and key pieces (a chamber, clip windows, cavity and socket for every switch; deck, rim, skin, artwork), the outline key that follows the artwork, key placement for name keys, the keyring tab, warnings and errors; `plateLayout` |
| `clicker/extrude.ts` | **Pure.** Pieces to watertight solids and meshes; `GeometryCache` (least-recently-used) so editing reuses finished geometry |
| `clicker/svg.ts` | **Pure.** Top-view SVG of a layout or design (cart picture, thumbnails) |
| `clicker/export-3mf.ts` | **Pure.** The clicker 3MF: two objects (base, top) with a part and filament per colour piece, walls per object |
| `clicker/budget-cache.ts` | **Pure.** `BudgetCache`: a string cache limited by total size (and per entry), used for the server's design pictures |
| `clicker/retryable.ts` | **Pure.** `retryable()`: wraps an async loader so it is cached on success but retried after a failure (used for the font load) |
| `clicker/reach.ts` | **Pure.** How far a key may reach past its switches (20 mm) and how far off-centre it may be (6 mm): `reachCheck`, `maxKeySide`, `clampShift` (limits a drag of the artwork) |
| `clicker/fit-art.ts` | **Pure.** `centreAndFitArt`: when the shape changes, put the artwork in the middle of the key and shrink the whole design just enough that nothing is cut off |
| `clicker/state.ts` | **Pure.** Undo/redo history, layer helpers and `scaleDesign` (resize the whole design) for the designer |
| `workshop/pricing.ts` | **Pure.** The estimator's costing model: machine-hour rate, cost build-up, price tiers (margin, rounded up), per-piece BOM |
| `workshop/presets.ts` | **Pure.** Material presets, tier labels, part units |
| `workshop/types.ts` | **Pure.** Client-safe workshop types and constants (parts, costing, sales, estimates) |
| `workshop/action-result.ts` | **Pure.** The `{ ok, error }` result shape of the workshop Server Actions |
| `workshop/inventory.ts` | **Service (server).** Parts, purchase lots (weighted-average cost), adjustments, voids, history |
| `workshop/stock.ts` | **Service (server).** The append-only stock ledger rules: `consumeStock`, `restockFromLedger` (exact reversal) |
| `workshop/costing.ts` | **Service (server).** Product costing (BOM + print cost), `productFromEstimate`, create a draft product from an estimate |
| `workshop/estimates.ts` | **Service (server).** Saved estimates with lower-case tags and an all-tags filter |
| `workshop/sales.ts` | **Service (server).** The off-site sales: create/update/delete with stock use and give-back, cost snapshots, summaries |
| `workshop/online-stock.ts` | **Service (server).** Online orders use stock (and save their cost) when production starts; cancelling gives it back |
| `workshop/summary.ts` | **Service (server).** The dashboard numbers: revenue and profit per source and window, the 30-day series split online / off-site, top products by source, stock; the Philippine-calendar windows |
| `services.ts` | The design-your-own services (keychain, clicker) and `listServices`: which are set up and published right now |
| `keychain/spec.ts` | **Pure.** Name keychain design schema (`KeychainSpec`), owner settings (`KeychainConfig`: styles, fonts, icons, limits, every price), price, limits check, summary |
| `keychain/icons.ts` | **Pure.** The 16 icon presets, drawn from circles and polygons (`iconRegions`, `iconPath`) |
| `keychain/layout.ts` | **Pure.** `buildKeychainLayout`: plate (follows the letters, rounded or pill), keyring loop and hole, name, icon, bag-tag frame; `keychainText`, `keychainToSvg`, `layoutProblem` |
| `keychain/of-product.ts` | **Pure.** Finds the keychain option and a line's design on a product |
| `keychain/server.ts` | **Service (server).** `checkKeychain`, `buildKeychainPrint` (3MF), `keychainSvgDataUri` |
| `clicker/of-product.ts` | **Pure.** Finds the clicker option and a line's design on a product |
| `clicker/server.ts` | **Service (server).** `checkDesign`, `buildClickerPrint` (lays the base and keys out on the plate), `buildFitTest`, `designSvgDataUri`, font loading |
| `name-mesh.ts` | **Pure.** Name slot schema, text → raised-letter mesh, printability checks, watertight test |
| `like.ts` | Escapes `%` and `_` for SQL `LIKE` searches |
| `money.ts` | **The only money path.** Integer centavos ↔ ₱ display and parsing |
| `order-service.ts` | **Service.** Place order, submit payment, verify/reject (row locks), transition, shipment, customer cancel, reorder |
| `orders.ts` | Status labels, `ORDER_TRANSITIONS`, order-number generator, revenue filter |
| `pricing.ts` | **Pure.** Server-authoritative price and validation for customization choices |
| `privacy.ts` | **Service.** Consent record, data export, account anonymization (RA 10173) |
| `product-filter.ts` | **Pure.** Shop search (name, description, category, tags), category and tag filters, counts |
| `presets.ts` | **Pure.** Design presets: resolve a stored design against the product's colour options, the mode customers get (custom / presets / both, with fall-back), match a selection to a design, the presets-only check, admin choices to stored colours |
| `tags.ts` | **Pure.** Product tags: clean one tag, normalize a list (lower-case, no repeats, at most 8, 30 characters) |
| `reviews.ts` | Approved reviews and ratings (cached `reviews:<id>`); who may review |
| `job-sheet.ts` | **Pure.** Builds the print job sheet of an order line (saved on `order_items.print_sheet` at checkout) and its plain-text copy |
| `code128.ts` | **Pure.** Code 128 barcode (subset B) as SVG bar geometry, for the waybill |
| `seo.ts` | **Pure.** URLs, page metadata, schema.org JSON-LD builders, crawler lists for robots.txt |
| `safe-redirect.ts` | **Pure.** Accepts only same-site relative redirect targets |
| `session.ts` | `getCurrentUser`, `requireUser`, `getAccess` (non-redirecting twin for client-called actions), `requireAdmin`, `isAdmin` |
| `shipping.ts` | **Pure.** Shipping zones, the rate-table schema and defaults, `quoteShipping` (zone from the province, tier from the weight, extra kg, free shipping), `shippingNote` |
| `shipping-server.ts` | **Service (server).** The items' packed weights and `quoteFor(province, items, subtotal)` |
| `psgc.ts` | **Pure.** Philippine location types, parsing of the static data, `resolveIn`, `normalizeName` |
| `psgc-server.ts` | **Service (server).** Reads `public/psgc`, `resolveLocation` (codes belong together, names from the data), `guessLocation` (older text addresses) |
| `site-content-schema.ts` | **Pure.** Zod schemas, defaults and link/icon allow-lists for all CMS documents |
| `site-content-store.ts` | **Service.** Read/write of `site_content` rows with bad-row fallback |
| `site-content.ts` | Cached CMS reads for the storefront (`site:*` tags) |
| `storage-url.ts` | Client-safe `/api/files` URL builder |
| `storage.ts` | S3 client: presign, head, signed GET, delete; degrades when AWS is not configured |
| `upload-client.ts` | Browser helper: presign → PUT to S3 → return key, with clear CORS errors |
| `uploads.ts` | **Pure.** Upload kinds, extensions, size limits, key layout |
| `user-admin.ts` | **Service.** Find users, block/unblock, end sessions, re-consent, fix profile and addresses, delete, audit log |
| `utils.ts` | `cn()` class merger |
| `viewer-framing.ts` | **Pure.** Camera framing math for the 3D viewer |

## Database (`src/db`, `drizzle/`)

| Path | Purpose |
|---|---|
| `index.ts` | Drizzle client (reused across dev reloads); options come from `options.ts` |
| `options.ts` | **Pure.** Connection options for the URL and host: direct (pool of 10) vs PgBouncer pooler (no prepared statements) vs Vercel (1 connection per instance) |
| `schema/auth.ts` | `users`, `sessions`, `accounts`, `verifications` (BetterAuth) and `admin_audit` |
| `schema/catalog.ts` | `products` (with `tags`, `design_mode`), `product_photos`, `product_options`, `product_option_values`, `product_presets`, `reviews`, `review_photos` |
| `schema/commerce.ts` | `addresses`, `carts`, `cart_items`, `orders`, `order_items`, `payments`, `shipments`, `order_status_history` |
| `schema/workshop.ts` | `parts`, `stock_purchases`, `stock_movements`, `product_parts`, `estimates`, `manual_sales` |
| `schema/ai.ts` | `ai_settings` (encrypted provider keys, model choices), `ai_drafts` (AI work waiting for approval) |
| `schema/site.ts` | `site_content` (28 tables in all) |
| `schema/index.ts` | Re-exports |
| `drizzle/0000_init.sql` … `0003_users_admin.sql` | Applied migrations; `drizzle/meta/` is drizzle-kit state |

## Components (`src/components`)

### Storefront and customer

| File | Purpose |
|---|---|
| `account-panels.tsx` | Address book and delete-account panels on `/account` |
| `acknowledgment.tsx` | The printable Order Acknowledgment |
| `brand-logo.tsx` | Logo: owner upload or built-in fallback |
| `quantity-stepper.tsx` | Quantity with − and + buttons around a read-only number (no typing); arrow keys work when focused |
| `font-picker.tsx` | Name font as buttons, each showing the customer's name in that font (`@font-face` in globals.css) |
| `skeletons.tsx` | Loading placeholders shaped like each kind of page (cart, checkout, shop list, product, text page, dashboard, list, detail, form); used by every `loading.tsx` and Suspense fallback |
| `cart-item-row.tsx` | One cart line with quantity and remove |
| `checkout-form.tsx` | Checkout form (`useActionState`) |
| `cms.tsx` | CMS rendering helpers: safe links, icon map |
| `customer-image-upload.tsx` | Customer artwork upload for an `image` option |
| `install-app.tsx` | "Install the app" link in the footer (install prompt, or the iPhone instruction) |
| `json-ld.tsx` | Embeds escaped schema.org JSON-LD |
| `gcash-payment-panel.tsx` | GCash number, amount, copy buttons, reference form, rejection reason |
| `legal-body.tsx` | Renders legal text as React elements (never HTML) |
| `not-found-view.tsx` | Shared 404 body |
| `use-name-build.ts` | Hook: builds the customer's (or the admin's sample) name on the model as they type |
| `order-actions.tsx` | `ReorderButton` and `CancelOrderButton` |
| `order-progress.tsx` | Order progress bar and checkout steps |
| `order-status-badge.tsx` | Status pill |
| `order-timeline.tsx` | Order activity list |
| `portal-user.tsx` | Customer-area cart link and account menu |
| `pwa-register.tsx` | Registers `public/sw.js` in production; removes stale workers in dev |
| `print-button.tsx` | "Print / Save as PDF" |
| `product-browser.tsx` | Search box, category chips and grid |
| `product-card.tsx` | Product tile |
| `confirm-provider.tsx` | `useConfirm()`: the app's confirmation dialog (await it; mounted once in the root layout). Used instead of `window.confirm` everywhere |
| `product-customizer.tsx` | Option pickers with live price, ready-made design cards (presets), add to cart |
| `product-gallery.tsx` | 3D tile plus photo thumbnails |
| `product-reviews.tsx` | Review list and submit form |
| `sign-in-card.tsx` | Sign-in card |
| `site-footer.tsx` | Footer from CMS |
| `site-header.tsx` | Header with cart badge |
| `user-menu.tsx` | Account dropdown (carries My orders and Admin, which the header hides on phones) |
| `job-sheet-view.tsx` | One order line's job sheet (order page and printable sheet) |
| `copy-text-button.tsx` | Copy a text to the clipboard |
| `waybill.tsx` | The internal waybill slip and its `Barcode` |

### Shell and 3D

| File | Purpose |
|---|---|
| `shell/inset-shell.tsx` | Inset sidebar shell (admin + customer area) |
| `shell/ui.tsx` | Page primitives: header, panel, tables, stat, empty state |
| `three/stl-viewer.tsx` | Three.js viewer for STL and 3MF (client only); can draw the customer's name on the model (`overlay`) and report clicks (`onPick`) |
| `three/stl-viewer-lazy.tsx` | Dynamic import wrapper (`ssr: false`) |
| `three/viewer-loading.tsx` | Loading animation |

### Workshop (`components/workshop`)

| File | What it does |
|---|---|
| `estimator-client.tsx` | The estimator screen: job, cost breakdown, price tiers, save, edit and the saved estimates |
| `estimator-helpers.ts` | Estimator helpers: building a job, restoring a saved estimate or settings, the product draft |
| `job-form.tsx` | The job inputs: filament lines, waste, print time, labour, quantity and its mode |
| `components-list.tsx` | Attached parts (stocked parts used per unit) |
| `line-items-list.tsx` | Extra fees (margin fee or relay fee) |
| `cost-breakdown.tsx` | The itemised cost table |
| `price-tiers.tsx` | The three prices, selectable, with per-tier margin sliders |
| `settings-panel.tsx` | Printer, electricity, labour, failure, queue premium, margins and rounding (kept in the browser) |
| `save-estimate-dialog.tsx` | Title, comment and tags for a saved estimate |
| `saved-estimates-list.tsx` | Saved estimates with the tag filter, edit, delete and create product |
| `save-product-dialog.tsx` | Create a draft product from an estimate, or add its costing to an existing product |
| `inventory-client.tsx` | The inventory screen: parts table, search, low-stock filter |
| `part-dialog.tsx`, `restock-dialog.tsx`, `adjust-dialog.tsx`, `part-history-dialog.tsx` | Add/edit a part, restock, adjust stock, and a part's lots and ledger |
| `sales-client.tsx` | The off-site sales: summary, filters, table and kanban views |
| `sale-dialog.tsx`, `sale-kanban.tsx`, `sale-math.ts` | Add/edit a sale, the kanban (native drag and drop plus a status menu), cost and profit math |
| `product-costing.tsx` | The Costing panel on a product's admin page: parts per unit, print cost, margin |
| `form-bits.tsx`, `confirm-dialog.tsx` | Shared form field, native select and confirm dialog |

### Name keychain designer (`components/keychain`)

| File | What it does |
|---|---|
| `keychain-designer.tsx` | The designer: viewer, style, name, font, icon, colours, plate and thickness, keyring hole, list of keychains, price bar, undo/redo, draft, add to cart |
| `keychain-viewer.tsx` | Three.js view of the printed pieces with orbit and a top view, flat-picture fallback |
| `use-keychain-fonts.ts` | Loads the fonts a keychain design uses and tells when one arrives |

### Clicker designer (`components/clicker`)

| File | Purpose |
|---|---|
| `clicker-designer.tsx` | The designer: viewer, kind switch (Clicker / Name keys), step list, list of clickers, price bar, undo/redo, draft, add to cart; phone layout |
| `clicker-panels.tsx` | The step panels: artwork, letters, colours (with the colour meter), shape and size (with the outline shape, border and size scaling), look, switches (count, arrangement and a drag-to-place map), keyring |
| `clicker-viewer.tsx` | Three.js view with orbit, top view, the "Inside" lift with ghost switches, click-to-pick a part, and drag in Move mode (client only) |
| `image-import.ts` | Reads a PNG/JPG/WebP (canvas) or SVG (three's `SVGLoader`) in the browser |
| `palette-picker.tsx` | Colour swatches limited to the owner's palette |
| `shape-thumb.tsx` | Small outline icon of a shape |
| `use-fonts.ts` | Loads the name fonts for the layout and tells when one arrives |

### Admin (`components/admin`)

| File | Purpose |
|---|---|
| `admin-account-menu.tsx` | Name, email and sign-out in the sidebar and top bar |
| `clicker/picture-mode-chooser.tsx` | After a picture is chosen (AI on): three cards with before / after examples (keep, flat colours, 2-colour portrait); AI cards need sign-in |
| `colour-inventory-editor.tsx` | Admin Colours page: swatch + name rows, add / remove, save, "stop limiting colours" |
| `branding-editor.tsx` | Six logo upload slots with previews |
| `location-picker.tsx` | Province -> city -> barangay dropdowns from the PSGC files (checkout, admin address editing) |
| `shipping-checker.tsx` | "Check your fee" box on the public shipping page |
| `services-section.tsx` | The services as cards (landing page, /services) or a slim call-to-action band (shop, empty cart) |
| `shipping-editor.tsx` | Admin → Shipping: rate table, parcel settings, province zones, "try it" |
| `studio-download.ts` | Design studio: posts a design to `/admin/studio/file` and saves the returned 3MF or STL zip |
| `../ai/ai-settings-form.tsx` | (in `components/ai`) AI settings screen: keys, model pickers (writing, agent, image) with the active model marked, test |
| `../ai/agent-dock.tsx` | (in `components/ai`) The agent chat: floating button on every admin page, Ctrl/Cmd+J, proposal cards with Approve / Reject |
| `../ai/ai-studio.tsx` | (in `components/ai`) The Product studio: product picker, the chat (attachments, mockups, proposal cards with Approve / Reject / Approve all, the image model dropdown in the message box), and the review side (the product's designs with a 3D preview, the listing, pictures, Create / Apply) |
| `../ai/image-gallery.tsx` | (in `components/ai`) The Product studio's "AI images" tab: preset chips + one-line extra direction + compact model select + Generate / Generate set, and the grid of generated pictures with badges (preset, cost, on / off / cover) and per-tile icon buttons (add / remove, cover, regenerate, alt text, delete — via the app dialog) |
| `keychain-setup.tsx` | Make a product a keychain product (a standalone service) and set styles, fonts, icons, limits, colours and every price |
| `clicker-setup.tsx` | Make a product a clicker product (a standalone service, cannot go back) and set sizes, price steps, palette, colours per print, most switches and the price of each extra one, name keys and printer fit |
| `confirm-dialog.tsx` | Confirmation dialog |
| `delete-product-button.tsx` | Delete a product behind a confirm step (list row and edit page) |
| `content-editor.tsx` | Landing-page editor |
| `editor-bits.tsx` | `Field`, `Check`, `RowTools`, `swap` |
| `legal-editor.tsx` | Legal text editor: toolbar, outline, word count |
| `legal-workspace.tsx` | Tabs, preview, save, unsaved guard |
| `name-slot-editor.tsx` | "Name on the model": click the 3D model to place the name, size it, save |
| `order-admin-controls.tsx` | Status buttons and shipping form |
| `payment-actions.tsx` | Verify / reject buttons |
| `product-files.tsx` | Model and photo uploads |
| `product-form.tsx` | Product create / edit form (name, description, category, tags, price, status, weight) |
| `preset-editor.tsx` | Product editor: design presets (make, edit, hide, delete) and how customers choose colours |
| `revenue-chart.tsx` | 30-day revenue chart, stacked by source (online / off-site) |
| `review-moderation.tsx` | Approve / hide buttons |
| `schema-builder.tsx` | Customization option builder: add, edit (label, required, price, length) and delete options and choices, add every shop colour, auto-detect from the 3D model |
| `store-editor.tsx` | Store details and footer editor |
| `user-addresses.tsx` | Edit / delete a user's saved addresses |
| `user-badges.tsx` | Status and role badges, initials avatar |
| `user-controls.tsx` | Block, sign out everywhere, re-consent, delete |
| `user-profile-form.tsx` | Fix name, email, private note |
| `user-sessions.tsx` | List and end sessions |

### shadcn primitives (`components/ui`)

`avatar.tsx`, `badge.tsx`, `breadcrumb.tsx`, `button.tsx`, `card.tsx`, `collapsible.tsx`, `dialog.tsx`, `dropdown-menu.tsx`, `input.tsx`, `label.tsx`, `select.tsx`, `separator.tsx`, `sheet.tsx`, `skeleton.tsx`, `sonner.tsx`, `table.tsx`, `tabs.tsx`, `textarea.tsx`, `tooltip.tsx`. Generated by shadcn; edit rarely.

## Scripts (`scripts/`)

Run with `npx tsx scripts/<name>.ts`. Usage and what each test covers: [testing.md](./testing.md).

| File | Purpose |
|---|---|
| `make-admin.ts` | Promote a user to admin by email |
| `seed-keychain.ts` | Creates the name keychain designer product with default settings (idempotent), so `/keychain` works on a fresh database |
| `seed-prod.ts` | Seed a fresh production DB (`TARGET_DATABASE_URL`): landing content, the clicker product, the owner as admin |
| `seed.ts` | Sample catalog |
| `seed-demo.ts` | Demo store: `seed`, `clear`, `status` (tagged, removable) |
| `e2e-session.ts` | Test sessions for browser E2E: `setup`, `cleanup` |
| `build-brand-assets.py` | Builds the built-in logo files in `public/brand` from the source art |
| `lib/revalidate.ts` | `refreshStorefrontCache()` for scripts that write straight to the DB |
| `fixtures/demo-data.ts` | Demo products, customers, review texts |
| `fixtures/demo-images.py` | Generates the demo product photos |
| `fixtures/base-plus-name.3mf` | Sample multi-part 3MF used by tests |
| `fixtures/bambu-text-3mf.ts` | Builds a tiny Bambu-style 3MF with an example text element (rotated plate, optional filaments) for tests |
| `fixtures/cube-20mm.stl` | Sample STL used by tests |
| `test-a11y-labels.ts` | Every form label is linked to its control |
| `test-acknowledgment.ts` | Acknowledgment content and no-registration-wording |
| `test-admin-orders.ts` | Admin order list: search, paging, counts |
| `test-ai-redraw.ts` | AI redraw without calling the AI: threshold, key-out, backdrop colour, prompts, image check, daily limit, owner switch, no key |
| `make-redraw-examples.ts` | Makes `public/clicker-examples/*.jpg` (the chooser's before / after pictures) through the real pipeline; costs a few cents |
| `test-colour-inventory.ts` | Colour inventory: schema, the filter, product reads (customers vs admin raw), pricing refuses a colour not in stock, owner's inventory restored |
| `test-branding.ts` | Logo rules and server verification |
| `test-checkout.ts` | Checkout, payment, fulfilment through the real services |
| `test-content.ts` | CMS schema, store, no-registration-wording, cache and 404 guards |
| `test-cors.ts` | S3 CORS for each dev origin |
| `test-customer-images.ts` | Customer artwork rules |
| `test-customer-orders.ts` | Cancel and reorder |
| `test-data-integrity.ts` | Read-only checks over all live orders and payments |
| `test-docs.ts` | Documentation guard (this page and its siblings) |
| `test-instant.ts` | Admin pages have the `instant = false` opt-out |
| `build-psgc.ts` | Builds `public/psgc` from the PSA PSGC data (`psgc` package); says how to refresh it |
| `fixtures/ph-address.ts` | Real PSGC locations for tests and demo data |
| `test-psgc.ts` | Location data: completeness, consistency, resolving and refusing codes, matching older addresses, zones |
| `test-shipping.ts` | Shipping: the rate math, saved settings, real orders (fee, snapshot, forged locations refused) (needs the database) |
| `test-workshop.ts` | Workshop: the costing model, inventory ledger, product costing, the off-site sales, online-order stock, estimates, summaries (needs the database) |
| `test-agent.ts` | Admin agent: tools, privacy of read tools, previews, loop with a scripted model, page context, approval guards (needs the database) |
| `test-options-agent.ts` | The option tools: registry, previews against a real product (words to real options and colours, refusals), the agent loop limited to them (proposals only, other tools refused), stale-data refusal (needs the database) |
| `test-ai-studio.ts` | Product studio chat: image-model list parsing, old drafts still load, the loop with a fake model and fake image model, refusals and limits, one chat per product (product tools only once it exists, always on its product, cards on the turn), locked writes (needs the database) |
| `test-image-studio.ts` | Image gallery: the preset prompts (cover with the name overlay, the others keep the real product), one generation with fake image model and storage (gallery row records cost and model, vision guard, per-product cap), the standard set, and the on/off-the-product, cover, alt-text and delete actions against `product_photos` (needs the database) |
| `test-ai.ts` | AI settings and helpers: key encryption, saved settings (database), model-list parsing, copy parsing and banned words, model facts, fake-key failures |
| `test-studio.ts` | Design studio: the STL zip for a keychain and a clicker (valid binary STLs per colour; no database) |
| `test-keychain.ts` | Name keychain: icons, schema, owner limits, price, every style x plate x keyring, every font, random designs, server check, 3MF, cart (needs the database) |
| `test-clicker.ts` | Clicker designer: schema, shapes, geometry (closed solids, no overlap, sample measurements), name keys, 4-colour rule, keyring, plate, price, fit-test plate, two-object 3MF, cart integration |
| `poc-ai-vectorize.ts` | Experiment, not part of the app: asks OpenRouter image models to redraw sample pictures as flat-colour art, traces them with the app's tracer and writes comparison sheets to `/tmp/ai-poc/out` |
| `test-name-mesh.ts` | Name slot, letter geometry, orientation, printability, 3MF print file |
| `test-multi-name-cart.ts` | `addManyToCart` against the DB: several names with their own colours, atomic rejection, limits |
| `test-deploy.ts` | Connection options (direct / pooler / Vercel) and the streamed download body; no database |
| `test-cart-speed.ts` | Cart read speed against the DB: twenty lines of one product cost about one line (batched product read) |
| `test-loading.ts` | Every page has a `loading.tsx` skeleton (own folder or above); no bare "Loading…" text |
| `test-model-autoconfig.ts` | Upload auto-configuration against the DB and S3 |
| `test-money.ts` | Money maths |
| `test-order-lifecycle.ts` | Full order lifecycle |
| `test-pricing.ts` | Price engine |
| `test-privacy.ts` | Consent, export, deletion, addresses |
| `test-product-filter.ts` | Shop search and filter |
| `test-presets.ts` | Design presets and tags: resolving, modes and fall-back, matching, job sheet line, tag cleaning, search by tag, and the cart refusing hand-picked colours on a presets-only product (needs the database) |
| `test-seo.ts` | SEO helpers, JSON-LD, robots rules, private pages are noindex |
| `test-uploads.ts` | Upload rules and S3 round trip |
| `test-user-admin.ts` | User management |
| `test-service-delete.ts` | Clicker designer is a service; deleting a product removes its options |
| `test-job-sheet.ts` | Job sheet: part colours and filaments, hand-set warning, name, clicker, text copy |
| `test-waybill.ts` | Code 128 encoder and the waybill slip |
| `test-viewer-framing.ts` | 3D framing math |

## Other top-level files

| Path | Purpose |
|---|---|
| `next.config.ts` | `cacheComponents`, `partialPrefetching`, Server Action body limit 4 MB (clicker designs), dev-only `allowedDevOrigins`, Tailwind loader for Turbopack (headers only for `/sw.js`; no security headers yet: G-65) |
| `drizzle.config.ts` | drizzle-kit config |
| `src/types/clipper-lib.d.ts` | Type declarations for `clipper-lib` (it ships none) |
| `public/fonts/` | The six name fonts (OFL, Permanent Marker Apache 2.0; licence files included) used by the preview and the print file |
| `public/sw.js`, `public/offline.html` | PWA service worker (caches build assets and logos, never pages) and its offline page |
| `components.json` | shadcn config |
| `eslint.config.mjs` | Lint rules |
| `public/brand/` | Built-in logos: `logo-horizontal.png`, `logo-horizontal-dark.png`, `logo-icon.png`, `icon.png`, `apple-icon.png`, and the installed-app icons `pwa-192.png`, `pwa-512.png`, `pwa-maskable-512.png` |
| `.env.example` | Documented env keys |
| `AGENTS.md`, `CLAUDE.md`, `.kiro/steering/` | Agent instructions (kept in sync) |
| `.kiro/specs/darl-creates-ecommerce/` | Requirements, design, tasks (source of truth) |

### npm scripts

`dev`, `build`, `start`, `lint`, `typecheck`, `db:generate`, `db:migrate`, `db:push`, `db:studio`. Meaning in [operations.md](./operations.md).
