# Darl Creates

E-commerce for a Philippine 3D-printing shop. Customers browse ready-to-print
products, spin them in 3D, customize them (color / size / text / image), pay via
**GCash with manual reference verification**, and track their order. The owner
runs the catalog, customization options, payment verification, fulfilment,
shipping and sales from an admin panel.

> **Status:** Phase 1 MVP built and committed on `develop` (storefront + admin).
> Not yet browser-tested with real auth/uploads. See
> [docs/roadmap-and-gaps.md](docs/roadmap-and-gaps.md) for exactly what's missing.
> **Phase 2** (in-browser STL generators) is planned, not started.

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind v4 ·
shadcn/ui · Drizzle ORM · PostgreSQL · BetterAuth (Google) · react-three-fiber ·
AWS S3 · Zod. Design direction: **Vibrant Pop**.

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in values (see docs/setup.md)
npm run dev                  # http://localhost:3000
```

Needs Tailscale up (database is on the agent-server). Full setup, env table,
Google OAuth, AWS profile rules and the S3 plan: **[docs/setup.md](docs/setup.md)**.

## Verify

```bash
npm run build && npm run typecheck
npx tsx scripts/test-money.ts
npx tsx scripts/test-pricing.ts
npx tsx scripts/test-order-lifecycle.ts
```

## Documentation

| Doc | What's in it |
|---|---|
| [docs/README.md](docs/README.md) | Index |
| [docs/roadmap-and-gaps.md](docs/roadmap-and-gaps.md) | **Gap tracker, next steps, future ideas** |
| [docs/setup.md](docs/setup.md) | Run, env, DB, AWS profile, S3 plan |
| [docs/decisions.md](docs/decisions.md) | Why things are the way they are |
| [docs/architecture.md](docs/architecture.md) | System design |
| [docs/database.md](docs/database.md) | Schema + ledger rules |
| [docs/features.md](docs/features.md) | What's built |
| [docs/api-routes.md](docs/api-routes.md) | Routes & Server Actions |
| [docs/phase-2-generators.md](docs/phase-2-generators.md) | STL generator plan |
| [.kiro/specs/darl-creates-ecommerce/](.kiro/specs/darl-creates-ecommerce/) | Requirements, design, tasks |
| [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) | Rules for AI agents |

## Hard rules (short version)

Money is integer centavos · payments and status history are append-only · order
items snapshot config + price · prices are recomputed server-side · admin is
gated server-side on every route and action · not BIR-registered, so
"Order Acknowledgment" not "Official Receipt" · use AWS profile **`darljed`**
only (never the PMPC profiles).
