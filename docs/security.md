# Security model

What protects the shop, where each protection lives in the code, and what is **not** protected yet. Gaps are tracked in
[roadmap-and-gaps.md](./roadmap-and-gaps.md) with IDs. Facts here were checked against the code on 2026-11-10.

The site is reachable from the public internet (Tailscale Funnel), so treat every page and endpoint as public.

## 1. Who can do what

| Role | How you get it | Can |
|---|---|---|
| Visitor | nothing | Browse the shop, product pages, legal pages |
| Customer | Sign in with Google, accept the privacy policy | Cart, checkout, own orders, own account, reviews (after delivery) |
| Admin | Set by hand: `npx tsx scripts/make-admin.ts you@example.com` after the person has signed in once | Everything under `/admin` |

There is no way to become an admin from the website, and `role` is never accepted from the browser (`input: false` on the
BetterAuth field). The admin UI cannot change roles, and cannot block or delete admin accounts or the acting admin.

## 2. Authentication

- **Google sign-in only** (BetterAuth). No passwords exist in this system, so there are no passwords to leak or reset.
- Sessions are rows in the `sessions` table; the browser holds a signed cookie (`__Secure-better-auth.session_token` over HTTPS). No cookie cache, so deleting a session row ends it immediately.
- **Blocked accounts**: a BetterAuth hook (`databaseHooks.session.create.before` in `src/lib/auth.ts`) refuses to create a session for a blocked user, and blocking deletes existing sessions in the same transaction. `requireUser` checks again. The user sees only "This account can't sign in right now".
- **Deleted accounts** are anonymized and have no linked Google account, so they cannot sign in to the old identity.
- **Sign-out and other POSTs** are accepted only from `BETTER_AUTH_URL`'s origin; in development `localhost:3000/3001` and `127.0.0.1` are also trusted. Production trusts the base URL only.
- Post-sign-in redirects go through `safeRedirect` (`src/lib/safe-redirect.ts`): same-site paths only, so `//evil.com`, `javascript:` and backslash tricks fall back to `/`.
- To log everyone out (for example after a suspected leak): change `BETTER_AUTH_SECRET` and restart.

## 3. Authorization

- **Every Server Action is guarded.** All 46 exported actions call `requireAdmin()` or `requireUser()` (the consent action uses `getCurrentUser()` on purpose, to avoid a redirect loop). The check is the first line, before input is read.
- **The whole `/admin` tree** is also gated in `src/app/(admin)/admin/layout.tsx` (`requireAdmin`). A non-admin is redirected, never shown partial data.
- **Route handlers**:
  | Route | Protection |
  |---|---|
  | `/api/auth/*` | BetterAuth |
  | `/api/uploads/presign` | Signed in; kinds `model`, `photo`, `site` are admin only; `customer` is any signed-in user (rate limited) |
  | `/api/files/[...key]` | Only the prefixes `photos/ stl/ models/ site/`; public only for files of published products, the current landing hero image or uploaded logos; otherwise admin only. `customer/` and `proof/` are never served here |
  | `/admin/orders/[id]/stl/[itemId]` | `requireAdmin`; redirects to a short-lived signed link |
  | `/account/export` | Signed in; returns only the caller's data, `no-store` |
  | `/api/revalidate` | Shared secret, constant-time compare; off (404) when unset; allow-listed cache tags only |
- **Customers only reach their own data**: queries are keyed by the session's user id (`getOrderForUser(orderNo, userId)`, payment submission checks the order owner, addresses and carts are scoped). A customer image key must start with `customer/<their id>/`.
- **Separation of duties**: nobody can verify a payment on their own order. Enforced in `verifyPayment`, and checked across all data by `test-data-integrity.ts`.
- **Admin guard rails** (`src/lib/user-admin.ts`): cannot act on yourself, cannot block or delete an admin, cannot edit a deleted account, deletion refused while an order is in progress. There is deliberately no "sign in as this user".

## 4. Input and trust boundaries

- **Zod** validates every Server Action input and every service entry point; the browser's types are never trusted.
- **Prices and amounts are recomputed on the server**: add-to-cart and order placement recompute from the product's option schema; the payment amount is the order total from the database.
- **Selections are normalized** to the product's schema (`normalizeSelection`): unknown fields are dropped, so a crafted request cannot attach an arbitrary file or option.
- **No raw HTML anywhere.** Owner-written content (landing page, footer, legal pages) is stored as data and rendered as React text. Links must pass `isSafeHref` (same-site paths, `#anchors`, `https/http`, `mailto:`, `tel:`; never `javascript:`, `data:`, `//host`). Icons come from an allow-list. Legal text uses a tiny parser that outputs React elements only.
- **Database**: Drizzle with parameters. Search terms escape `%` and `_` (`src/lib/like.ts`).

## 5. Files and uploads

