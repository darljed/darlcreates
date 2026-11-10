# Database

PostgreSQL via Drizzle ORM. Schema in `src/db/schema/{auth,catalog,commerce}.ts`,
re-exported from `index.ts`. Migrations in `drizzle/` (generate with
`npm run db:generate`, review the SQL, apply with `db:migrate`).

## Money & ledger rules
- All monetary columns are **integer centavos** (`*_cents`), PHP.
- **Append-only**: `payments` (re-submission = new row) and
  `order_status_history` (one row per transition). Never destructively edit.
- **Immutable snapshots**: `order_items.config`, `order_items.unit_price_cents`,
  `order_items.stl_key_snapshot`, `orders.ship_address` capture state at order
  time; later catalog/address edits do not mutate them.
- **BIR-ready, feature-off**: `orders.or_number`, `orders.vat_cents` exist but
  are unused until BIR registration.

## Tables (18)
**Auth**: `users` (+ `role` customer|admin), `sessions`, `accounts`,
`verifications`.
**Catalog**: `products`, `product_photos`, `product_options`,
`product_option_values`, `reviews`, `review_photos`.
**Commerce**: `addresses`, `carts`, `cart_items`, `orders`, `order_items`,
`payments`, `shipments`, `order_status_history`.

## Enums
`user_role`, `product_status` (draft|published|archived),
`option_type` (color|text|size|image),
`order_status` (awaiting_payment|paid|in_production|ready_to_ship|shipped|delivered|cancelled|refunded),
`payment_status` (pending|verified|rejected).

## Payment guard rails (DB-enforced)
Partial unique indexes on `payments`: `payments_active_reference_uq` (a GCash reference can back at most
one pending/verified payment) and `payments_one_pending_per_order_uq`. `users` also has `consent_at`,
`consent_version`, `deleted_at` (privacy work).

## Model files (STL / 3MF)
`products.stl_key` and `order_items.stl_key_snapshot` hold the S3 key of the print-ready
model. Despite the name they accept **STL or 3MF** (format is read from the extension).
The column was not renamed to avoid a risky migration for no functional gain. Keys:
`models/...` for new uploads, `stl/...` for earlier ones; both are valid.

## Customization schema
`product_options.type` + `constraints` (jsonb):
- text: `{ maxLen, pattern?, fonts? }`
- image: `{ formats, maxBytes, minW?, minH? }`
- color/size: enumerated via `product_option_values` (`value` = hex / size code).

Price (server-authoritative): `base + Σ option deltas + Σ value deltas`.
