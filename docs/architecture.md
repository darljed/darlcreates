# Architecture

Single Next.js 16 (App Router) codebase, two surfaces:

- **Storefront** `src/app/(shop)/**` — public + authenticated customer pages.
- **Admin** `src/app/(admin)/admin/**` — owner-only, server-side RBAC-gated.

```
Browser (React 19, shadcn/ui, react-three-fiber STL viewer)
   │ HTTPS
Next.js 16 (App Router, Cache Components ON)
   ├─ Server Components (data reads) + Server Actions (mutations, RBAC + Zod)
   ├─ Route Handlers: app/api/auth/[...all] (BetterAuth), presigned S3 (later)
   └─ Drizzle ORM
        │
PostgreSQL (DB Stack, agent-server, db=darlcreates)
AWS S3 (STL, photos, customer images, payment proof) → CloudFront
Email (SMTP/SES) order notifications
```

## Key decisions
- **Mutations = Server Actions**, each guarded (`requireUser`/`requireAdmin`) and
  Zod-validated before touching data. No business logic in client components.
- **Money = integer centavos** everywhere; one formatter (`src/lib/money.ts`).
- **Append-only ledgers**: `payments`, `order_status_history`.
- **Immutable snapshots**: cart/order items snapshot config + price; catalog edits
  never mutate history.
- **3D viewer** dynamically imported (`ssr:false`), reduced-motion aware, with a
  non-blocking photo fallback.
- **Cache Components**: public catalog cached (`use cache` + `cacheLife`); cart,
  orders, admin are dynamic (read `cookies()`/`headers()`/`await params`).

## Status
Foundation scaffolded: Next 16 + shadcn (Vibrant Pop theme) + Drizzle schema
(18 tables, migration generated) + BetterAuth (Google) + money/RBAC libs +
landing page. DB creation on the agent-server pending Tailscale connectivity.
