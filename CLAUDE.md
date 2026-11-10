# Darl Creates — Claude Guide

The cross-agent source of truth is **[AGENTS.md](./AGENTS.md)** — read it first;
everything below just points there so all agents stay in sync.

- **Product, stack, hard rules, Next.js 16 gotchas, workflow, commands** →
  see `AGENTS.md`.
- **Full spec** (requirements / design / tasks) →
  `.kiro/specs/darl-creates-ecommerce/`.
- Kiro mirrors the same rules in `.kiro/steering/{product,tech,structure}.md`.

## The essentials (do not violate)
- Money = integer centavos (PHP); only via `src/lib/money.ts`.
- `payments` and `order_status_history` are append-only.
- Cart/order items store immutable config + price snapshots.
- Manual GCash verification; separation of duties (`verifiedBy`).
- Not BIR-registered → "Order Acknowledgment" (non-VAT), never "Official Receipt".
- RBAC server-side on every `/admin` route and admin Server Action.
- Next.js 16 with Cache Components ON — read `node_modules/next/dist/docs/`
  before using unfamiliar APIs; `params`/`searchParams` are Promises.
- shadcn: rewrite `import { cn } from "cn"` → `@/lib/utils`; never install `cn`.

## Gate before "done"
`npm run build` (0 errors) · `npm run typecheck` · `npx tsx scripts/test-*.ts` ·
DB consistency for writes. Branch off `develop`; never merge without permission.

## AWS + tracking
- AWS: profile **`darljed`** only (account `551892774595`). Never `default` /
  `pmpc-*` (PMPC account). Verify with `aws sts get-caller-identity --profile darljed`.
- Gaps and next steps are tracked in `docs/roadmap-and-gaps.md` (G-/T-/F- IDs).
