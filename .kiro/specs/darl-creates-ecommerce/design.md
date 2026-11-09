# Design — Darl Creates E-Commerce

## 1. Architecture overview

A single Next.js (App Router) codebase with two surfaces:

- **Storefront** (`app/(shop)/**`) — public + authenticated customer pages.
- **Admin** (`app/(admin)/admin/**`) — owner-only, server-side RBAC-gated.

```
Browser (React, shadcn/ui, react-three-fiber 3D viewer)
        │  HTTPS
Next.js (App Router)
  ├─ Server Components + Server Actions (mutations, RBAC-checked)
  ├─ Route Handlers (app/api) for: presigned S3 uploads, webhooks (future), auth
  ├─ BetterAuth (Google OAuth, session, role)
  └─ Drizzle ORM
        │
PostgreSQL (DB Stack on agent-server 100.90.200.13:5432, db=darlcreates)
AWS S3 (STL + photos + customer image uploads) ── CloudFront
Email (SMTP/SES) for order notifications
```

### Key principles
- **Mutations via Server Actions**, each beginning with an auth+RBAC guard and
  Zod validation. No business logic in client components.
- **Money = integer centavos** everywhere; a single `money.ts` formats to ₱.
- **Append-only ledgers**: `order_status_history`, `payments` are never updated
  destructively — new rows record transitions.
- **Immutable snapshots**: cart/order items store a JSON snapshot of the chosen
  customization and the price at the time, so later product edits never mutate
  historical orders.

## 2. Tech stack

| Concern | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| UI | shadcn/ui + Tailwind, themed "Vibrant Pop" via CSS variables |
| 3D | `three`, `@react-three/fiber`, `@react-three/drei` (`STLLoader`, `OrbitControls`, `Stage`) |
| Auth | BetterAuth, Google provider, Drizzle adapter |
| ORM | Drizzle + `drizzle-kit` migrations |
| DB | PostgreSQL (DB Stack / pgvector image), db `darlcreates` |
| Storage | AWS S3 (`darlcreates-uploads`, ap-south-1) + CloudFront, presigned PUT |
| Validation | Zod (shared schemas, client + server) |
| Email | Nodemailer (SMTP) / SES |
| Money | integer centavos; `lib/money.ts` |
| Test | `tsx` scripts in `scripts/test-*.ts` (project convention) |

## 3. Data model (Drizzle / Postgres)

Enums: `user_role (customer|admin)`,
`order_status (awaiting_payment|paid|in_production|ready_to_ship|shipped|delivered|cancelled|refunded)`,
`payment_status (pending|verified|rejected)`,
`option_type (color|text|size|image)`.

Tables (centavos = `integer`/`bigint`, ids = uuid/text):

- **users** — id, name, email, image, role, created_at. (+ BetterAuth tables:
  `sessions`, `accounts`, `verifications`.)
- **addresses** — id, user_id→users, label, recipient, phone, line1, line2,
  barangay, city, province, postal_code, is_default.
- **products** — id, slug (unique), name, description, category, base_price_cents,
  status (`draft|published|archived`), stl_key (S3), created_at, updated_at.
- **product_photos** — id, product_id→products, s3_key, alt, sort.
- **product_options** — id, product_id→products, type (option_type), label,
  required, price_delta_cents, constraints (jsonb), sort.
- **product_option_values** — id, option_id→product_options, label,
  value (e.g. hex / size code), price_delta_cents, stl_key (nullable override),
  sort. (Used by color/size enumerations.)
- **carts** — id, user_id→users (unique active per user), created_at.
- **cart_items** — id, cart_id→carts, product_id, qty, config (jsonb snapshot of
  chosen options), image_key (nullable S3), unit_price_cents (computed snapshot).
- **orders** — id, order_no (human ref), user_id→users, status (order_status),
  subtotal_cents, shipping_cents, total_cents, ship_address (jsonb snapshot),
  placed_at. BIR-ready (feature-off): or_number (nullable), vat_cents (default 0).
- **order_items** — id, order_id→orders, product_id, name_snapshot, qty,
  config (jsonb snapshot), image_key, unit_price_cents, stl_key_snapshot.
