# API Routes & Server Actions

Convention: every Server Action starts with `requireUser()` / `requireAdmin()` and
a Zod parse, then mutates, then revalidates. Server Actions are directly
POST-able, so the guard must be inside each one. The server is authoritative for
prices and state transitions.

## Route Handlers

| Route | Auth | Purpose |
|---|---|---|
| `GET/POST /api/auth/[...all]` | public | BetterAuth (Google OAuth, session) |
| `GET /admin/orders/[id]/stl/[itemId]` | admin | Redirects to a 120s signed S3 URL for the item's STL snapshot. **If the product has a name slot and the customer typed a name, returns a 3MF built on the spot** (the original STL or 3MF + the name as one more part of its object; `Cache-Control: private, no-store`; 422 with the reason if the name cannot be printed). 404 no STL, 503 storage not configured |
| `POST /api/uploads/presign` | admin | Validates kind/ext/size (`lib/uploads.ts`), returns a 5-min presigned PUT with `content-type` signed. Kinds: `model` (`.stl` or `.3mf`, ≤50 MB; stored under `models/`), `photo` (≤5 MB jpeg/png/webp), `site` (landing-page hero image and brand logos, same limits, admin only, key `site/…`), `customer` (same limits; **any signed-in user**, key `customer/<userId>/…`, 30 per hour). `model`/`photo` are admin-only. Content type is forced from the extension (`model/stl` / `model/3mf`) |
| `GET /api/files/[...key]` | public for published | Stable URL for catalog files. Signs a fresh 5-min S3 URL per request and 302s to it. Only `photos/`,`stl/`,`models/`,`site/` keys; public only if the file belongs to a published product (or is the current landing hero image / an uploaded logo), else admin only. `site/` files are streamed (not redirected) with `Cache-Control: public, max-age=31536000, immutable` + `nosniff`; an unsaved admin preview is `private, no-store`. `customer/`,`proof/` never served here |

## Server Actions

**Customer**

| Action | File | Notes |
|---|---|---|
| `addToCartAction` | `(shop)/cart/actions.ts` | **Does not redirect.** Uses `getAccess()`; when sign-in or privacy consent is missing it returns `{ ok:false, needs:"sign_in"\|"consent" }` so the product page keeps the customer's choices, sends them through sign-in / consent, and finishes the add on return (D-35). Otherwise a wrapper over `addToCart` (`lib/cart-service.ts`): normalizes the selection to the product schema, recomputes price, **checks a name that goes on the model is printable (`nameProblem`)**, verifies any customer image (owner, exists, size, magic bytes) |
| `addManyToCartAction` | same | Several names at once (bulk order). Same access handling as `addToCartAction`. Every row (own text, font, name colour, part colours, quantity; at most 20 rows) is validated and priced first; nothing is added unless all rows are valid, then all lines go in with one insert. Errors are prefixed with the row ("Name 2: …") |
| `updateQtyAction`, `removeItemAction` | same | Scoped to the user's own cart |
| `placeOrderAction` | `(shop)/checkout/actions.ts` | Thin wrapper over `placeOrder` (service). Returns `{error}` for `useActionState`; redirects on success. Optional "save address" |
| `submitPaymentAction` | same | Wrapper over `submitGcashReference`. Amount is the order total from the DB; reference normalized; duplicates and a 2nd pending payment are refused |
| `submitReviewAction` | `(shop)/products/[slug]/review-actions.ts` | Only for delivered orders, once per product; saved unapproved |

**Admin**

