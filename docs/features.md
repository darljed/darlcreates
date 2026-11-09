# Features

Status legend: ✅ done · 🚧 in progress · ⬜ planned

## Foundation
- ✅ Next.js 16 + shadcn/ui (Vibrant Pop theme) + Tailwind v4
- ✅ Drizzle schema (18 tables) + initial migration generated
- ✅ BetterAuth (Google OAuth) wiring + RBAC guards (`requireUser`/`requireAdmin`)
- ✅ Money core (`lib/money.ts`, integer centavos) + self-check
- ✅ Vibrant Pop landing page
- ✅ Multi-agent steering (Kiro `.kiro/steering`, `AGENTS.md`, `CLAUDE.md`)

## Storefront (customer) — ⬜ planned
Browse/search catalog, 3D STL viewer, customizer (color/text/size/image, live
price), cart, GCash checkout, order tracking, reviews.

## Admin (owner) — ⬜ planned
Product CRUD + customization-schema builder, STL/photo uploads, order management
+ lifecycle, payment verification queue, shipping entry, sales dashboard, review
moderation.

## Compliance — ⬜ planned
DPA consent + privacy policy + data deletion; non-BIR Order Acknowledgment.