- **payments** — id, order_id→orders, method (`gcash`), gcash_reference,
  amount_cents, proof_key (nullable S3), status (payment_status),
  submitted_at, verified_by (nullable→users), verified_at, reject_reason.
  Append-only: re-submission creates a new row.
- **shipments** — id, order_id→orders, carrier, tracking_no, status, updated_at.
- **order_status_history** — id, order_id→orders, from_status, to_status,
  note, actor_id→users, created_at. Append-only.
- **reviews** — id, product_id→products, order_id→orders, user_id→users, rating
  (1-5), body, approved (bool), created_at.
- **review_photos** — id, review_id→reviews, s3_key, sort.

### Customization schema (`product_options.constraints` jsonb)
- color: `{}` (values live in product_option_values with hex in `value`).
- text: `{ maxLen: number, pattern?: string, fonts?: string[] }`.
- size: `{}` (values in product_option_values; `value` = size code).
- image: `{ formats: string[], maxBytes: number, minW?: number, minH?: number }`.

### Price computation (server authoritative)
`unit_price = base_price + Σ(selected option price_delta) + Σ(selected value price_delta)`.
Computed server-side on add-to-cart and on order placement; the client preview
mirrors it but is never trusted.

## 4. 3D viewer

- `components/three/stl-viewer.tsx` — `react-three-fiber` `<Canvas>` with
  `<Stage>`, `<OrbitControls>`, lazy `STLLoader` fetching `stl_key` via a signed
  CloudFront/S3 URL.
- Dynamically imported (`next/dynamic`, `ssr:false`) so Three.js stays out of the
  initial bundle.
- Respects `prefers-reduced-motion` (no auto-rotate); provides a static photo
  fallback and an explicit "View in 3D" affordance; load failure is non-blocking.

## 5. Payments (manual GCash) flow

1. Order placed → `awaiting_payment`; show GCash account + exact ₱ amount + order_no.
2. Customer submits `gcash_reference` (+ optional proof image) → `payments` row
   `pending`.
3. Admin verification queue lists `pending` payments.
4. Admin `verify` → payment `verified`, order → `paid`, history row, email.
   Admin `reject(reason)` → payment `rejected`, order stays `awaiting_payment`,
   email. Separation of duties: `verified_by` != customer; recorded.

## 6. Admin surface
- Products CRUD + customization-schema builder + STL/photo uploads.
- Orders table + detail (snapshot, STL download, image, status transitions).
- Payment verification queue.
- Shipping entry.
- Sales dashboard (revenue from verified payments only; centavos → ₱).

## 7. Design system — Vibrant Pop

Implemented as shadcn/ui theme tokens (CSS variables in `globals.css`):
- **Color:** one or two bold saturated accents + high-contrast neutrals; large
  color blocks in hero/sections. Ensure WCAG AA contrast on text over accents.
- **Type:** strong hierarchy — oversized bold display headings, clear body.
- **Spacing/density:** generous whitespace, punchy hero, roomy cards.
- **Shape/border:** energetic rounded corners, occasional thick/solid borders.
- **Interaction:** playful hover and add-to-cart micro-interactions
  (scale/press/confetti-lite), honoring reduced-motion.
Interim tokens now; swapped for exact logo palette once brand assets are read.

## 8. Security & validation
- Every Server Action: `requireUser()` / `requireAdmin()` first, then Zod parse.
- S3: presigned PUT scoped to key prefix + content-type + size; private bucket,
  reads via signed URLs / CloudFront.
- Uploaded images validated (type/size/dimensions) server-side after upload.
- No destructive SQL on financial tables; migrations reviewed.

## 9. Testing strategy
- `scripts/test-*.ts` (tsx) with isolated prefixed data, assertions, cleanup —
  per project `testing.md`: price computation, order placement + snapshotting,
  payment verify/reject transitions, RBAC guards, review eligibility.
- Browser E2E on the storefront happy path before declaring features done.

## 10. Environments / infra
- DB: `postgresql://…@100.90.200.13:5432/darlcreates` (Tailscale). Local dev may
  use a local Postgres; the `darlcreates` DB on the box is created when Tailscale
  is available (additive; confirmed OK).
- S3 bucket `darlcreates-uploads` (ap-south-1, profile `darljed`), created when
  upload work begins.
- Secrets in `.env.local` (gitignored); never in client bundles.
