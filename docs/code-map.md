# Code map

> Last updated: 2026-11-11. Every route, library file, component, script and top-level config, with one line on what it is for.
> `npx tsx scripts/test-docs.ts` fails if a file, route, table, env var, Server Action, cache tag or npm script is missing here or in the linked docs, so keep this page current when you add code.

Linked docs: env vars → [configuration.md](./configuration.md) · tables → [database.md](./database.md) · actions, routes and cache tags → [api-routes.md](./api-routes.md) · UI rules → [design-system.md](./design-system.md).

## Routes (`src/app`)

Three surfaces share one root layout (`layout.tsx`: fonts, `<Toaster>`, metadata, brand icons).

### Storefront `(shop)` (public; `layout.tsx` adds the header and footer)

| Route | Purpose |
|---|---|
| `/` | Landing page from the CMS (`site_content` "home"): hero, highlights, featured products, FAQ, CTA |
| `/products` | Catalog with instant search and category filter |
| `/products/[slug]` | Product page: gallery + 3D viewer, customizer, add to cart, reviews. `review-actions.ts` holds the review actions |
| `/cart` | Cart with line editing |
| `/checkout` | Address, shipping, order summary, place order |
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
| `/admin/orders/[id]` | Order detail, status buttons, shipping form, payment actions |
| `/admin/orders/[id]/acknowledgment` | Admin copy of the Order Acknowledgment |
| `/admin/orders/[id]/stl/[itemId]` | GET: redirect to a 120 s signed S3 link for an item's print file |
| `/admin/payments` | Pending GCash verification queue |
| `/admin/reviews` | Approve / hide reviews |
| `/admin/products`, `/admin/products/new`, `/admin/products/[id]` | Product list, create, edit (files, photos, customization builder) |
| `/admin/users`, `/admin/users/[id]` | Customer list and account page (profile, addresses, sessions, controls, activity log) |
| `/admin/content` | Landing-page editor |
| `/admin/branding` | Logo and brand-image uploads |
| `/admin/store` | Store details and footer |
| `/admin/legal` | Privacy Policy / Terms editor |

### API route handlers (`src/app/api`)

| Route | Purpose |
|---|---|
| `/api/auth/[...all]` | BetterAuth (Google OAuth, sessions) |
| `/api/uploads/presign` | Presigned S3 PUT for model, photo, site and customer images |
| `/api/files/[...key]` | Stable file URLs (signed redirect, or streamed for `site/`) |
| `/api/revalidate` | POST: tells the running app to drop cached storefront data (used by scripts) |

### Not-found pages

`src/app/not-found.tsx` (root), `(shop)/not-found.tsx`, `(portal)/not-found.tsx`, `(admin)/admin/not-found.tsx`. All render `NotFoundView` inside the surface's own chrome.

### Server Action files (all start with `"use server"`; list in [api-routes.md](./api-routes.md))

`(shop)/cart/actions.ts`, `(shop)/checkout/actions.ts`, `(shop)/consent/actions.ts`, `(shop)/products/[slug]/review-actions.ts`, `(portal)/orders/actions.ts`, `(portal)/account/actions.ts`, `(admin)/admin/orders/actions.ts`, `(admin)/admin/products/actions.ts`, `(admin)/admin/users/actions.ts`, `(admin)/admin/content/actions.ts`.

## Libraries (`src/lib`)

Rule: files marked **pure** or **service** use no `next/*`, so scripts and tests import them directly. Server Actions stay thin: guard, Zod parse, call a service, refresh caches, send email.

