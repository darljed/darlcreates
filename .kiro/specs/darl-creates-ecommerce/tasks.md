# Tasks — Darl Creates E-Commerce

Status as of 2026-11-09. `[x]` done · `[~]` partial (see note / gap ID in
`docs/roadmap-and-gaps.md`) · `[ ]` not started.

Workflow per task: branch → build → self-review + gate → test script → browser
E2E → PR → docs. Never merge without permission.

## 0. Foundation
- [x] 0.1 Scaffold Next.js (App Router, TS) + Tailwind + shadcn/ui.
- [x] 0.2 Drizzle + drizzle-kit; env-driven Postgres connection.
- [x] 0.3 BetterAuth + Google provider + Drizzle adapter; session + role.
- [x] 0.4 Vibrant Pop theme tokens, base layout, header.
- [x] 0.5 `lib/money.ts`, auth guards, Zod.
- [x] 0.6 Multi-agent steering (.kiro/steering, CLAUDE.md, AGENTS.md) + docs/.

## 1. Data model & migrations
- [x] 1.1 Schema: users/auth, addresses, products, photos, options, values.
- [x] 1.2 Schema: carts, orders, payments, shipments, history, reviews + enums.
- [x] 1.3 Migration generated and applied to live `darlcreates` DB.
- [~] 1.4 Seed: 3 sample products with schemas done; admin via `make-admin.ts`.

## 2. Storage & uploads
- [x] 2.1 S3 client, presign route (admin), bucket created (G-01, G-06).
- [ ] 2.2 Server-side post-upload validation (G-09).
- [x] 2.3 Request-time signed reads via `/api/files` (G-03, D-14).

## 3. Admin — catalog
- [x] 3.1 Admin RBAC layout + nav.
- [x] 3.2 Product CRUD + STL/photo upload.
- [~] 3.3 Schema builder: add/delete option + add value; no edit/reorder (G-19).
- [~] 3.4 Pricing self-check done; no persistence test of schema builder.

## 4. Storefront — browse & 3D
- [~] 4.1 Listing done; no search/category filter (G-20).
- [~] 4.2 Detail + lazy STL viewer + fallback done; not yet tested with a real STL (G-14).
- [~] 4.3 Customizer + live price done; image option is a placeholder (G-09).
- [x] 4.4 Pricing validation script.

## 5. Cart & checkout
- [x] 5.1 Cart (add/qty/remove, snapshots).
- [~] 5.2 Checkout + transactional order placement done; flat shipping duplicated (G-08); no address book (G-16).
- [~] 5.3 Lifecycle script covers snapshots; doesn't call real actions (G-15).

## 6. Payments — GCash manual
- [~] 6.1 Instructions + reference submission done; amount client-supplied (G-07); proof upload missing (G-01).
- [x] 6.2 Admin verification queue (verify/reject + reason, SoD).
- [x] 6.3 Order transitions on verify, append history, email (console until SMTP, G-23).
- [~] 6.4 Append-only/verify rules covered by lifecycle script (G-15).

## 7. Order management & fulfilment (admin)
- [x] 7.1 Orders table + status filter; detail with snapshot + STL download route.
- [x] 7.2 Forward-only transitions + append-only history.
- [x] 7.3 Shipping entry.
- [~] 7.4 Transition rules tested in lifecycle script (G-15).

## 8. Order tracking & notifications (customer)
- [x] 8.1 Order history + status timeline + tracking.
- [~] 8.2 Emails implemented; SMTP not configured (G-23).

## 9. Reviews
- [x] 9.1 Delivered-order gating + star rating + text.
- [x] 9.2 Admin moderation.
- [x] 9.3 Approved reviews + aggregate on product page.
- [ ] 9.4 Test script for eligibility/moderation. Photos & reviewer name missing (G-17).

## 10. Sales dashboard
- [~] 10.1 Verified revenue, status counts, top products; no time-series (G-18).
- [ ] 10.2 Test script for revenue aggregation (partially in lifecycle script).

## 11. Compliance & polish
- [~] 11.1 Privacy page done; consent capture + self-serve deletion missing (G-10).
- [ ] 11.2 Non-BIR Order Acknowledgment document (G-11).
- [ ] 11.3 Accessibility pass (G-22).
- [ ] 11.4 Real logo palette/assets (G-24).
- [ ] 11.5 Responsive/perf pass; **browser E2E not yet run** (G-14).

## 12. Release readiness (added 2026-11-09)
- [x] 12.1 S3 bucket (profile `darljed`), CORS, scoped IAM key (G-06).
- [ ] 12.2 Google OAuth creds (G-05, owner).
- [ ] 12.3 Production hosting + reachable DB (G-04).
- [ ] 12.4 Rotate DB password into Bitwarden (G-13).
- [ ] 12.5 `npm audit` review (T-07).

## Phase 2 (deferred — separate spec)
- [ ] In-browser STL generators. See `docs/phase-2-generators.md`.
