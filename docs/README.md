# Darl Creates — Docs

Living documentation. Update it in the same unit of work as any code change.

| Doc | Covers |
|---|---|
| [roadmap-and-gaps.md](./roadmap-and-gaps.md) | **Start here for "what's left".** Gap tracker (IDs G-xx/T-xx), agreed next steps, future ideas (F-xx) |
| [setup.md](./setup.md) | First-time setup: running locally, Google OAuth, database, **AWS profile rules**, S3, git, brand assets, quirks |
| [configuration.md](./configuration.md) | Every environment variable, framework option and tunable constant in code |
| [operations.md](./operations.md) | Day-to-day running: build and serve, migrations, secret rotation, backups, launch checklist, troubleshooting |
| [security.md](./security.md) | Who can do what, controls in place, trust boundaries, known gaps |
| [architecture.md](./architecture.md) | System overview: surfaces, caching, auth, storage, data flow |
| [order-lifecycle.md](./order-lifecycle.md) | Statuses and allowed moves, payment verification, what is recorded, how dashboard numbers are defined |
| [database.md](./database.md) | Schema, tables, migrations, money/ledger rules |
| [api-routes.md](./api-routes.md) | Route handlers, Server Actions, cache tags |
| [code-map.md](./code-map.md) | Every route, library, component and script, with what it is for |
| [design-system.md](./design-system.md) | Tokens, density, shell and page primitives, forms, states, responsive and print rules |
| [admin-guide.md](./admin-guide.md) | The owner's guide to each admin page and common workflows |
| [shipping-research.md](./shipping-research.md) | Research (nothing built yet): how to calculate shipping and the cheapest way to integrate it |
| [features.md](./features.md) | What is built, by area |
| [decisions.md](./decisions.md) | Decision log: why things are the way they are |
| [testing.md](./testing.md) | What is tested, how to run it, authenticated browser E2E, demo data |
| [phase-2-generators.md](./phase-2-generators.md) | Plan + open questions for in-browser STL generators |
| [name-on-model.md](./name-on-model.md) | Phase 2 proof of concept: the customer's name on the 3D model, and the 3MF print file built from it |
| [personalization-and-3mf.md](./personalization-and-3mf.md) | Proposal: 3MF support + adding a name to an existing product (levels 1-3, owner questions) |
| [clicker-designer.md](./clicker-designer.md) | The clicker designer: what customers can do, how the model and print file are built, owner settings, limits |
| [clicker-redesign-plan.md](./clicker-redesign-plan.md) | Research on the reference clicker makers and the plan to rebuild the clicker as a mechanical-switch fidget clicker (for review) |
| [backlog.md](./backlog.md) | Pointer to the roadmap |

Scope source of truth: `.kiro/specs/darl-creates-ecommerce/` (requirements,
design, tasks). Cross-agent rules: [`../AGENTS.md`](../AGENTS.md).

When you fix a gap: move its row to **Resolved** in `roadmap-and-gaps.md`, update
the relevant doc, and bump `Last updated`. `npx tsx scripts/test-docs.ts` fails when code is added without being documented
(env vars, files, routes, tables, actions, cache tags, npm scripts).

Last updated: 2026-11-12
