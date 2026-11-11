# Features

Status legend: ✅ done · 🚧 in progress · ⬜ planned

## Foundation ✅
- Next.js 16 + shadcn/ui (Vibrant Pop theme) + Tailwind v4
- Drizzle schema (20 tables) + migrations applied to live DB
- BetterAuth (Google OAuth) + RBAC guards (`requireUser`/`requireAdmin`)
- Money core (`lib/money.ts`, integer centavos) + pricing engine
- Multi-agent steering (Kiro `.kiro/steering`, `AGENTS.md`, `CLAUDE.md`)

## Storefront (customer) ✅
- Catalog listing with **search** and **category filters** (instant, client-side) + product cards
- Product page gallery: a 3D tile plus clickable photos that swap the preview box
- Product detail with **interactive 3D STL viewer** (lazy, reduced-motion,
  fallback; auto-centers any model, orbit/pan/zoom, Reset view) + photo thumbnails
- **Customizer**: color swatches / size choices / text input / image (schema-
  driven), **live server-authoritative price**, color drives the 3D material
- Cart (add/update qty/remove) with immutable config + price snapshots
- Checkout: address capture, flat shipping, order placement (transactional)
- **GCash manual payment**: instructions + reference submission (append-only)
- Order tracking: status timeline, shipment/tracking, order history
- Reviews: delivered-order-gated submit + star rating (moderated before shown)
- Privacy: consent step (versioned), **My account** (saved addresses, download my data, delete account), privacy policy (RA 10173)
- **Order Acknowledgment**: printable order confirmation per order (customer + admin)
- **Address book**: saved addresses at checkout, managed in My account
- **Customer area** (inset sidebar): orders table (Pay now / Track / Buy again), order page with progress bar, copy buttons for GCash number + amount, cancel an unpaid order, review prompt after delivery
- Cart badge in the header, "Go to cart" toast, checkout steps, and customizer choices kept across the sign-in redirect
- **Footer** on every storefront page: store details, contact info, links, social links, Privacy Policy and Terms and Conditions (`/privacy`, `/terms`), all editable by the owner (see Admin)
- Branded 404 pages in every area (storefront, customer area, admin), and a loading animation in the 3D viewer until the model has rendered
- Phone-friendly: admin and customer tables stack into labelled cards on small screens; checked for sideways overflow at 320 and 375 px
- Email notifications (order placed / payment verified / rejected / shipped),
  SMTP when configured, console in dev

- **Installable (PWA)**: manifest, icons, offline page and an "Install the app" link in the footer
- **Search and AI visibility**: per-page titles and descriptions, schema.org markup (organization, FAQ, product with price and rating, breadcrumbs), `sitemap.xml`, `robots.txt`, `/llms.txt`; private pages are not indexed
- Add to cart survives sign-in and the privacy-consent step: choices are kept and the item is added when the customer comes back

## Admin (owner) ✅
- RBAC-gated inset-sidebar layout (compact, square tables), dashboard (verified revenue, 30-day chart,
  status counts, needs-attention, top products, recent orders)
- **Orders list**: customer and items columns, search (order no., name, email), status chips with counts, 25 per page; **Reviews** can be filtered (needs approval first); **Products** list shows a photo thumbnail
- **Users** (`/admin/users`): search and filter (active / blocked / admins / deleted) with order counts and spend. A user's page lets you fix their name, email and private note, edit or delete saved addresses, see where they are signed in and end any session, **block** them (reason kept private, sessions ended at once, sign-in refused), sign them out everywhere, ask them to re-accept the privacy policy, and delete the account. Every change is in an activity log. Sign-in is Google only, so "reset password" is: sign out everywhere (they sign in with Google again)
- **Landing page CMS** (`/admin/content`): announcement bar, hero (+ image), highlights, featured products, FAQ, CTA band
- **Store & footer** (`/admin/store`): store name, tagline, about, email, phone (tap to call), address, hours, explore links, social links, bottom line
- **Legal pages** (`/admin/legal`): a tabbed workspace (Privacy / Terms, each with Write and Preview tabs; preview at desktop or phone width). Formatting toolbar (heading, bullets, link dialog that rejects unsafe URLs), word count, clickable section outline, unsaved-changes dot + guard, Discard, Ctrl/Cmd+S, "last saved by", how many customers accepted the current privacy version, and a confirm dialog before "ask every customer to accept again"
- **Logos & branding** (`/admin/branding`): six upload slots, each showing where it is used, the exact size, allowed file types and a live preview: wide logo, dark-background logo, icon-only mark, browser-tab icon, phone home-screen icon, link-sharing image. Files are checked in the browser and again on the server; the page shows a preview of the tab, navbar and shared link; "Use built-in logos" restores the originals
- Product CRUD + **customization-schema builder** (options + color/size values)
- Payment verification queue: verify/reject with reason + **separation of duties**
- Order management: forward-only status transitions + **append-only history**
- **Internal waybill** per order (A6 slip with barcode, ship-to, pack list and tick boxes) for our own tracking
- **Search title and description** for the home page (Store & footer)
- Shipping entry; **admin-only signed STL download** per order item
- **File uploads**: 3D models (**STL or 3MF**, ≤50 MB) and product photos (≤5 MB) go browser → S3 via presigned PUT; photo grid with delete
- **Customer image personalization**: an `image` option lets a customer upload artwork; the server verifies ownership + real image bytes; the admin previews it on the order
- **3MF**: multi-part, multi-color files preview in 3D; colors in the file are kept, uncolored parts take the customer's swatch
- Review moderation (approve/hide)
- **Account menu**: your name + email (bottom of the sidebar) and an avatar in the top bar open My account / View storefront / Sign out

## Known gaps / deferred
Full, tracked list with IDs: [roadmap-and-gaps.md](./roadmap-and-gaps.md). Headlines:
- Google sign-in on the production address is not yet confirmed end to end by the owner (G-05).
- No security headers (G-65), no second factor beyond the owner's Google account (G-66), no scheduled database backup or error monitoring (G-67).
- A removed product's URL answers HTTP 200 with the branded 404 page and `noindex` (G-68).
- No dark theme (G-30); review photos and option reordering are not built (G-17, G-19).
- Emails only print to the console until SMTP is configured (G-23).
- **Phase 2**: in-browser STL generators ([plan](./phase-2-generators.md)).
