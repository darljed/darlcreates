# Configuration reference

Every setting the app reads: environment variables, build/framework options, and the tunable values that live in code.
`scripts/test-docs.ts` fails if the code reads an environment variable that is not listed here.

Secrets live in `.env.local` (gitignored). `.env.example` is the template. How to set things up is in
[setup.md](./setup.md); how to operate and fix things is in [operations.md](./operations.md).

---

## 1. Environment variables

"Build-time" means the value is baked into the JavaScript at `next build`, so changing it needs a rebuild. Everything else
is read when the server starts, so changing it needs a restart (a plain edit of `.env.local` is not enough for a running
production server; the dev server reloads some changes on its own, but restart it if in doubt).

### Required to run

| Variable | What it is | Read in | If missing or wrong |
|---|---|---|---|
| `DATABASE_URL` | Postgres connection string (`postgresql://user:pass@host:5432/darlcreates`) | `src/db/index.ts`, `drizzle.config.ts` | The app throws `DATABASE_URL is not set` on first import. Connection pool size is 10. The database is on the agent-server and needs Tailscale. |
| `BETTER_AUTH_SECRET` | Signs session cookies | `src/lib/auth.ts` | Sign-in breaks. Changing it signs **everyone** out (their cookies no longer verify). Generate with `openssl rand -base64 32`. |
| `BETTER_AUTH_URL` | The public origin of the site, e.g. `https://macbook-01.tail85990d.ts.net` | `src/lib/auth.ts`, `src/app/layout.tsx` (`metadataBase`, so share-image URLs are absolute), `scripts/lib/revalidate.ts` | Google sign-in redirects to the wrong place; sign-out is rejected with `INVALID_ORIGIN` from any other origin. If it is `https://…`, the session cookie is named `__Secure-better-auth.session_token`; if `http://…` it is `better-auth.session_token`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google OAuth client | `src/lib/auth.ts` | Nobody can sign in. The authorized redirect URI in Google Cloud must be `{BETTER_AUTH_URL}/api/auth/callback/google`. |

### Storage (S3). Needed for photos, 3D models and customer images

| Variable | What it is | Read in | If missing |
|---|---|---|---|
| `AWS_REGION` | `ap-south-1` | `src/lib/storage.ts` | Storage is reported as not configured; uploads return 503; the app otherwise runs. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Key of the dedicated IAM user `darlcreates-app` (this bucket only). Never use another AWS profile for this project | `src/lib/storage.ts` | same |
| `S3_BUCKET` | `darlcreates-uploads` | `src/lib/storage.ts` | same |
| `CDN_BASE_URL` | Optional CDN host for reads. **Leave empty.** | `src/lib/storage.ts` (`readUrl`) | Empty is correct: reads go through `/api/files`, which checks permissions. If you set it, `readUrl` returns a plain public CDN URL for *every* key, which would expose `customer/` uploads. See D-14. |

`isStorageConfigured()` is true only when region, bucket, access key id and secret are all set.

### Email (optional)

| Variable | What it is | Read in | If missing |
|---|---|---|---|
| `SMTP_HOST`, `SMTP_USER`, `SMTP_PASSWORD` | Mail server login. **All three** are needed | `src/lib/email.ts` | Emails are printed to the server console instead of sent (`[email:dev] to=… subject=…`). Nothing fails. |
| `SMTP_PORT` | Default `587`. Port `465` switches on TLS | `src/lib/email.ts` | defaults to 587 |
| `EMAIL_FROM` | Sender, default `Darl Creates <no-reply@darlcreates.local>` | `src/lib/email.ts` | uses the default (replace it before real use) |

Sending is best-effort: a failed send is logged and never blocks an order, payment or shipment change.

### Shown to customers (build-time, public)

`NEXT_PUBLIC_*` values are visible in the browser by design. Never put a secret in one.

| Variable | What it is | Read in | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_GCASH_NAME` | Name shown on the payment panel, default `Darl Creates` | `src/app/(portal)/orders/[orderNo]/page.tsx` | Confirm the number below is the business GCash (T-06). |
| `NEXT_PUBLIC_GCASH_NUMBER` | GCash number shown with a Copy button; the panel says "set by admin" if empty | same | Rebuild after changing. |
| `NEXT_PUBLIC_BUSINESS_NAME` | Business name on the Order Acknowledgment, default `Darl Creates` | `src/lib/business.ts` | Not the footer or page titles (those come from Admin → Store & footer). |
| `NEXT_PUBLIC_BUSINESS_EMAIL` | Contact email on the Order Acknowledgment, default `darljedmatundan@gmail.com` | `src/lib/business.ts` | same |
| `NEXT_PUBLIC_APP_URL` | Base URL for the browser-side auth client | `src/lib/auth-client.ts` | **Leave unset.** Unset means "same origin as the page", which is what you want behind localhost, a Tailscale name or the Funnel URL. |

### Scripts and tooling

| Variable | What it is | Read in | Notes |
|---|---|---|---|
| `REVALIDATE_SECRET` | Lets scripts tell the running site to drop cached data (`POST /api/revalidate`) | `src/app/api/revalidate/route.ts`, `scripts/lib/revalidate.ts` | Empty or unset = the endpoint answers 404 and scripts print a warning. Any long random string. Restart the app after setting it. |
| `REVALIDATE_URL` | Where scripts reach the running app, default `http://localhost:3001` | `scripts/lib/revalidate.ts` | Scripts also try `BETTER_AUTH_URL`. They never try other local ports (port 3000 is a different project on this machine). |
| `NEXT_DIST_DIR` | Build output folder, default `.next` | Next.js | Build with `NEXT_DIST_DIR=.next-build npx next build` so a running dev server is not disturbed, then delete the folder. |
| `NODE_ENV` | Set by Next (`development`, `production`) | `src/lib/auth.ts`, `src/db/index.ts`, `scripts/e2e-session.ts`, `scripts/seed-demo.ts` | In development BetterAuth also trusts `http://localhost:3000/3001` and `127.0.0.1` origins. The test and seed scripts refuse to run when it is `production`. |

