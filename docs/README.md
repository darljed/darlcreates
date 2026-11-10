# Darl Creates — Docs

Living documentation. Update it in the same unit of work as any code change.

| Doc | Covers |
|---|---|
| [roadmap-and-gaps.md](./roadmap-and-gaps.md) | **Start here for "what's left".** Gap tracker (IDs G-xx/T-xx), agreed next steps, future ideas (F-xx) |
| [setup.md](./setup.md) | Running locally, env vars, Google OAuth, database, **AWS profile rules**, planned S3 setup, git, quirks |
| [decisions.md](./decisions.md) | Decision log — why things are the way they are |
| [architecture.md](./architecture.md) | System overview, surfaces, data flow |
| [database.md](./database.md) | Schema, tables, money/ledger rules |
| [features.md](./features.md) | What is built, by area |
| [api-routes.md](./api-routes.md) | Route handlers + Server Actions |
| [testing.md](./testing.md) | What is tested, how to run it, and how the authenticated browser E2E works |
| [phase-2-generators.md](./phase-2-generators.md) | Plan + open questions for in-browser STL generators |
| [personalization-and-3mf.md](./personalization-and-3mf.md) | Proposal: 3MF support + adding a name to an existing product (levels 1-3, owner questions) |
| [backlog.md](./backlog.md) | Pointer to the roadmap |

Scope source of truth: `.kiro/specs/darl-creates-ecommerce/` (requirements,
design, tasks). Cross-agent rules: [`../AGENTS.md`](../AGENTS.md).

When you fix a gap: move its row to **Resolved** in `roadmap-and-gaps.md`, update
the relevant doc, and bump `Last updated`.

Last updated: 2026-11-09