| Action | File | Notes |
|---|---|---|
| `createProductAction`, `updateProductAction` | `(admin)/admin/products/actions.ts` | Slug auto-generated; invalidates `products` + `product:<slug>` tags |
| `addOptionAction`, `deleteOptionAction`, `addOptionValueAction` | same | Add an option or a choice; delete an option. Colour choices must be in the shop's Colours list |
| `updateOptionAction` | same | Edit an option's label, required flag, price and (text) max length; other constraints stay |
| `updateOptionValueAction`, `deleteOptionValuesAction` | same | Rename or reprice a choice (a colour's hex is not editable, delete and add instead); delete choices |
| `addAllColoursAction` | same | Add every colour of the shop's Colours list (or the built-in list when none is saved) that a colour option lacks |
| `redetectCustomizationsAction` | same | Auto-detect: read the attached 3MF again and replace the product's colour options (one per colourable part, each with every shop colour). Text and size options stay. Returns `auto` with notes. STL refused |
| `deleteProductAction` | same | Delete a product for good (options, photos, reviews cascade; files removed from storage; cart lines removed). Refused for a service (the clicker designer) and for a product on any order line (archive instead) |
| `saveNameSlotAction` | same | Save or remove the **name slot** on a text option (Zod `nameSlotSchema`). Refused unless the product's model is an STL or 3MF, and unless a name of the widest allowed size sits fully on the surface there (the error says the widest width that does). Invalidates the product caches. `attachModelAction` additionally auto-configures from a 3MF (name slot from the designer's example text, Colors from the project's filaments) and returns what it did in `auto` |
| `saveShippingConfigAction`, `resetShippingConfigAction` | `(admin)/admin/shipping/actions.ts` | Admin: save the shipping rate table (Zod `shippingConfigSchema`: tiers ascending, a price for every zone and tier) or go back to the starting rates; expires `site:shipping` |
| `saveProductCostingAction` | `(admin)/admin/products/costing-actions.ts` | Admin: set a product's internal print cost and bill of materials (parts per unit). Zod; returns `{ ok }` |
| `saveKeychainConfigAction` | same | Admin: make a product a name keychain designer (or back to normal). Zod `keychainConfigSchema`; length steps must rise and reach the longest keychain; palette has no repeats; at least one icon when the icon style is on; refused when the product has other options. Saves into the one text option's `constraints.keychain` and flags the product `is_service` |
| `saveClickerConfigAction` | same | Admin: make a product a clicker designer (or back to normal). Zod `clickerConfigSchema`; size steps must rise and reach the largest key size; palette has no repeats; colours per print not above the palette. Creates or updates the required text option "Your clicker" (`constraints.clicker`); refused if the product has other options. Turning it on sets `products.is_service`; turning it off is refused for a service. Invalidates the product caches |
| `measureWallAction` | same | Admin: how thick the model is behind the name area (mm), so the editor can limit an engraving's depth (needs 0.8 mm left). `saveNameSlotAction` checks it again |
| `measureNameSpaceAction` | same | Admin: how much room a name has at a spot (position, normal, up) on the product's model, as a table of widest-area-per-height. Powers the size limits in "Name on the model" |
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
| `redrawPictureAction` (`(shop)/clicker/actions.ts`) | `getAccess` (signed in, consent; returns `needs` so the designer keeps the design); Zod; the picture must really be a PNG/JPEG/WebP under 1.1 MB; the product must be published with AI on and pictures on; daily limit per customer; the colours asked for come from the product's palette (the colour inventory), never the browser; then OpenRouter. Returns the redrawn picture as a data URL (and the backdrop colour to cut out). Nothing is stored |
| `saveColourInventoryAction`, `resetColourInventoryAction` (`colours/actions.ts`) | `requireAdmin`; Zod (`colourInventorySchema`: 2 to 24 colours, no duplicates); saves the `colours` document; expires `site:colours` and `products`; returns how many colour choices on products are now hidden. Reset removes the document (nothing is filtered again) |
| `saveBrandingAction`, `resetBrandingAction` (same file) | `requireAdmin`; every NEW logo is re-verified server-side (`branding-verify.ts`: exists, size, real PNG/JPEG/WebP bytes, pixel size and shape for its slot); stored size comes from the file; replaced/removed files are deleted; revalidates `site:brand` |
| `saveSiteInfoAction`, `resetSiteInfoAction` (same file) | `requireAdmin`; Zod `siteInfoSchema`; revalidates tag `site:info` and the storefront layout |
| `saveLegalAction`, `resetLegalAction` (same file) | `requireAdmin`; Zod; the browser can never set the version: only `askAgain` (privacy only) creates a new one; revalidates `site:legal:<slug>` |
| `saveHomeContentAction`, `resetHomeContentAction` (`admin/content/actions.ts`) | `requireAdmin`; Zod `homeContentSchema`; verifies a new hero image (exists, size, magic bytes); revalidates tag `site:home` and `/` |

## Users (admin)
| Action (`admin/users/actions.ts`) | Notes |
|---|---|
| `blockUserAction` / `unblockUserAction` | `requireAdmin`; reason required (3+ chars, private); ends all sessions in the same transaction; refuses yourself, admins and deleted accounts |
| `endAllSessionsAction`, `endSessionAction` | The "reset" for a Google-only app; allowed on other admins, not yourself |
| `requireReconsentAction` | Clears the user's consent, so they see `/consent` next visit |
| `updateUserProfileAction` | name / email (lower-cased, unique) / private note; audit entry records each field from → to |
| `updateUserAddressAction`, `deleteUserAddressAction` | Scoped to that user's own address ids |
| `deleteUserAccountAction` | Requires typing DELETE; same rules as self-service deletion (refused while an order is in progress) |

Logic is in `lib/user-admin.ts` (framework-free). Sign-in is refused for blocked users by a BetterAuth `databaseHooks.session.create.before` hook, and `requireUser` double-checks. A failed sign-in returns to `/sign-in?error=…`.

| Route | Notes |
|---|---|
| `POST /api/revalidate` | For scripts only. Header `x-revalidate-secret`; disabled (404) unless `REVALIDATE_SECRET` is set; allow-listed tag patterns; expires immediately |

## Account & privacy
| Route / action | Notes |
|---|---|
| `GET /account/export` | Signed-in user's data as a JSON download (`Cache-Control: no-store`) |
| `acceptConsentAction` (`/consent`) | Records `consent_at` + the current privacy version (`getPrivacyVersion()`), then returns to a `safeRedirect`ed target |
| `deleteAddressAction`, `setDefaultAddressAction` | Scoped to the caller's own addresses |
| `deleteAccountAction` | Requires typing DELETE; `deleteAccount` refuses while an order is in progress or for the admin account |

## Public metadata routes
| Route | Notes |
|---|---|
| `GET /robots.txt` | `src/app/robots.ts`. Allows public pages and `/api/files/` to search and AI crawlers; disallows admin, account, orders, cart, checkout, sign-in, consent and `/api/` |
| `GET /sitemap.xml` | `src/app/sitemap.ts`. Home, shop, legal pages, every published product with its last edit. Cached with tag `products` |
| `GET /llms.txt` | `src/app/llms.txt/route.ts`. Markdown summary for AI assistants: ordering, payment, flat shipping, catalog with prices, FAQ, contact. Cached with tags `products`, `site:home`, `site:info` |
| `GET /manifest.webmanifest` | `src/app/manifest.ts`. Name, description, icons (the uploaded browser-tab icon when 512 px or larger) |
| `GET /admin/clicker-fit-test` | Admin only: the fit-test plate (3MF), streamed, `private, no-store` |
| `GET /admin/orders/[id]/waybill` | Admin page: the internal waybill (see [admin-guide.md](./admin-guide.md)) |

## Pages

Storefront: `/`, `/privacy`, `/terms`, `/products`, `/products/[slug]`, `/clicker`, `/cart`, `/checkout`, `/orders`,
`/orders/[orderNo]`, `/orders/[orderNo]/acknowledgment`, `/account`, `/consent`, `/sign-in`, `/privacy`.
Admin: `/admin`, `/admin/users`, `/admin/users/[id]`, `/admin/content`, `/admin/branding`, `/admin/colours`, `/admin/store`, `/admin/legal`, `/admin/products`, `/admin/products/new`, `/admin/products/[id]`,
`/admin/clicker-fit-test`, `/admin/orders`, `/admin/orders/[id]`, `/admin/orders/[id]/acknowledgment`, `/admin/orders/[id]/waybill`, `/admin/payments`, `/admin/reviews`.

## Caching

| Tag | Set by | Invalidated by |
|---|---|---|
| `products`, `product:<slug>` | `listPublishedProducts`, `getProductBySlug` | product / option actions |
| `reviews:<productId>` | `getProductReviews` | review submit + moderate |
| `site:home` | `getHomeContent` (landing page) | `saveHomeContentAction`, `resetHomeContentAction` |
| `site:shipping` | `getShippingConfig` (checkout, the rates page, the cart and the AI summary) | `saveShippingConfigAction`, `resetShippingConfigAction` |
| `site:colours` | `getColourInventory`, and `getProductBySlug` (the storefront product page) | `saveColourInventoryAction`, `resetColourInventoryAction` (which also expire `products`) |
| `site:brand` | `getBranding` (logos, favicon, share image) | `saveBrandingAction`, `resetBrandingAction` |
| `site:info` | `getSiteInfo` (footer) | `saveSiteInfoAction`, `resetSiteInfoAction` |
| `site:legal:privacy`, `site:legal:terms` | `getLegal`, `getPrivacyVersion` | `saveLegalAction`, `resetLegalAction` |

Admin Server Actions use `updateTag(tag)` (expires immediately, so a deleted/unpublished item never lingers as a dead link). Customer review submission and anything where a slightly stale page is fine uses `revalidateTag(tag, "max")` (stale-while-revalidate). Route Handlers can't call `updateTag`; `/api/revalidate` uses `revalidateTag(tag, { expire: 0 })`.

Last updated: 2026-11-17


## Workshop Server Actions (admin only, all return `{ ok: true, ... }` or `{ ok: false, error }`, never throw)

| Action | File | What it does |
|---|---|---|
| `saveEstimateAction`, `updateEstimateAction`, `deleteEstimateAction` | `(admin)/admin/estimator/actions.ts` | Save, update and delete a saved estimate (job snapshot, 3 tiers, cost, chosen price, tags) |
| `listEstimatesAction` | same | The estimates (optionally only those with every given tag) and the tags in use |
| `createProductFromEstimateAction` | same | Create a DRAFT shop product from an estimate: costing saved, the chosen tier is its price |
| `applyEstimateToProductAction` | same | Put an estimate's costing (BOM + print cost) on an existing product; its price is left alone |
| `createPartAction`, `updatePartAction`, `deletePartAction` | `(admin)/admin/inventory/actions.ts` | Parts (optionally with first stock as one purchase lot); delete removes lots, history and BOM lines |
| `recordPurchaseAction`, `editPurchaseAction`, `voidPurchaseAction` | same | Purchase lots (edit = void + re-record in one transaction) |
| `adjustStockAction` | same | Manual correction: a +/- change or the real count; writes a ledger row with a reason |
| `listPurchasesAction`, `listMovementsAction` | same | A part's lots and recent ledger rows |
| `createSaleAction`, `updateSaleAction`, `deleteSaleAction` | `(admin)/admin/sales/actions.ts` | The off-site sales. Product name and cost come from the database; stock is used on Packaged / Delivered and given back on revert, cancel or delete |

Online orders also touch stock: `transitionOrder` (`src/lib/order-service.ts`) uses an order's BOMs when it enters `in_production` and gives them back on `cancelled` (see [order-lifecycle.md](./order-lifecycle.md)).
