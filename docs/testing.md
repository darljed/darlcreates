# Testing

Last full cycle: 2026-11-10 (all green). Everything below is repeatable.

## 1. Static gate (run before every commit)
```bash
npm run typecheck
npx eslint src scripts          # 0 warnings expected
npm run build                   # also validates every route
```

## 2. Test scripts (`npx tsx scripts/test-<name>.ts`)
Isolated `TEST-` data, asserts, cleans up in `finally`. The DB is remote and slow: run the
live ones in the background and poll; a killed run can leave `TEST-` rows (see Cleanup).

| Script | Covers | Needs |
|---|---|---|
| `money`, `pricing` | centavos math; price + option validation | nothing |
| `instant` | every page that awaits data/params has `instant=false` or `<Suspense>` (dev-overlay rule the build does NOT catch) | nothing |
| `a11y-labels` | every form `<Label>` is linked to its control | nothing |
| `acknowledgment` | document content + the "not an official receipt" wording + escaping | nothing |
| `product-filter` | shop search / category logic | nothing |
| `viewer-framing` | 3D viewer centering/framing on synthetic + real STL/3MF-like models | nothing (optional real STL paths as args) |
| `uploads`, `cors` | upload rules, ZIP/magic-byte checks, presigned PUT round trip, CORS from every dev origin | S3 |
| `order-lifecycle` | snapshot immutability, append-only payments, DB one-pending-payment rule | DB |
| `checkout` | **the real service functions**: order placement, server-owned amount, duplicate references, concurrent verify, cancelled orders, transitions | DB |
| `content` | CMS: link/icon allowlists, limits, defaults, `site/` upload rules, store info + footer schema, legal text format (safe links, headings), privacy-version rules (normal edit keeps it, "ask again" renews it, browser cannot choose it), consent follows the version, round trips + corrupt-row fallback (isolated keys, never the live rows) | DB |
| `branding` | image-size reader (PNG/JPEG/WebP, real brand files), per-slot size/shape/type rules, schema, "every slot is rendered by some page", store round trip, and the server verifier against real S3 objects (valid, wrong shape, text/SVG renamed .png, missing key) | DB + S3 |
| `admin-orders` | admin order list: search by order no./name/email, LIKE wildcards matched literally, pagination, status filter + counts, items summary | DB |
| `data-integrity` | read-only checks over ALL data: totals add up, history ends at the order status and never runs backwards, payments match totals, one verified/pending per order, separation of duties, shipments, reviews only for delivered purchases, and the dashboard agrees with the raw data. Also validates the demo seed | DB |
| `customer-orders` | customer cancel (unpaid only, blocked while a payment is pending), order list data, Buy again (recomputed price, archived product refused) | DB |
| `customer-images` | customer upload security (ownership, magic bytes, smuggled keys) | DB + S3 |
| `privacy` | consent versioning, address book, export, account deletion | DB + S3 |

## 3. Authenticated browser E2E
Google login can't be automated, so `scripts/e2e-session.ts` creates throwaway users and real
BetterAuth sessions:
```bash
npx tsx scripts/e2e-session.ts setup     # TEST-E2E customer + admin + product "test-e2e-keychain"; prints signed cookies (JSON)
npx tsx scripts/e2e-session.ts cleanup   # removes every TEST-E2E row and S3 object
```
Then drive the running dev server with Playwright (`playwright-mcp`), adding the cookie to the
browser context (`secure: true`, domain `localhost`). Keep scripts and cookie files inside
`.playwright-mcp/` (gitignored) and delete them afterwards.

What the 2026-11-10 run verified in a real browser:
- customer: customize (color + text + **real image upload to S3**), live price, cart thumbnail, checkout (inline validation, saved address), order page, GCash reference accept/refuse
- admin: payment queue, verify, in production -> ready to ship -> shipped -> delivered, shipping form, customer-image preview, acknowledgment
- customer after delivery: tracking, timeline, Order Acknowledgment (VAT 0, not-a-tax-document wording), review (held for approval, one per product)
- privacy: consent gate on `/account`, `/orders`, redirect preserved, hostile `redirect=` neutralized, export (200 JSON, no-store, 401 signed-out), deletion refused while an order is open then allowed, session revoked afterwards
- access control: customer bounced from all admin pages; admin-only upload kinds 403; other users' orders 404; `customer/`, `proof/`, path traversal 404

## 4. Gotchas learned
- **Don't write a Playwright script and run it in the same parallel batch**: the tool can run before the file exists.
- `getByRole('main')`, not `locator('main')`: Next keeps the previous route hidden in the DOM.
- Dev server re-renders after a Server Action; wait for the expected text, not a fixed delay.
- A product inserted by a script is "not found" until its cache tag is invalidated if the page was requested first.
- **Mobile check:** drive the pages at 375 and 320 px and compare `documentElement.scrollWidth` to `clientWidth`; list elements whose right edge is past the viewport and elements inside `overflow:hidden` whose `scrollWidth` exceeds `clientWidth`. Visually-hidden (`sr-only`) text and the stacked-table header are expected to show up as "clipped".
- Never run `next build` over a running dev server's `.next` (use `NEXT_DIST_DIR=.next-build` and delete it).

## 5. Cleanup if a run is interrupted
```sql
delete from orders where user_id like 'TEST-%' or order_no like 'TEST-%';
delete from reviews  where user_id like 'TEST-%';
delete from carts    where user_id like 'TEST-%';
delete from addresses where user_id like 'TEST-%';
delete from sessions where user_id like 'TEST-%';
delete from accounts where user_id like 'TEST-%';
delete from products where slug ilike 'test-%' or name like 'TEST%';
delete from users    where id like 'TEST-%';
```
Check S3 for `TEST` keys and anything under `customer/` that isn't real.

## 6. Demo data (to review layouts with realistic volume)
`npx tsx scripts/seed-demo.ts seed` creates 12 products (17 generated photos, 11 simple 3D models, options of every
type, a draft, an archived one, one with no photo, one with a very long name), 14 customers (long names, accents,
missing fields), ~70 orders over 45 days in every status with payments, shipments, status history, and ~30 reviews.
Random choices use a fixed seed, so every run is identical. Everything is tagged: products `demo-*`, customers
`seed-user-*` (`@seed.darlcreates.test`), files under `photos/demo-`, `models/demo-`, `customer/seed-user-`.
- `... seed-demo.ts status` counts it, `... clear` removes **all** of it (rows and S3 files) and nothing else.
- The demo products are **published**, so they show on the public storefront. **Run `clear` before launch.**
- Run `test-data-integrity.ts` afterwards; it validates the seed against the app's own rules.
- To browse as a demo customer without Google sign-in, sign a session cookie with BetterAuth (see
  `scripts/e2e-session.ts` `cookieFor`) for `seed-user-maria-santos` and add it to the browser.

