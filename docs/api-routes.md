# API Routes & Server Actions

Convention: every Server Action starts with `requireUser()` / `requireAdmin()` and
a Zod parse, then mutates, then revalidates. Server Actions are directly
POST-able, so the guard must be inside each one. The server is authoritative for
prices and state transitions.

## Route Handlers

| Route | Auth | Purpose |
|---|---|---|
| `GET/POST /api/auth/[...all]` | public | BetterAuth (Google OAuth, session) |
| `GET /admin/orders/[id]/stl/[itemId]` | admin | Redirects to a 120s signed S3 URL for the item's STL snapshot. 404 no STL, 503 storage not configured |
| ~~`POST /api/uploads/presign`~~ | — | **Does not exist yet** — see gap G-01. `lib/storage.ts#presignUpload` is unused |

## Server Actions

**Customer**

| Action | File | Notes |
|---|---|---|
| `addToCartAction` | `(shop)/cart/actions.ts` | Recomputes price from the live option schema |
| `updateQtyAction`, `removeItemAction` | same | Scoped to the user's own cart |
| `placeOrderAction` | `(shop)/checkout/actions.ts` | Re-validates every line, transaction: order + items + history + clear cart; sends "placed" email; redirects to the order. Flat ₱80 shipping (G-08) |
| `submitPaymentAction` | same | Inserts a *new* pending payment (append-only). ⚠️ amount currently comes from the client (G-07) |
| `submitReviewAction` | `(shop)/products/[slug]/review-actions.ts` | Only for delivered orders, once per product; saved unapproved |

**Admin**

| Action | File | Notes |
|---|---|---|
| `createProductAction`, `updateProductAction` | `(admin)/admin/products/actions.ts` | Slug auto-generated; invalidates `products` + `product:<slug>` tags |
| `addOptionAction`, `deleteOptionAction`, `addOptionValueAction` | same | No edit/reorder/value-delete yet (G-19) |
| `verifyPaymentAction`, `rejectPaymentAction` | `(admin)/admin/orders/actions.ts` | Records `verified_by`; admin can't verify their own order; sends email |
| `transitionOrderAction` | same | Forward-only via `ORDER_TRANSITIONS`; appends history; "shipped" email |
| `saveShipmentAction` | same | Upsert carrier / tracking |
| `moderateReviewAction` | `(shop)/products/[slug]/review-actions.ts` | Approve / hide |

## Pages

Storefront: `/`, `/products`, `/products/[slug]`, `/cart`, `/checkout`, `/orders`,
`/orders/[orderNo]`, `/sign-in`, `/privacy`.
Admin: `/admin`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]`,
`/admin/orders`, `/admin/orders/[id]`, `/admin/payments`, `/admin/reviews`.

## Caching

| Tag | Set by | Invalidated by |
|---|---|---|
| `products`, `product:<slug>` | `listPublishedProducts`, `getProductBySlug` | product / option actions |
| `reviews:<productId>` | `getProductReviews` | review submit + moderate |

`revalidateTag(tag, "max")` — Next 16 requires the second argument.

Last updated: 2026-11-09
