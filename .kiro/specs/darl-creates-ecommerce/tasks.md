# Tasks — Darl Creates E-Commerce

Phase 1 implementation plan. Each task is a small, verifiable unit. Follow the
development workflow: branch → build → self-review + gate → test script →
browser E2E → PR → docs. Never merge without permission.

## 0. Foundation
- [ ] 0.1 Scaffold Next.js (App Router, TS) + Tailwind + shadcn/ui.
- [ ] 0.2 Add Drizzle + drizzle-kit; configure Postgres connection (env-driven).
- [ ] 0.3 Add BetterAuth with Google provider + Drizzle adapter; session + role.
- [ ] 0.4 Apply Vibrant Pop theme tokens (interim palette) in globals.css; base
      layout, header/footer, typography scale.
- [ ] 0.5 `lib/money.ts` (centavos ↔ ₱), `lib/auth` guards (`requireUser`,
      `requireAdmin`), Zod base setup.
- [ ] 0.6 Multi-agent steering (.kiro/steering, CLAUDE.md, AGENTS.md) + docs/ skeleton.

## 1. Data model & migrations
- [ ] 1.1 Drizzle schema: users/auth, addresses, products, product_photos,
      product_options, product_option_values.
- [ ] 1.2 Drizzle schema: carts, cart_items, orders, order_items, payments,
      shipments, order_status_history, reviews, review_photos + enums.
- [ ] 1.3 Generate + run initial migration against `darlcreates` DB.
- [ ] 1.4 Seed script: one admin user + sample products with customization schemas.

## 2. Storage & uploads
- [ ] 2.1 S3 client + presigned PUT route (scoped prefix/type/size).
- [ ] 2.2 Server-side post-upload validation (image type/size/dimensions).
- [ ] 2.3 Signed read URLs / CloudFront for STL + photos.

## 3. Admin — catalog
- [ ] 3.1 Admin RBAC layout + nav.
- [ ] 3.2 Product CRUD (create/edit/publish/archive) with photo + STL upload.
- [ ] 3.3 Customization-schema builder (options + values, reorder, constraints).
- [ ] 3.4 Test script: product + schema persistence; price computation.

## 4. Storefront — browse & 3D
- [ ] 4.1 Catalog listing (category filter, search) + product cards (Vibrant Pop).
- [ ] 4.2 Product detail: photo gallery + lazy STL 3D viewer (reduced-motion,
      fallback, non-blocking).
- [ ] 4.3 Customizer UI: render options from schema; live price; Zod validation.
- [ ] 4.4 Test script: config validation + authoritative price snapshot.

## 5. Cart & checkout
- [ ] 5.1 Cart (add configured item w/ snapshot, qty edit, remove).
- [ ] 5.2 Checkout: address capture + shipping fee; order placement
      (`awaiting_payment`) with immutable snapshots.
- [ ] 5.3 Test script: order totals + snapshot immutability.

## 6. Payments — GCash manual
- [ ] 6.1 Post-order GCash instructions page + reference/proof submission.
- [ ] 6.2 Admin payment verification queue (verify/reject + reason, SoD).
- [ ] 6.3 Transition order on verify (→paid) / reject; append history; email.
- [ ] 6.4 Test script: verify/reject transitions + append-only payments.

## 7. Order management & fulfilment (admin)
- [ ] 7.1 Orders table + filters; order detail (snapshot, STL download, image).
- [ ] 7.2 Status transitions with append-only history + guards.
- [ ] 7.3 Shipping entry (carrier, tracking, status).
- [ ] 7.4 Test script: lifecycle transitions + history integrity.

## 8. Order tracking & notifications (customer)
- [ ] 8.1 Customer order history + live status/tracking page.
- [ ] 8.2 Email notifications on key transitions.

## 9. Reviews
- [ ] 9.1 Review eligibility (delivered orders) + submit (rating/text/photos).
- [ ] 9.2 Admin moderation (approve/hide).
- [ ] 9.3 Product page: approved reviews + aggregate rating.
- [ ] 9.4 Test script: eligibility + moderation.

## 10. Sales dashboard
- [ ] 10.1 Revenue (verified-paid only), order counts, top products, time-series.
- [ ] 10.2 Test script: revenue aggregation from ledger.

## 11. Compliance & polish
- [ ] 11.1 Privacy policy + DPA consent at signup + data-deletion path.
- [ ] 11.2 Non-BIR order acknowledgment document (OR/VAT schema-ready, off).
- [ ] 11.3 Accessibility pass (contrast, keyboard, focus, reduced-motion, alt).
- [ ] 11.4 Swap in real Darl Creates logo palette/assets.
- [ ] 11.5 Responsive/perf pass (lazy 3D, CWV).

## Phase 2 (deferred — separate spec)
- [ ] In-browser STL generators (clicker / name keychain / ref magnet):
      parametric geometry → print-ready STL (min wall thickness, solid rings,
      overhang checks) → admin download before printing (not auto-fulfilled).
