# Testing

Last full cycle: 2026-11-11 (all green). Everything below is repeatable.

## 1. Static gate (run before every commit)
```bash
npm run typecheck
npx eslint src scripts          # 0 warnings expected
NEXT_DIST_DIR=.next-build npx next build && rm -rf .next-build   # validates every route; the separate dist dir keeps a running dev server intact
npx tsx scripts/test-docs.ts    # docs cover the code (see below)
```

### Run every test
Slow because the database is remote. Prints one PASS/FAIL line per script:
```bash
for f in scripts/test-*.ts; do npx tsx "$f" >/tmp/t.log 2>&1 && echo "PASS $f" || { echo "FAIL $f"; tail -15 /tmp/t.log; }; done
```
`test-cors`, `test-uploads`, `test-branding`, `test-customer-images` and `test-privacy` also need S3 credentials in `.env.local`. All need Tailscale for the database except the ones marked "nothing" below.

## 2. Test scripts (`npx tsx scripts/test-<name>.ts`)
Isolated `TEST-` data, asserts, cleans up in `finally`. The DB is remote and slow: run the
live ones in the background and poll; a killed run can leave `TEST-` rows (see Cleanup).

| Script | Covers | Needs |
|---|---|---|
| `docs` | the documentation guard: every `process.env.X` is in `configuration.md`; every file in `src/lib`, `src/components`, `scripts`, `src/db` and every route is in `code-map.md`; every table is in `database.md`; every Server Action and cache tag is in `api-routes.md`; every npm script is in `operations.md` | nothing |
| `multi-name-cart` | bulk names: separate lines, per-line price, one bad name adds nothing, limits, forged colour/font dropped |
| `name-mesh` | name slot validation, letters on a top face and a side wall (position, thickness, reads left to right), printability refusals, both fonts, the 3MF print file built from the cube STL, a Bambu-style 3MF (components, external geometry file, plate transform) with the name added and re-read, refusal of unsupported layouts, the surface fit check and `widestThatFits`, the room table and its limits (cube top, near an edge, off the model; the fast probe agrees with `checkFit`), name colours and the font/colour choice in the cart, `slotOf` / `personalizedName` / `nameProblem` | nothing (run from the project root: it reads `public/fonts`) |
| `model-autoconfig` | upload auto-configuration: a Bambu-style 3MF with an example text and three filaments becomes a name slot, a cleaned model and Colors; re-upload does not duplicate; STL and broken files change nothing; colours-only 3MF | DB + S3 |
| `seo` | URL/text helpers, JSON-LD shape and escaping, product price and rating markup, robots.txt rules, the store-info `seo` default for old rows, and that every private page is noindex and every public page has metadata | nothing |
| `waybill` | Code 128 table sanity, known checksum, encode/decode round trip, and the slip (order number, address, items, payment warning, no prices or email, escaping) | nothing |
| `money`, `pricing` | centavos math; price + option validation | nothing |
| `instant` | every page that awaits data/params has `instant=false` or `<Suspense>` (dev-overlay rule the build does NOT catch) | nothing |
| `a11y-labels` | every form `<Label>` is linked to its control | nothing |
| `acknowledgment` | document content + amounts + escaping, and that it never mentions registration/receipt/VAT wording | nothing |
| `product-filter` | shop search / category logic | nothing |
| `viewer-framing` | 3D viewer centering/framing on synthetic + real STL/3MF-like models | nothing (optional real STL paths as args) |
| `uploads`, `cors` | upload rules, ZIP/magic-byte checks, presigned PUT round trip, CORS from every dev origin | S3 |
| `order-lifecycle` | snapshot immutability, append-only payments, DB one-pending-payment rule | DB |
| `checkout` | **the real service functions**: order placement, server-owned amount, duplicate references, concurrent verify, cancelled orders, transitions | DB |
| `content` | CMS: link/icon allowlists, limits, defaults, `site/` upload rules, store info + footer schema, legal text format (safe links, headings), privacy-version rules (normal edit keeps it, "ask again" renews it, browser cannot choose it), consent follows the version, round trips + corrupt-row fallback (isolated keys, never the live rows) | DB |
| `branding` | image-size reader (PNG/JPEG/WebP, real brand files), per-slot size/shape/type rules, schema, "every slot is rendered by some page", store round trip, and the server verifier against real S3 objects (valid, wrong shape, text/SVG renamed .png, missing key) | DB + S3 |
| `user-admin` | admin control over accounts: search/filter, block + unblock, the BetterAuth sign-in hook (blocked users get no session), end sessions, re-consent, profile and address fixes (validation, duplicate email, audit from → to), deletion rules, audit trail | DB |
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
- customer after delivery: tracking, timeline, Order Acknowledgment, review (held for approval, one per product)
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

## 7. Fixtures and tooling
| File | Used by |
|---|---|
| `scripts/fixtures/cube-20mm.stl` | tests and manual uploads: a 20 mm cube STL |
| `scripts/fixtures/base-plus-name.3mf` | tests and manual uploads: a multi-part 3MF (base plus a name part) |
| `scripts/fixtures/demo-data.ts` | `seed-demo.ts`: products, customers, review texts |
| `scripts/fixtures/demo-images.py` | generates the demo product photos (needs Pillow) |
| `scripts/lib/revalidate.ts` | `seed-demo.ts` and `e2e-session.ts`: drops the running app's cache after direct DB writes (needs `REVALIDATE_SECRET`) |
| `scripts/make-admin.ts` | promote a user to admin by email |
| `scripts/seed.ts` | sample catalog (dev only, T-03) |
| `scripts/build-brand-assets.py` | rebuilds `public/brand/*` from `brand/source` (needs Pillow) |

## 7b. Testing the PWA and SEO output
The service worker only runs in a **production build**: `NEXT_DIST_DIR=.next-build npx next build`, then `NEXT_DIST_DIR=.next-build npx next start -p 3001` (stop any dev server first), and `rm -rf .next-build` afterwards. Then:
- `curl localhost:3001/robots.txt`, `/sitemap.xml`, `/llms.txt`, `/manifest.webmanifest`; view-source of `/` and a product page for the `<script type="application/ld+json">` blocks.
- In the browser: wait for `navigator.serviceWorker.ready`, reload, check `navigator.serviceWorker.controller`, then `context.setOffline(true)` and open `/products`: you should get "You're offline".
- To check sitemap / llms.txt follow content changes: delete a product, run `REVALIDATE_URL=http://localhost:3001 npx tsx scripts/e2e-session.ts cleanup`, and fetch them again.
- Barcode check: in Chromium, draw the waybill's `<svg>` to a canvas and run `new BarcodeDetector({ formats: ['code_128'] }).detect(canvas)`; it must return the order number.
- Add-to-cart resume: clear `consent_at` for the E2E customer, customize a product, press Add to cart: you should land on `/consent?redirect=/products/<slug>`, then return and see "Added to cart" with the choices intact.

## 8. More browser-test gotchas
- `role=alert` also matches Next's hidden route announcer; scope to `getByRole('main')`.
- `window.confirm()` dialogs (if any are added) need `browser_handle_dialog` before the next action; prefer `ConfirmDialog`, which is a normal element.
- A click right after navigation can land before React has hydrated. Wait for something that only appears after hydration (a disabled button becoming enabled, a toast target) before clicking.
- First visit to a route in dev compiles it, so fixed waits are flaky: wait for the expected text.
- `aws s3 ls` occasionally returns nothing on a good connection; repeat before concluding a file is missing.
- Running the full suite leaves `TEST-` rows only if a run is killed (section 5).
