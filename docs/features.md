# Features

Status legend: ✅ done · 🚧 in progress · ⬜ planned

## Foundation ✅
- Next.js 16 + shadcn/ui (Vibrant Pop theme) + Tailwind v4
- Drizzle schema (18 tables) + migrations applied to live DB
- BetterAuth (Google OAuth) + RBAC guards (`requireUser`/`requireAdmin`)
- Money core (`lib/money.ts`, integer centavos) + pricing engine
- Multi-agent steering (Kiro `.kiro/steering`, `AGENTS.md`, `CLAUDE.md`)

## Storefront (customer) ✅
- Catalog listing (category chips) + product cards
- Product detail with **interactive 3D STL viewer** (lazy, reduced-motion,
  fallback) + photo thumbnails
- **Customizer**: color swatches / size choices / text input / image (schema-
  driven), **live server-authoritative price**, color drives the 3D material
- Cart (add/update qty/remove) with immutable config + price snapshots
- Checkout: address capture, flat shipping, order placement (transactional)
- **GCash manual payment**: instructions + reference submission (append-only)
- Order tracking: status timeline, shipment/tracking, order history
- Reviews: delivered-order-gated submit + star rating (moderated before shown)
- Privacy policy (RA 10173) + consent note at sign-in
- Email notifications (order placed / payment verified / rejected / shipped),
  SMTP when configured, console in dev

## Admin (owner) ✅
- RBAC-gated layout (`instant=false`), dashboard (verified revenue, status
  counts, top products)
- Product CRUD + **customization-schema builder** (options + color/size values)
- Payment verification queue: verify/reject with reason + **separation of duties**
- Order management: forward-only status transitions + **append-only history**
- Shipping entry; **admin-only signed STL download** per order item
- Review moderation (approve/hide)

## Known gaps / deferred
Full, tracked list with IDs: [roadmap-and-gaps.md](./roadmap-and-gaps.md). Headlines:
- **No upload path** (G-01/G-02): the storage lib exists but there is no presign
  route and no upload UI; STL keys are pasted and product photos can't be added.
- Bucket `darlcreates-uploads` not created; Google OAuth creds not set (G-05/G-06).
- Authenticated customer flow, admin flow and the 3D viewer with a real STL have
  not been browser-tested (G-14).
- Image customization option is a placeholder (G-09).
- Payment amount is client-supplied (G-07); shipping fee duplicated (G-08).
- Interim palette, no real logo (G-24).
- **Phase 2**: in-browser STL generators ([plan](./phase-2-generators.md)).
