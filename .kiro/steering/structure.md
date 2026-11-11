# Darl Creates — Project Structure

```
darlcreates/
├─ .kiro/
│  ├─ specs/darl-creates-ecommerce/   # requirements.md, design.md, tasks.md (SOURCE OF TRUTH)
│  └─ steering/                         # product.md, tech.md, structure.md
├─ docs/                                # living docs; start at docs/README.md, file-by-file list in docs/code-map.md
├─ drizzle/                             # generated SQL migrations + meta
├─ scripts/                             # test-*.ts (tsx), seed*, e2e-session, make-admin, fixtures/, lib/revalidate.ts
├─ public/brand/                        # built-in logos (owner uploads override them)
├─ src/
│  ├─ app/
│  │  ├─ (shop)/                        # public storefront: /, /products, /cart, /checkout, /privacy, /terms, /sign-in, /consent
│  │  ├─ (portal)/                      # signed-in customer area in InsetShell: /orders, /account
│  │  ├─ (admin)/admin/                 # owner-only, RBAC-gated (layout calls requireAdmin)
│  │  ├─ api/{auth,uploads/presign,files,revalidate}/
│  │  ├─ layout.tsx  not-found.tsx  globals.css   # each route group also has its own not-found.tsx
│  ├─ components/
│  │  ├─ ui/                            # shadcn primitives (cn -> @/lib/utils)
│  │  ├─ shell/                         # InsetShell + page primitives (PageHeader, Panel, DataTable, Stat...)
│  │  ├─ admin/                         # admin-only client components and editor-bits (Field, Check, RowTools)
│  │  └─ three/                         # STL/3MF viewer + ViewerLoading (ssr:false)
│  ├─ db/
│  │  ├─ schema/ (auth.ts, catalog.ts, commerce.ts, site.ts, index.ts)
│  │  └─ index.ts                       # drizzle client
│  └─ lib/                              # pure libs, framework-free services, cached reads (see docs/code-map.md)
│     ├─ auth.ts  auth-client.ts  session.ts   # BetterAuth + RBAC guards
│     ├─ order-service.ts  cart-service.ts  user-admin.ts  privacy.ts   # services: no next/* imports
│     ├─ site-content*.ts  branding-*.ts  legal-format.ts               # CMS: schema (pure), store, cached reads
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
- **Docs**: every env var -> `docs/configuration.md`; every file, route -> `docs/code-map.md`; tables -> `database.md`;
  Server Actions and cache tags -> `api-routes.md`. `npx tsx scripts/test-docs.ts` fails if one is missing.
- **Cache**: admin actions use `updateTag`; scripts call `POST /api/revalidate` (needs `REVALIDATE_SECRET`).
- **Copy rule**: never mention the store's tax or registration status anywhere (`test-content.ts` scans the source).

## Naming
- Files/dirs: kebab-case. Components: PascalCase. DB columns: snake_case
  (Drizzle maps camelCase fields → snake_case columns explicitly).
- Branches: feature branches off `develop`; conventional commits.
