# Database

PostgreSQL via Drizzle ORM. Schema in `src/db/schema/{auth,catalog,commerce,site}.ts`,
re-exported from `index.ts`. Migrations in `drizzle/` (generate with
`npm run db:generate`, review the SQL, apply with `db:migrate`).

## Money & ledger rules
- All monetary columns are **integer centavos** (`*_cents`), PHP.
- **Append-only**: `payments` (re-submission = new row) and
  `order_status_history` (one row per transition). Never destructively edit.
- **Immutable snapshots**: `order_items.config`, `order_items.unit_price_cents`,
  `order_items.stl_key_snapshot`, `orders.ship_address` capture state at order
  time; later catalog/address edits do not mutate them.
- **Reserved columns**: `orders.or_number`, `orders.vat_cents` exist but nothing reads or writes them yet.

## Tables (20)
**Auth**: `users` (+ `role` customer|admin), `sessions`, `accounts`,
`verifications`.
**Catalog**: `products`, `product_photos`, `product_options`,
`product_option_values`, `reviews`, `review_photos`.
**Admin**: `admin_audit` (append-only log of admin actions on user accounts: `actor_id`, `target_user_id`, `action`, `detail` jsonb; no foreign keys on purpose, so the trail outlives a user row). `users` also has `blocked_at`, `blocked_reason` (private) and `admin_note` (private).
**Site**: `site_content` (`key` pk, `data` jsonb, `updated_at`, `updated_by`): owner-edited documents. Keys: `home` (landing page), `site` (store info + footer), `brand` (uploaded logos), `legal:privacy`, `legal:terms`. A missing or invalid row falls back to the built-in default; shapes are validated in code (D-25, D-28).
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

## Migrations (`drizzle/`, all applied to the live database)
| File | What it did |
|---|---|
| `0000_init.sql` | Initial schema: auth, catalog, commerce tables and enums |
| `0001_guards_consent.sql` | `users.consent_at`, `consent_version`, `deleted_at`; the two partial unique indexes on `payments` |
| `0002_site_content.sql` | `site_content` table (owner-edited documents) |
| `0003_users_admin.sql` | `admin_audit` table; `users.blocked_at`, `blocked_reason`, `admin_note` |

Workflow, rollback and the "confirm the target first" rule: [operations.md](./operations.md#migrations).

## Relationships and delete behaviour
- `users` owns: `sessions`, `accounts` (cascade), `carts` (cascade), `addresses` (cascade), `reviews` (cascade).
- `orders.user_id` is **restrict**: a user row with orders cannot be deleted. Account deletion therefore *anonymizes* the user instead (name, email and linked Google account removed; orders and payments stay with no name attached).
- `order_items.product_id` and `cart_items.product_id` are **restrict**: a product that was ordered can only be archived, never deleted. This is why `scripts/seed.ts` is dev-only (T-03).
- `orders` owns `order_items`, `payments`, `shipments`, `order_status_history` (cascade); `payments.verified_by` and `order_status_history.actor_id` point at `users` without cascade.
- `products` owns `product_photos`, `product_options` (which own `product_option_values`) (cascade).
- `admin_audit` has **no** foreign keys on purpose, so the trail outlives a user row.
- `site_content.updated_by` is set null if the editor's user is removed.

Last updated: 2026-11-11
