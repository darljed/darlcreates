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
| `POST /api/uploads/presign` | admin | Validates kind/ext/size (`lib/uploads.ts`), returns a 5-min presigned PUT with `content-type` signed. Kinds: `model` (`.stl` or `.3mf`, ≤50 MB; stored under `models/`), `photo` (≤5 MB jpeg/png/webp), `site` (landing-page hero image and brand logos, same limits, admin only, key `site/…`), `customer` (same limits; **any signed-in user**, key `customer/<userId>/…`, 30 per hour). `model`/`photo` are admin-only. Content type is forced from the extension (`model/stl` / `model/3mf`) |
| `GET /api/files/[...key]` | public for published | Stable URL for catalog files. Signs a fresh 5-min S3 URL per request and 302s to it. Only `photos/`,`stl/`,`models/`,`site/` keys; public only if the file belongs to a published product (or is the current landing hero image / an uploaded logo), else admin only. `site/` files are streamed (not redirected) with `Cache-Control: public, max-age=31536000, immutable` + `nosniff`; an unsaved admin preview is `private, no-store`. `customer/`,`proof/` never served here |

## Server Actions

**Customer**

| Action | File | Notes |
|---|---|---|
| `addToCartAction` | `(shop)/cart/actions.ts` | Wrapper over `addToCart` (`lib/cart-service.ts`): normalizes the selection to the product schema, recomputes price, verifies any customer image (owner, exists, size, magic bytes) |
| `updateQtyAction`, `removeItemAction` | same | Scoped to the user's own cart |
| `placeOrderAction` | `(shop)/checkout/actions.ts` | Thin wrapper over `placeOrder` (service). Returns `{error}` for `useActionState`; redirects on success. Optional "save address" |
| `submitPaymentAction` | same | Wrapper over `submitGcashReference`. Amount is the order total from the DB; reference normalized; duplicates and a 2nd pending payment are refused |
| `submitReviewAction` | `(shop)/products/[slug]/review-actions.ts` | Only for delivered orders, once per product; saved unapproved |

**Admin**

| Action | File | Notes |
|---|---|---|
| `createProductAction`, `updateProductAction` | `(admin)/admin/products/actions.ts` | Slug auto-generated; invalidates `products` + `product:<slug>` tags |
| `addOptionAction`, `deleteOptionAction`, `addOptionValueAction` | same | No edit/reorder/value-delete yet (G-19) |
| `attachModelAction`, `addPhotoAction`, `deletePhotoAction` | same | Take an S3 key from the presign flow; verify the object exists (HEAD) and size; a `.3mf` must start with the ZIP signature. Replacing a model does **not** delete the old object (orders snapshot it) |
| `verifyPaymentAction`, `rejectPaymentAction` | `(admin)/admin/orders/actions.ts` | Records `verified_by`; admin can't verify their own order; sends email |
| `transitionOrderAction` | same | Forward-only via `ORDER_TRANSITIONS`; appends history; "shipped" email |
| `saveShipmentAction` | same | Upsert carrier / tracking |
| `moderateReviewAction` | `(shop)/products/[slug]/review-actions.ts` | Approve / hide |

## Service layer (`src/lib/order-service.ts`)
Framework-free business logic; actions call it, tests call it directly.
`placeOrder`, `submitGcashReference`, `verifyPayment`, `rejectPayment`, `transitionOrder`, `saveShipment`, `cancelOwnOrder`, `reorderToCart`.
Verify/reject/transition are transactional with row locks. Callers do auth, Zod, revalidation, email.

## Customer order actions & CMS
| Action | Notes |
|---|---|
| `cancelOrderAction`, `reorderAction` (`(portal)/orders/actions.ts`) | `requireUser` + Zod, then `cancelOwnOrder` / `reorderToCart` (ownership enforced in the service) |
| `saveBrandingAction`, `resetBrandingAction` (same file) | `requireAdmin`; every NEW logo is re-verified server-side (`branding-verify.ts`: exists, size, real PNG/JPEG/WebP bytes, pixel size and shape for its slot); stored size comes from the file; replaced/removed files are deleted; revalidates `site:brand` |
| `saveSiteInfoAction`, `resetSiteInfoAction` (same file) | `requireAdmin`; Zod `siteInfoSchema`; revalidates tag `site:info` and the storefront layout |
| `saveLegalAction`, `resetLegalAction` (same file) | `requireAdmin`; Zod; the browser can never set the version: only `askAgain` (privacy only) creates a new one; revalidates `site:legal:<slug>` |
| `saveHomeContentAction`, `resetHomeContentAction` (`admin/content/actions.ts`) | `requireAdmin`; Zod `homeContentSchema`; verifies a new hero image (exists, size, magic bytes); revalidates tag `site:home` and `/` |

## Account & privacy
| Route / action | Notes |
|---|---|
| `GET /account/export` | Signed-in user's data as a JSON download (`Cache-Control: no-store`) |
| `acceptConsentAction` (`/consent`) | Records `consent_at` + the current privacy version (`getPrivacyVersion()`), then returns to a `safeRedirect`ed target |
| `deleteAddressAction`, `setDefaultAddressAction` | Scoped to the caller's own addresses |
| `deleteAccountAction` | Requires typing DELETE; `deleteAccount` refuses while an order is in progress or for the admin account |

## Pages

Storefront: `/`, `/privacy`, `/terms`, `/products`, `/products/[slug]`, `/cart`, `/checkout`, `/orders`,
`/orders/[orderNo]`, `/orders/[orderNo]/acknowledgment`, `/account`, `/consent`, `/sign-in`, `/privacy`.
Admin: `/admin`, `/admin/content`, `/admin/branding`, `/admin/store`, `/admin/legal`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]`,
`/admin/orders`, `/admin/orders/[id]`, `/admin/orders/[id]/acknowledgment`, `/admin/payments`, `/admin/reviews`.

## Caching

| Tag | Set by | Invalidated by |
|---|---|---|
| `products`, `product:<slug>` | `listPublishedProducts`, `getProductBySlug` | product / option actions |
| `reviews:<productId>` | `getProductReviews` | review submit + moderate |
| `site:home` | `getHomeContent` (landing page) | `saveHomeContentAction`, `resetHomeContentAction` |
| `site:brand` | `getBranding` (logos, favicon, share image) | `saveBrandingAction`, `resetBrandingAction` |
| `site:info` | `getSiteInfo` (footer) | `saveSiteInfoAction`, `resetSiteInfoAction` |
| `site:legal:privacy`, `site:legal:terms` | `getLegal`, `getPrivacyVersion` | `saveLegalAction`, `resetLegalAction` |

`revalidateTag(tag, "max")` — Next 16 requires the second argument.

Last updated: 2026-11-10
