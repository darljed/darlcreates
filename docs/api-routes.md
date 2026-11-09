# API Routes & Server Actions

## Route Handlers (`src/app/api`)
- `GET|POST /api/auth/[...all]` — BetterAuth handler (Google OAuth, session).
- _(planned)_ `POST /api/uploads/presign` — scoped presigned S3 PUT for STL /
  photos / customer images / payment proof.

## Server Actions (colocated `actions.ts` per feature) — planned
Each begins with `requireUser()`/`requireAdmin()` + Zod parse, then mutates, then
`revalidatePath`/`revalidateTag`/`refresh`.
- Catalog (admin): create/update/publish/archive product; manage options/values.
- Cart: add configured item, update qty, remove.
- Checkout: place order (snapshot items + address, status `awaiting_payment`).
- Payments: submit GCash reference; admin verify/reject (separation of duties).
- Orders (admin): status transitions (append history), shipping entry.
- Reviews: submit (delivered-order gated), admin moderate.

Convention: no business logic in client components; the server is authoritative
for all prices and state transitions.
