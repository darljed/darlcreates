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
