# Darl Creates

E-commerce for a Philippine 3D-printing shop. Customers browse ready-to-print
products, spin them in 3D, customize them (color / size / text / image), pay via
**GCash with manual reference verification**, and track their order. The owner
runs the catalog, customization options, payment verification, fulfilment,
shipping and sales from an admin panel.

> **Status:** Phase 1 is built and tested on `develop`: storefront, customer area and owner admin
> (orders, payments, products, users, landing page, logos, store details, legal pages). Authenticated flows were
> checked in a real browser. Open items and launch blockers: [docs/roadmap-and-gaps.md](docs/roadmap-and-gaps.md).
> **Phase 2** (in-browser STL generators) is planned, not started.

## Stack

Next.js 16 (App Router, Cache Components) · React 19 · TypeScript · Tailwind v4 ·
shadcn/ui · Drizzle ORM · PostgreSQL · BetterAuth (Google) · react-three-fiber ·
AWS S3 · Zod. Design direction: **Vibrant Pop**.

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in values (see docs/setup.md)
npx next dev -p 3001         # http://localhost:3001 (port 3000 is used by another project here)
```

Needs Tailscale up (database is on the agent-server). Full setup, Google OAuth
and AWS profile rules: **[docs/setup.md](docs/setup.md)**; every setting: **[docs/configuration.md](docs/configuration.md)**.

## Verify

```bash
npm run typecheck && npx eslint src scripts
NEXT_DIST_DIR=.next-build npx next build && rm -rf .next-build
npx tsx scripts/test-docs.ts      # plus the other scripts/test-*.ts (see docs/testing.md)
```

## Documentation

| Doc | What's in it |
|---|---|
| [docs/README.md](docs/README.md) | Index |
| [docs/roadmap-and-gaps.md](docs/roadmap-and-gaps.md) | **Gap tracker, next steps, future ideas** |
| [docs/setup.md](docs/setup.md) | Run, DB, Google OAuth, AWS profile, S3 |
| [docs/configuration.md](docs/configuration.md) | Every env var, framework option and tunable constant |
| [docs/operations.md](docs/operations.md) | Run, deploy, migrate, rotate secrets, launch checklist, troubleshooting |
| [docs/security.md](docs/security.md) | Threat model, controls, known gaps |
| [docs/architecture.md](docs/architecture.md) | System design |
| [docs/order-lifecycle.md](docs/order-lifecycle.md) | Order statuses, payments, what is recorded |
| [docs/database.md](docs/database.md) | Schema, migrations, ledger rules |
| [docs/api-routes.md](docs/api-routes.md) | Routes, Server Actions, cache tags |
| [docs/code-map.md](docs/code-map.md) | Every file and what it is for |
| [docs/design-system.md](docs/design-system.md) | Tokens, shell, components, responsive rules |
| [docs/admin-guide.md](docs/admin-guide.md) | Owner's guide to `/admin` |
| [docs/features.md](docs/features.md) | What's built |
| [docs/testing.md](docs/testing.md) | Tests, E2E, demo data |
| [docs/decisions.md](docs/decisions.md) | Why things are the way they are |
| [docs/phase-2-generators.md](docs/phase-2-generators.md) | STL generator plan |
| [.kiro/specs/darl-creates-ecommerce/](.kiro/specs/darl-creates-ecommerce/) | Requirements, design, tasks |
| [AGENTS.md](AGENTS.md) / [CLAUDE.md](CLAUDE.md) | Rules for AI agents |

## Hard rules (short version)

Money is integer centavos · payments and status history are append-only · order
items snapshot config + price · prices are recomputed server-side · admin is
gated server-side on every route and action · never mention tax or registration status in any copy ·
use AWS profile **`darljed`**
only (never the PMPC profiles).
