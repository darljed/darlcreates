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

## Customization schema
`product_options.type` + `constraints` (jsonb):
- text: `{ maxLen, pattern?, fonts? }`
- image: `{ formats, maxBytes, minW?, minH? }`
- color/size: enumerated via `product_option_values` (`value` = hex / size code).

Price (server-authoritative): `base + Σ option deltas + Σ value deltas`.
