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

## Tables (28)
**Auth**: `users` (+ `role` customer|admin), `sessions`, `accounts`,
`verifications`.
**Catalog**: `products` (`is_service`: a standalone service (the clicker or the name keychain designer; no new table: a keychain product is one text option whose `constraints.keychain` holds the settings); hidden from the product grid and never deletable, migration 0004 backfills it), `product_photos`, `product_options`,
`product_option_values`, `reviews`, `review_photos`.
**Admin**: `admin_audit` (append-only log of admin actions on user accounts: `actor_id`, `target_user_id`, `action`, `detail` jsonb; no foreign keys on purpose, so the trail outlives a user row). `users` also has `blocked_at`, `blocked_reason` (private) and `admin_note` (private).
**Site**: `site_content` (`key` pk, `data` jsonb, `updated_at`, `updated_by`): owner-edited documents. Keys: `home` (landing page), `site` (store info + footer), `brand` (uploaded logos), `colours` (the colour inventory: `{ colours: [{ name, hex }] }`; absent = colours are not limited), `legal:privacy`, `legal:terms`. A missing or invalid row falls back to the built-in default; shapes are validated in code (D-25, D-28).
**Workshop** (internal, see [workshop.md](./workshop.md); money in centavos, ids uuid): `parts` (name, category, unit, `qty_on_hand`, reorder level), `stock_purchases` (lots: qty, `total_cost_cents`, supplier), `stock_movements` (the append-only ledger: delta, reason, `ref_type` + `ref_id`; `qty_on_hand` always equals its sum), `product_parts` (the bill of materials: product, part, qty per unit), `estimates` (a saved estimator run: `input` jsonb, `tiers` jsonb, cost, chosen price, lower-case `tags text[]`), `manual_sales` (the off-site sales: product, qty, price, saved unit cost, `extra_parts` jsonb, payment and status, `deducted_at`, `paid_at`). Also `products.print_cost_cents` (the cost of one unit beyond its BOM parts), `orders.stock_deducted_at` and `orders.cogs_cents` (set when an online order used stock; migration 0006).
**AI** (see [ai-studio.md](./ai-studio.md)): `ai_settings` (`key` pk: `key:openrouter`, `key:ollama` = `{enc}` AES-256-GCM encrypted API key, `prefs` = chosen provider and model; `data` jsonb, `updated_by`), `ai_drafts` (`kind` product|agent, `status` draft|applying|applied|discarded, `title`, `payload` jsonb, `created_by`, `applied_at`): work the AI prepared that nobody approved yet. Migration 0008.
**Commerce**: `addresses` (+ `region_code`, `province_code`, `city_code`, `barangay_code`: the picked PSGC location, null on older addresses; migration 0007), `products.weight_grams` (packed weight for the shipping fee), `carts`, `cart_items`, `orders`, `order_items` (`print_sheet` jsonb: the print job sheet written when the order was placed, null on older orders; migration 0005),
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

Text options can also carry `slot` in `constraints`: where the customer's name goes on the 3D model (position, normal, up, size, depth, font, all in the model file's coordinates). Shape and rules: [name-on-model.md](./name-on-model.md). A damaged slot is ignored (`slotOf`), never an error.

Price (server-authoritative): `base + Σ option deltas + Σ value deltas`.

## Migrations (`drizzle/`, all applied to the live database)
| File | What it did |
|---|---|
| `0000_init.sql` | Initial schema: auth, catalog, commerce tables and enums |
| `0001_guards_consent.sql` | `users.consent_at`, `consent_version`, `deleted_at`; the two partial unique indexes on `payments` |
| `0002_site_content.sql` | `site_content` table (owner-edited documents) |
| `0003_users_admin.sql` | `admin_audit` table; `users.blocked_at`, `blocked_reason`, `admin_note` |
| `0007_ph_addresses_shipping.sql` | `addresses.region_code`, `province_code`, `city_code`, `barangay_code`; `products.weight_grams` |
| `0006_workshop.sql` | The workshop tables (`parts`, `stock_purchases`, `stock_movements`, `product_parts`, `estimates`, `manual_sales`), `products.print_cost_cents`, `orders.stock_deducted_at`, `orders.cogs_cents` |
| `0008_ai_studio.sql` | `ai_settings` and `ai_drafts` |

Workflow, rollback and the "confirm the target first" rule: [operations.md](./operations.md#migrations).

## Relationships and delete behaviour
- `users` owns: `sessions`, `accounts` (cascade), `carts` (cascade), `addresses` (cascade), `reviews` (cascade).
- `orders.user_id` is **restrict**: a user row with orders cannot be deleted. Account deletion therefore *anonymizes* the user instead (name, email and linked Google account removed; orders and payments stay with no name attached).
- `order_items.product_id` and `cart_items.product_id` are **restrict**: a product that was ordered can only be archived, never deleted. This is why `scripts/seed.ts` is dev-only (T-03).
- `orders` owns `order_items`, `payments`, `shipments`, `order_status_history` (cascade); `payments.verified_by` and `order_status_history.actor_id` point at `users` without cascade.
- `products` owns `product_photos`, `product_options` (which own `product_option_values`) (cascade).
- `admin_audit` has **no** foreign keys on purpose, so the trail outlives a user row.
- `site_content.updated_by` is set null if the editor's user is removed.

Last updated: 2026-11-18
