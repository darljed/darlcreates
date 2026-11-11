# Architecture

> Last updated: 2026-11-11. File-level detail: [code-map.md](./code-map.md). Why-decisions: [decisions.md](./decisions.md).

One Next.js 16 codebase (App Router, React 19, Cache Components ON) with three surfaces:

| Surface | Path | Who | Shell |
|---|---|---|---|
| Storefront | `src/app/(shop)/**` | Anyone; cart, checkout and review need sign-in | Header + footer |
| Customer area | `src/app/(portal)/**` | Signed-in customers (`requireUser()` in the layout) | `InsetShell`, comfortable density |
| Admin | `src/app/(admin)/admin/**` | The owner only (`requireAdmin()` in the layout **and** in every action) | `InsetShell`, compact density |

```
Browser (React 19, shadcn/ui, react-three-fiber viewer)
   │ HTTPS  (public: Tailscale Funnel → port 3001)
Next.js 16
   ├─ Server Components: reads (cached public data, dynamic per-user data)
   ├─ Server Actions: every mutation = guard → Zod → service → refresh caches → email
   ├─ Route handlers: /api/auth, /api/uploads/presign, /api/files, /api/revalidate,
   │                  /account/export, /admin/orders/[id]/stl/[itemId]
   └─ Drizzle ORM (pool of 10)
        │
PostgreSQL 16 (agent-server, db `darlcreates`, Tailscale-only)
AWS S3 `darlcreates-uploads` (ap-south-1): models, photos, site logos, customer images
SMTP: order emails (console log when unset)
```

## Layers

1. **Pure libraries** (`pricing`, `money`, `orders`, `site-content-schema`, `branding-schema`, `image-size`, `legal-format`, `product-filter`, `viewer-framing`, `uploads`). No I/O. Shared by the browser, actions and tests.
2. **Services** (`order-service`, `cart-service`, `user-admin`, `privacy`, `site-content-store`, `addresses`). Take plain arguments, use the database, import nothing from `next/*`. Scripts and tests call them directly, so tests exercise the real code.
3. **Server Actions** (`actions.ts` files). Check who is asking, parse input with Zod, call a service, refresh caches, send email. No business rules here.
4. **Pages and components.** Pages read data; client components handle interaction only.

## Data and rules that shape everything

- **Money** is integer centavos, only through `src/lib/money.ts`.
- **Append-only**: `payments`, `order_status_history`, `admin_audit`.
- **Snapshots**: order and cart items copy the chosen options and price; `orders.ship_address` copies the address. Later edits never change history.
- **The server decides prices and amounts.** The browser's price preview is for display; add-to-cart and checkout recompute from the database.
- **Order moves** are forward-only, run in a transaction with row locks, and payment verification is the only way to reach `paid`. See [order-lifecycle.md](./order-lifecycle.md).
- **Separation of duties**: the person who verifies a payment (`verified_by`) cannot be the paying customer.

## Caching (Cache Components)

- Pages are static unless they read a dynamic value. Per-user and admin pages read `cookies()`/`headers()`/`await params` and opt out with `instant = false` or a `<Suspense>` boundary (`scripts/test-instant.ts` checks this).
- Public data is cached with `"use cache"` + `cacheLife("hours")` and tagged: `products`, `product:<slug>`, `reviews:<productId>`, `site:home`, `site:info`, `site:brand`, `site:legal:<slug>`. Full table: [api-routes.md](./api-routes.md#caching).
- Admin Server Actions call `updateTag` (expires at once, so a removed product never stays as a dead link). Scripts that write to the database call `POST /api/revalidate`. Decision D-34.
- `getCurrentUser()` calls `await connection()` first because session expiry compares to the current time. Decision D-16.

## Authentication and access

- BetterAuth, **Google only**. Sessions are database rows (`sessions`). `users.role` is `customer` or `admin`; the role is changed only by `scripts/make-admin.ts`.
- `requireUser()` also sends users who have not accepted the current privacy version to `/consent`, and refuses blocked users.
- Admin checks happen in the admin layout and again inside every admin action and admin route handler. Details: [security.md](./security.md).

## File storage

- Private S3 bucket. The browser uploads directly with a presigned PUT (`/api/uploads/presign` checks kind, type and size first). The server re-checks what arrived (object exists, size, real file bytes) before attaching anything.
- Reads go through `/api/files/<key>`, which decides whether the caller may see the file and then redirects to a short-lived signed URL (or streams, for site logos). Cached pages embed the stable `/api/files` URL, so signed links never expire inside a cache (G-03).
- Admin-only: model downloads per order item. Customer images and payment proof are never served by `/api/files`.

## 3D viewer

`three` + `@react-three/fiber` + `drei`, loaded with `next/dynamic` (`ssr: false`), reads STL and 3MF, frames any model in view, honors reduced motion, and shows `ViewerLoading` until the first frame. The customer's colour choice recolours the model; coloured 3MF parts keep their colours.

## Content management

The owner edits the landing page, store details and footer, logos and the privacy and terms text in the admin. They are JSON documents in `site_content`, validated by Zod on every read and write, rendered only as React text (never HTML), and fall back to built-in defaults when a row is missing or invalid. Links and icon names come from allow-lists. Decisions D-25, D-28, D-30.

## Environments

| | Where | Notes |
|---|---|---|
| Dev | `npx next dev -p 3001` on the MacBook | Reached via localhost or the Funnel URL; dev-only trusted origins and `allowedDevOrigins` |
| "Production" today | Same machine behind Tailscale Funnel | Must be a production build (`next build` + `next start`), not `next dev` (G-04) |
| Database | agent-server Postgres | Shared box; only the `darlcreates` database is ours |

## Open architectural risks

- **Single host, no scheduled backup, no error monitoring** (G-67, F-15).
- **No security headers** (G-65).
- **Database reachable only over Tailscale**: a hosted app elsewhere would need a different path (G-04).
- **Orphaned uploads** are never swept (G-27, G-40).
- **Image upload rate limit is per process** (G-41).
- **No dark theme** (G-30).