- Upload URLs are issued server-side: the object key is generated by the server (random, prefix-scoped), the content type is signed into the URL, and it expires in 5 minutes. The browser cannot choose the path.
- After upload the server **re-checks the real file**: it exists, is within the size limit, and its first bytes match (JPEG/PNG/WebP signatures for images; ZIP signature for `.3mf`). A text file renamed `.png` is refused and deleted. Logos are additionally measured (`image-size.ts`) against per-slot size and shape rules.
- **SVG is not accepted** anywhere (it can carry script and would be served from our own domain).
- The bucket blocks all public access. Files are read only through `/api/files` (short-lived signed links) or, for the small public `site/` images, streamed with `Cache-Control: public, immutable`, `X-Content-Type-Options: nosniff` and `Content-Security-Policy: default-src 'none'; sandbox`.
- The app's S3 key belongs to an IAM user limited to this one bucket (put, get, delete, list). Never run this project with another AWS profile.
- Customer uploads are deleted when the customer deletes their account.

## 6. Money integrity

Integer centavos only; `payments` and `order_status_history` are append-only; the database has partial unique indexes (one pending payment per order; a live reference used once); verify/reject/transition run in transactions with row locks. Details in [order-lifecycle.md](./order-lifecycle.md) and [database.md](./database.md).

## 7. Audit trail

| Table | Records |
|---|---|
| `order_status_history` | every order status change: from, to, note, who, when |
| `payments` | every payment attempt and decision, with the deciding admin |
| `admin_audit` | every admin action on a user account (block, unblock, sign-out, edits with from → to, address changes, deletion). Has no foreign keys so it survives even if a user row is ever removed |

## 8. Privacy (RA 10173)

Consent is recorded with a timestamp and the policy version; changing the policy can require everyone to accept again. Customers can download their data (`/account/export`) and delete their account (personal data is removed or blanked; order and payment rows are kept for record-keeping with no name attached; refused while an order is in progress). Admins can do the same on a customer's behalf. Details: D-22, D-23, D-28.

### Notes added with the PWA, SEO and waybill work
- `addToCartAction` is the one Server Action that does not call `requireUser()`: it calls `getAccess()` (same checks and order) and returns a `needs` code instead of redirecting. It still refuses signed-out, blocked and deleted accounts before touching the cart.
- The service worker (`public/sw.js`) never caches HTML, API responses, uploads or `/api/files`, so one customer's page can never be served to another on a shared device.
- `/robots.txt` keeps admin, account, orders, cart, checkout, sign-in, consent and `/api/` out of search. robots.txt is a request, not access control: the pages are protected by login, and they also send `noindex`.
- JSON-LD is serialized with `<` escaped, so product or FAQ text cannot close the script tag.
- The waybill page is admin-only (the admin layout and `requireAdmin()` cover it) and omits prices and email.

### Notes added with the name-on-model work
- The print file is rebuilt on the server from the saved text and the stored slot; a mesh or coordinates from the browser are never used. The slot can only be written by `saveNameSlotAction` (admin, Zod-validated, finite numbers, bounded sizes).
- The customer's text is checked twice for printability (browser for feedback, server on add-to-cart). Allowed characters still come from the option's pattern; XML special characters in the name are escaped in the 3MF.
- The download route is admin-only; the generated file is `private, no-store` and not kept anywhere.
- Fonts are open (SIL OFL / Apache 2.0) files in `public/fonts`; they are public by nature. The customer's font choice is validated against the slot's offered list in `normalizeSelection` and again in `withFont`; any other value is dropped.
- `measureNameSpaceAction` is admin-only, validates its numbers with the slot schema, and reads only the product's own stored model; the in-memory model cache holds at most two models for ten minutes. A customer's name colour is accepted only if it is in the slot's list (`normalizeSelection`).
- Auto-configuration opens an uploaded 3MF on the server: the zip is capped at 120 MB unzipped and 3 million triangles, nesting depth is limited, and any failure leaves the file attached as uploaded.

## 9. Secrets

`.env.local` is gitignored; `.env.example` lists the keys with empty values. `NEXT_PUBLIC_*` values are visible to everyone, so only non-secrets go there (GCash name and number, business name and email). The database password and the S3 key were shown in terminal output during setup and should be rotated (G-13, G-28); rotation steps are in [operations.md](./operations.md).

## 10. Known gaps (not protected yet)

| ID | Gap |
|---|---|
| G-65 | **No security headers.** `next.config.ts` sets none: no Content-Security-Policy, `X-Frame-Options`/`frame-ancestors` (clickjacking), `Referrer-Policy`, `Permissions-Policy`. React escaping and the no-HTML rule limit the risk, but add them before launch. |
| G-66 | **Admin has no second factor of its own.** It relies on the owner's Google account (turn on Google's 2-step verification). One admin; roles are changed only by the script. |
| G-67 | **No scheduled database backup and no error monitoring** (see F-15). |
| G-41 | The customer upload rate limit is per server process (memory). |
| G-42 | No automated screening of customer images (an admin sees them before anything is printed). |
| G-13, G-28, T-07 | Rotate the DB password and the S3 key; review `npm audit` results. |
| — | Sign-in and checkout have no separate rate limiting beyond what BetterAuth provides by default; not tested here. |