| File | Purpose |
|---|---|
| `addresses.ts` | Saved address book: list, save, set default (keeps a default), delete, cap of 10 |
| `admin-counts.ts` | Sidebar badge numbers (pending payments, reviews awaiting approval, orders awaiting payment) |
| `admin.ts` | Admin read queries: dashboard totals and chart, order list and detail, status counts, top products |
| `auth-client.ts` | BetterAuth browser client (sign in / out) |
| `auth.ts` | BetterAuth server config: Google only, `role` field, trusted origins in dev, block-on-sign-in hook |
| `branding-schema.ts` | **Pure.** The six logo slots, where each is used, size and type rules |
| `branding-verify.ts` | Server proof that an uploaded logo is acceptable (exists, size, magic bytes, pixel shape) |
| `business.ts` | Business identity for customer documents; env-overridable |
| `cart-service.ts` | **Service.** Add to cart: normalize choices to the product schema, recompute price, verify customer image |
| `cart.ts` | Cart reads: get or create the active cart, lines with signed image links, config summary, subtotal, item count |
| `catalog.ts` | Cached storefront product reads (`products`, `product:<slug>` tags) |
| `customer-images.ts` | Proof that a customer-uploaded image is theirs, exists, is small enough and is a real image |
| `email.ts` | Order emails (placed, verified, rejected, shipped); logs instead of sending when SMTP is not set |
| `files.ts` | Decides whether a storage key may be served publicly |
| `image-size.ts` | **Pure.** Reads PNG/JPEG/WebP pixel size from the first bytes |
| `legal-format.ts` | **Pure.** Legal-text parser and the editor toolbar's text transforms (rejects unsafe links) |
| `like.ts` | Escapes `%` and `_` for SQL `LIKE` searches |
| `money.ts` | **The only money path.** Integer centavos ↔ ₱ display and parsing |
| `order-service.ts` | **Service.** Place order, submit payment, verify/reject (row locks), transition, shipment, customer cancel, reorder |
| `orders.ts` | Status labels, `ORDER_TRANSITIONS`, order-number generator, revenue filter |
| `pricing.ts` | **Pure.** Server-authoritative price and validation for customization choices |
| `privacy.ts` | **Service.** Consent record, data export, account anonymization (RA 10173) |
| `product-filter.ts` | **Pure.** Shop search and category filter |
| `reviews.ts` | Approved reviews and ratings (cached `reviews:<id>`); who may review |
| `safe-redirect.ts` | **Pure.** Accepts only same-site relative redirect targets |
| `session.ts` | `getCurrentUser`, `requireUser`, `requireAdmin`, `isAdmin` |
| `shipping.ts` | The flat shipping fee (single source) |
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
| `index.ts` | Drizzle client (pool of 10; reused across dev reloads) |
| `schema/auth.ts` | `users`, `sessions`, `accounts`, `verifications` (BetterAuth) and `admin_audit` |
| `schema/catalog.ts` | `products`, `product_photos`, `product_options`, `product_option_values`, `reviews`, `review_photos` |
| `schema/commerce.ts` | `addresses`, `carts`, `cart_items`, `orders`, `order_items`, `payments`, `shipments`, `order_status_history` |
| `schema/site.ts` | `site_content` (20 tables in all) |
| `schema/index.ts` | Re-exports |
| `drizzle/0000_init.sql` … `0003_users_admin.sql` | Applied migrations; `drizzle/meta/` is drizzle-kit state |

## Components (`src/components`)

### Storefront and customer

| File | Purpose |
|---|---|
| `account-panels.tsx` | Address book and delete-account panels on `/account` |
| `acknowledgment.tsx` | The printable Order Acknowledgment |
| `brand-logo.tsx` | Logo: owner upload or built-in fallback |
| `cart-item-row.tsx` | One cart line with quantity and remove |
| `checkout-form.tsx` | Checkout form (`useActionState`) |
| `cms.tsx` | CMS rendering helpers: safe links, icon map |
| `customer-image-upload.tsx` | Customer artwork upload for an `image` option |
| `gcash-payment-panel.tsx` | GCash number, amount, copy buttons, reference form, rejection reason |
| `legal-body.tsx` | Renders legal text as React elements (never HTML) |
| `not-found-view.tsx` | Shared 404 body |
| `order-actions.tsx` | `ReorderButton` and `CancelOrderButton` |
| `order-progress.tsx` | Order progress bar and checkout steps |
| `order-status-badge.tsx` | Status pill |
| `order-timeline.tsx` | Order activity list |
| `portal-user.tsx` | Customer-area cart link and account menu |
| `print-button.tsx` | "Print / Save as PDF" |
| `product-browser.tsx` | Search box, category chips and grid |
| `product-card.tsx` | Product tile |
| `product-customizer.tsx` | Option pickers with live price, add to cart |
| `product-gallery.tsx` | 3D tile plus photo thumbnails |
| `product-reviews.tsx` | Review list and submit form |
| `sign-in-card.tsx` | Sign-in card |
| `site-footer.tsx` | Footer from CMS |
| `site-header.tsx` | Header with cart badge |
| `user-menu.tsx` | Account dropdown |

### Shell and 3D