---

## 2. Framework and build settings

`next.config.ts`:

| Option | Value | Why |
|---|---|---|
| `cacheComponents` | `true` | Pages are static by default; per-user or uncached data must be in `<Suspense>` or opt out with `export const instant = false`. Runtime values like `new Date()` during prerender fail the build. See `tech.md` and D-16. |
| `partialPrefetching` | `true` | Prefetch the static shell of a route. |
| `allowedDevOrigins` | `["macbook-01.tail85990d.ts.net"]` | Dev only. Without it Next blocks HMR when you browse the dev server through the Tailscale hostname. Hostname only (no scheme, port or path); restart `next dev` after changing. |
| `turbopack.rules["*.css"]` | `@tailwindcss/turbopack` | Tailwind v4 is configured in CSS (`src/app/globals.css`), not in a JS file. |

Other files: `tsconfig.json` (strict; alias `@/*` → `src/*`; includes `.next/types` and `.next/dev/types`, which is why stale generated types can cause typecheck errors, see operations.md), `components.json` (shadcn: new-york style, Radix, CSS variables), `drizzle.config.ts` (schema `src/db/schema/index.ts`, output `drizzle/`, `strict: true`, loads `.env.local`), `eslint.config.mjs`.

npm scripts: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`), `db:generate` (SQL from the schema), `db:migrate` (apply), `db:push` (sync the schema directly, **never on the real database**), `db:studio` (Drizzle's data browser).

Python: `scripts/build-brand-assets.py` and `scripts/fixtures/demo-images.py` need Pillow (`pip install pillow`).

---

## 3. Tunable values that live in code

Not environment variables: change them in code, then test and redeploy.

| Value | Where | Current setting |
|---|---|---|
| Shipping fee | `src/lib/shipping.ts` `FLAT_SHIPPING_CENTS` | ₱80.00 flat (the one place; checkout display and order placement both use it) |
| Payment reference format | `src/lib/order-service.ts` | 6 to 32 characters, `A-Z 0-9 -`, after trimming spaces and upper-casing |
| Order number | `src/lib/orders.ts` | `DC-YYYYMMDD-XXXXXX`, PH date, 6 random characters from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` |
| Upload limits | `src/lib/uploads.ts` `UPLOAD_RULES` | 3D model 50 MB (`.stl`, `.3mf`); product photo, customer image and site image 5 MB (JPG, PNG, WebP). Logos have tighter per-slot limits in `src/lib/branding-schema.ts` |
| Customer upload rate limit | `src/app/api/uploads/presign/route.ts` | 30 per hour per user, held in server memory (G-41) |
| Signed link lifetimes | `src/lib/storage.ts`, `/api/files` | upload (PUT) 300 s; read (GET) 300 s via `/api/files`; default `readUrl` 3600 s |
| Cache lifetime | `cacheLife("hours")` in `catalog.ts`, `reviews.ts`, `site-content.ts` | Hours, but admin changes expire it immediately (`updateTag`) |
| Quantity per line | `cart-service.ts`, `cart/actions.ts` | 1 to 99 |
| Review | `review-actions.ts` | rating 1 to 5, text up to 1000 characters, one per product per customer, delivered orders only, held for approval |
| Saved addresses | `src/lib/order-service.ts` (`placeOrder`) | up to 10 per customer; extras are ignored silently |
| Page sizes | `lib/admin.ts` (orders), `lib/user-admin.ts` (users) | 25 per page |
| Legal text | `site-content-schema.ts` | up to 20,000 characters per page |
| Landing page limits | `site-content-schema.ts` | 6 highlights, 10 FAQ entries, 1 to 8 featured products |
| Footer limits | `site-content-schema.ts` | 8 explore links, 6 social links |
| Privacy default version | `site-content-schema.ts` `DEFAULT_PRIVACY_VERSION` | `2026-11-10`; replaced by a timestamp whenever the owner ticks "ask everyone again" |
| Block reason | `src/lib/user-admin.ts` | 3 to 300 characters, private to admins |
| Database pool | `src/db/index.ts` | 10 connections |
