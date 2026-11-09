# Darl Creates — Project Structure

```
darlcreates/
├─ .kiro/
│  ├─ specs/darl-creates-ecommerce/   # requirements.md, design.md, tasks.md (SOURCE OF TRUTH)
│  └─ steering/                         # product.md, tech.md, structure.md
├─ docs/                                # living docs (keep in sync with code)
├─ drizzle/                             # generated SQL migrations + meta
├─ scripts/                             # test-*.ts (tsx), seed, one-off tools
├─ public/
├─ src/
│  ├─ app/
│  │  ├─ (shop)/                        # customer storefront surface
│  │  ├─ (admin)/admin/                 # owner-only, RBAC-gated surface
│  │  ├─ api/auth/[...all]/route.ts     # BetterAuth handler
│  │  ├─ layout.tsx  globals.css  page.tsx
│  ├─ components/
│  │  ├─ ui/                            # shadcn primitives (cn -> @/lib/utils)
│  │  └─ three/                         # STL viewer + 3D (ssr:false)
│  ├─ db/
│  │  ├─ schema/ (auth.ts, catalog.ts, commerce.ts, index.ts)
│  │  └─ index.ts                       # drizzle client
│  └─ lib/
│     ├─ auth.ts  auth-client.ts  session.ts   # BetterAuth + RBAC guards
│     ├─ money.ts                               # centavos <-> ₱ (ONLY money path)
│     └─ utils.ts                               # cn()
├─ components.json  drizzle.config.ts  next.config.ts
└─ .env.local (gitignored)  .env.example
```

## Where things go
- **Route groups**: `(shop)` = public/customer, `(admin)/admin` = owner. Admin
  layout calls `requireAdmin()`; customer-only pages call `requireUser()`.
- **Server Actions**: colocate as `actions.ts` next to the feature, `"use server"`
  at top, auth guard + Zod parse first.
- **DB schema**: split by domain in `src/db/schema/*`, re-exported from `index.ts`.
  After editing schema → `npm run db:generate` then review the SQL.
- **Tests**: `scripts/test-<feature>.ts`, run with `npx tsx`.
- **Money**: never format/parse money outside `src/lib/money.ts`.
- **3D**: all Three.js under `src/components/three`, dynamically imported.

## Naming
- Files/dirs: kebab-case. Components: PascalCase. DB columns: snake_case
  (Drizzle maps camelCase fields → snake_case columns explicitly).
- Branches: feature branches off `develop`; conventional commits.