| File | Purpose |
|---|---|
| `shell/inset-shell.tsx` | Inset sidebar shell (admin + customer area) |
| `shell/ui.tsx` | Page primitives: header, panel, tables, stat, empty state |
| `three/stl-viewer.tsx` | Three.js viewer for STL and 3MF (client only) |
| `three/stl-viewer-lazy.tsx` | Dynamic import wrapper (`ssr: false`) |
| `three/viewer-loading.tsx` | Loading animation |

### Admin (`components/admin`)

| File | Purpose |
|---|---|
| `admin-account-menu.tsx` | Name, email and sign-out in the sidebar and top bar |
| `branding-editor.tsx` | Six logo upload slots with previews |
| `confirm-dialog.tsx` | Confirmation dialog |
| `content-editor.tsx` | Landing-page editor |
| `editor-bits.tsx` | `Field`, `Check`, `RowTools`, `swap` |
| `legal-editor.tsx` | Legal text editor: toolbar, outline, word count |
| `legal-workspace.tsx` | Tabs, preview, save, unsaved guard |
| `order-admin-controls.tsx` | Status buttons and shipping form |
| `payment-actions.tsx` | Verify / reject buttons |
| `product-files.tsx` | Model and photo uploads |
| `product-form.tsx` | Product create / edit form |
| `revenue-chart.tsx` | 30-day revenue chart |
| `review-moderation.tsx` | Approve / hide buttons |
| `schema-builder.tsx` | Customization option builder |
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
| `seed.ts` | Sample catalog |
| `seed-demo.ts` | Demo store: `seed`, `clear`, `status` (tagged, removable) |
| `e2e-session.ts` | Test sessions for browser E2E: `setup`, `cleanup` |
| `build-brand-assets.py` | Builds the built-in logo files in `public/brand` from the source art |
| `lib/revalidate.ts` | `refreshStorefrontCache()` for scripts that write straight to the DB |
| `fixtures/demo-data.ts` | Demo products, customers, review texts |
| `fixtures/demo-images.py` | Generates the demo product photos |
| `fixtures/base-plus-name.3mf` | Sample multi-part 3MF used by tests |
| `fixtures/cube-20mm.stl` | Sample STL used by tests |
| `test-a11y-labels.ts` | Every form label is linked to its control |
| `test-acknowledgment.ts` | Acknowledgment content and no-registration-wording |
| `test-admin-orders.ts` | Admin order list: search, paging, counts |
| `test-branding.ts` | Logo rules and server verification |
| `test-checkout.ts` | Checkout, payment, fulfilment through the real services |
| `test-content.ts` | CMS schema, store, no-registration-wording, cache and 404 guards |
| `test-cors.ts` | S3 CORS for each dev origin |
| `test-customer-images.ts` | Customer artwork rules |
| `test-customer-orders.ts` | Cancel and reorder |
| `test-data-integrity.ts` | Read-only checks over all live orders and payments |
| `test-docs.ts` | Documentation guard (this page and its siblings) |
| `test-instant.ts` | Admin pages have the `instant = false` opt-out |
| `test-money.ts` | Money maths |
| `test-order-lifecycle.ts` | Full order lifecycle |
| `test-pricing.ts` | Price engine |
| `test-privacy.ts` | Consent, export, deletion, addresses |
| `test-product-filter.ts` | Shop search and filter |
| `test-uploads.ts` | Upload rules and S3 round trip |
| `test-user-admin.ts` | User management |
| `test-viewer-framing.ts` | 3D framing math |

## Other top-level files

| Path | Purpose |
|---|---|
| `next.config.ts` | `cacheComponents`, `partialPrefetching`, dev-only `allowedDevOrigins`, Tailwind loader for Turbopack (no security headers yet: G-65) |
| `drizzle.config.ts` | drizzle-kit config |
| `components.json` | shadcn config |
| `eslint.config.mjs` | Lint rules |
| `public/brand/` | Built-in logos: `logo-horizontal.png`, `logo-horizontal-dark.png`, `logo-icon.png`, `icon.png`, `apple-icon.png` |
| `.env.example` | Documented env keys |
| `AGENTS.md`, `CLAUDE.md`, `.kiro/steering/` | Agent instructions (kept in sync) |
| `.kiro/specs/darl-creates-ecommerce/` | Requirements, design, tasks (source of truth) |

### npm scripts

`dev`, `build`, `start`, `lint`, `typecheck`, `db:generate`, `db:migrate`, `db:push`, `db:studio`. Meaning in [operations.md](./operations.md).
