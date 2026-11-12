# Roadmap & Gap Tracker

The single place to track what is missing, risky, or planned. Every item has an
ID so commits/PRs can reference it (`fixes G-07`). When an item is done, move it
to **Resolved** with the date and commit. Keep `Last updated` current.

**Severity:** 🔴 blocks launch/real use · 🟠 should fix before launch · 🟡 polish / later
**Status:** ⬜ open · 🚧 in progress · ✅ resolved

Last updated: 2026-11-11 (name-on-model: G-79 to G-96)

---

## A. Gaps found in the Phase 1 MVP

Verified against the code on 2026-11-09 (not from memory).

### Blocking real use

| ID | Sev | Gap | Detail / fix | Status |
|---|---|---|---|---|
| G-05 | 🔴 | **Google OAuth credentials not set** | `.env.local` has empty `GOOGLE_CLIENT_ID/SECRET`; nobody can sign in. Owner is adding these. Redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google`. | 🚧 creds set; sign-in not yet verified |

### Correctness / security — fix before launch

| ID | Sev | Gap | Detail / fix | Status |
|---|---|---|---|---|
| G-13 | 🟠 | **Seeded DB password was shown in chat/terminal output** | The `darlcreates` DB role password was generated in-session and echoed. Rotate it and store in Bitwarden. | ⬜ |
| G-14 | 🟠 | **No real UI/browser testing yet** | Build, typecheck and 3 scripts pass, and unauthenticated pages were curl-checked. The authenticated customer flow, admin flow and 3D viewer with a real STL have **not** been exercised in a browser. Planned right after G-05/G-06. | ⬜ next |

### Found while choosing the logo

| ID | Sev | Gap | Detail |
|---|---|---|---|
| G-30 | 🟡 | **Dark mode does not exist** | `next-themes` is installed and `.dark` tokens are defined in `globals.css`, but nothing sets the `.dark` class (no ThemeProvider, no toggle, no `prefers-color-scheme` handling), so every `dark:` style is inert. The white-wordmark logo is wired and ready. Decide: ship light-only (delete the dark tokens) or add a ThemeProvider + toggle. |

### Found while building uploads

| ID | Sev | Gap | Detail |
|---|---|---|---|
| G-26 | 🟠 | **Production origin missing from S3 CORS** | CORS lists only dev origins (localhost, 127.0.0.1, the Tailscale hostname). Add the production domain before launch or admin uploads fail there. |
| G-27 | 🟡 | **Orphaned S3 objects** | A file uploaded but never attached (admin closes the tab mid-way) stays in the bucket; replaced STLs are kept on purpose (orders reference them). Add a periodic sweep of unreferenced `stl/`/`photos/` keys. |
| G-28 | 🟡 | **App S3 key has no rotation plan** | `darlcreates-app` access key lives in `.env.local`. Store in Bitwarden; rotate periodically. |

### Found while adding 3MF

| ID | Sev | Gap | Detail |
|---|---|---|---|
| G-35 | 🟡 | **3MF verified with one real Bambu Studio export; richer files untested** | The real `Outdoor_Version_mit_Handyhülle` Bambu project (geometry in a separate `3D/Objects/object_3.model`, single filament, no color data) loads and renders. NOT yet tested: Bambu/Prusa files with **multiple filaments or painted regions** (colors live in vendor metadata, which three's loader ignores, so those parts show gray/white), and Cura exports. If a multi-color file previews gray, that is the cause. |
| G-36 | 🟡 | **Per-part color override** | A 3MF part with no color takes the customer's swatch; parts with colors never change. If a product needs the *customer* to recolor a colored part (e.g. the name), that needs part naming + a mapping on the product (ties into F-17). |

### Found while adding customer uploads

| ID | Sev | Gap | Detail |
|---|---|---|---|
| G-40 | 🟡 | **Customer uploads live forever** | `customer/<userId>/` objects are only deleted by the account-deletion flow. Abandoned uploads (never added to a cart) accumulate. Needs a sweep (e.g. delete objects older than N days that no cart/order references). Same family as G-27. |
| G-41 | 🟡 | **Image rate limit is per-instance memory** | Fine for one server; on serverless each instance counts separately. Move to a DB/Redis counter before scaling. |
| G-42 | 🟡 | **No image moderation** | Customers can upload anything that is a valid JPG/PNG/WebP. The admin sees it before printing (nothing auto-prints), but there is no automated screening. |

### Found while adding privacy tools

| ID | Sev | Gap | Detail |
|---|---|---|---|
| G-44 | 🟡 | **Deleted accounts block re-registration with the same Google account?** | Deletion removes the linked Google `accounts` row, so signing in again creates a *new* user (fresh consent). Intended, but untested end to end because it needs a real Google login. |
| G-45 | 🟡 | **Export is JSON only, no admin-side "export for a customer"** | Customers self-serve. If someone emails a request instead, there is no admin button yet. |

### Found during the documentation pass

| ID | Sev | Gap | Detail |
|---|---|---|---|
| G-65 | 🟠 | **No security headers** | `next.config.ts` sets no Content-Security-Policy, frame-ancestors / `X-Frame-Options`, `Referrer-Policy` or `Permissions-Policy`. Add them before launch; the CSP must allow the S3 origin for image and model loads and uploads. See [security.md](./security.md). |
| G-66 | 🟡 | **Admin has no second factor of its own** | Admin access relies on the owner's Google account. Turn on Google 2-step verification. One admin; roles change only through `scripts/make-admin.ts`. |
| G-67 | 🟠 | **No scheduled database backup and no error monitoring** | Take a manual `pg_dump` before risky migrations ([operations.md](./operations.md)). Schedule a dump and add error reporting (F-15). |
| G-68 | 🟡 | **A removed product's URL returns HTTP 200** | The page shows the branded 404 and is `noindex`, but the status code is 200 because the product lookup happens inside a Suspense boundary after the response has started. Calling `notFound()` from `generateMetadata` too (added with the SEO work) did not change the status in a production build. Fixing it needs the lookup before streaming (or a redirect). Low SEO risk while `noindex` stays. |

### Found during the growth batch

| ID | Sev | Gap | Detail |
|---|---|---|---|
| G-75 | 🟠 | **Shipping is still a flat ₱80** | Most orders are over- or under-charged. Research and a build plan are in [shipping-research.md](./shipping-research.md) (F-05). Needs the owner's answers first. |
| G-76 | 🟡 | **No push notifications or offline ordering in the PWA** | Deliberate (D-37). Order-status push would need a subscription table and VAPID keys. |
| G-77 | 🟡 | **Search and AI visibility needs content, not just markup** | The markup is in place; ranking depends on good product names and descriptions, the FAQ, photos with alt text, reviews, and submitting `sitemap.xml` to Google Search Console / Bing. Owner task. |
| G-78 | 🟡 | **Waybill is one order at a time** | No "print all ready-to-ship" batch page yet. Easy to add if the volume needs it. |

### Found while building the name-on-model proof of concept

| ID | Sev | Gap | Detail |
|---|---|---|---|
| G-79 | ✅ 2026-11-11 | **Name hanging off the surface** | Fixed at save time: nine ray samples over the widest name, with a suggested width (`checkFit`, `widestThatFits`). Not re-checked per order. See [name-on-model.md](./name-on-model.md) |
| G-80 | 🟠 | **Slot is not snapshotted per order** | The print file uses the product's current slot, so moving the slot later changes old orders' files. Fix: copy slot + font to the order item at placement (immutable snapshot rule) |
| G-81 | 🟠 | **3MF print file not yet confirmed in a real slicer** | 3MF products now take a name (Outdoor Phone Stand is live with one). The output is well-formed and loads in `trimesh` with the name in the right place, but has not been opened in Bambu Studio / Orca. Plain-mesh 3MFs and several plate objects are refused |
| G-82 | 🟡 | **Raised text only** | Engraving needs CSG (for example `manifold-3d`) |
| G-83 | 🟡 | **No moderation or per-character price for names** | Same as the earlier personalization questions |
| G-84 | 🟡 | **Print report not shown to the admin** | Width, thinnest stroke and watertight result are computed but only returned by `buildPrintFile` |
| G-85 | 🟡 | **Flat surfaces only** | The name is a flat sheet on one plane; curved faces need wrapping |
| G-86 | 🟠 | **Large models are slow in the browser** | The v2 stand (523k triangles, 44 MB of XML) takes about 12 s and 166 MB of heap to show in dev. Use a lighter preview model (decimated copy or a separate display file) for the product page; keep the full model for the print file |
| G-87 | ✅ 2026-11-11 | **Text-element detection wired to upload** | `attachModelAction` → `autoConfigureModel`: slot, cleaned model, Colors from filaments, fonts offered. Tested (`test-model-autoconfig.ts`) and run with the real v2 file |
| G-91 | ✅ 2026-11-11 | **Script font names overflowed the model** | The fit check covered only a width × capital-height band; descenders and loops of some fonts/names went past the surface. Fixed with an ink-box rectangle (`maxHeight`), see D-41 |
| G-88 | ✅ 2026-11-11 | **Customer-chosen name colour** | `nameColors` on the slot, picker on the product page, preview, order summary and filament assignment in the 3MF. See D-42 |
| G-92 | ✅ 2026-11-11 | **Admin could enter sizes that overflow the model** | Inputs are limited to the measured room at the spot (`measureNameSpaceAction`); save still checks |
| G-89 | ✅ 2026-11-11 | **Engraved (negative part) names** | Detected from a Bambu negative text, saved as `mode: engraved`, added to the print file as a negative part, wall check, dark decal preview (D-43). Marker-part detection for other slicers is still not built (G-93) |
| G-93 | 🟡 | **No marker-part detection for slicers other than Bambu/Orca text** | Only the Bambu text element is read. Other slicers: the admin clicks the spot |
| G-94 | 🟡 | **Print files not opened in a slicer yet** | The engraved preview is now a stencil-carved recess (D-43). Open a downloaded engraved 3MF in Bambu Studio once before the first real order |
| G-95 | 🟡 | **Part colours follow the product's current options (like G-80)** | `filamentAssignments` reads the option values by id at download time; deleting a colour value later breaks old orders' colours. Snapshot with G-80 |
| ✅ | 2026-11-12 | **Painted areas (outline) get their own colour option, detected on upload** | D-45. Decoded `paint_color`, preview helpers, `recolorPaint` for printing. Tests in `test-name-mesh.ts`, `test-model-autoconfig.ts` |
| G-96 | 🟡 | **Painted-area preview is dense** | A finely painted outline is tens of thousands of triangles; a lighter preview model (G-86) would help. Only Bambu/Orca/PrusaSlicer paint attributes are read |
| ✅ | 2026-11-11 | **Multiple names per order; multi-colour base** | D-44 / D-43. Tests: `test-multi-name-cart.ts`, `test-name-mesh.ts`, `test-model-autoconfig.ts` |
| G-90 | 🟡 | **No admin upload of custom fonts** | Fonts are files in `public/fonts`. `opentype.js` cannot read every font (Bangers failed on its GSUB table) |

### Missing from the spec (planned, not built)

| ID | Sev | Gap | Spec ref | Status |
|---|---|---|---|---|
| G-17 | 🟡 | Review photos + reviewer name (`review_photos` unused; `authorName` never populated) | FR-9.1 | ⬜ |
| G-19 | 🟡 | Option/photo **reordering**, option **edit**, option-value **delete** in schema builder (add + delete-option only) | FR-2.5 | ⬜ |
| G-21 | 🟡 | Per-value STL/scale override for size options (column exists, unused) | FR-2.4 | ⬜ |
| G-22 | 🟡 | Accessibility audit (contrast of accent-on-primary pairs, keyboard walk-through, 3D viewer a11y) | NFR-4 | ⬜ |
| G-23 | 🟡 | SMTP not configured — emails only log to console | FR-8.2 | ⬜ |
| G-25 | 🟡 | Spec `tasks.md` checkboxes never updated | — | ✅ 2026-11-09 |

### Tech debt / small things

| ID | Sev | Item |
|---|---|---|
| T-03 | 🟡 | `scripts/seed.ts` deletes sample products by slug; will fail once real orders reference them (`order_items` FK is `restrict`). Fine for dev, never run against prod. |
| T-04 | 🟡 | `getProductById` is uncached by design (used in actions); catalog list/detail are cached. Watch for N+1 queries in `assembleProduct` / `listPublishedProducts` as catalog grows. |
| T-05 | 🟡 | Primary pair verified (5.03:1 light, 9.4:1 dark). **Still unchecked:** the hero's lime "We'll print it." on the blue is 3.81:1 (passes only as large bold text); muted-foreground, badges, and the lime accent buttons have not been measured. Full audit = G-22. |
| T-06 | 🟡 | `.env.example` GCash number was taken from the owner profile — **confirm it is the business GCash number** before showing customers. |
| T-09 | 🟡 | **Review the default Privacy Policy and Terms and Conditions text** (Admin → Legal pages) with a lawyer or your accountant. The Terms are a draft written for this business (made-to-order, GCash, cancellations, damaged items). | ⬜ |
| T-07 | 🟡 | `npm audit` reports 12 moderate vulnerabilities (transitive). Review before launch. |

---

## B. Next steps (agreed order)

1. **Document everything** — this folder. ✅
2. **Owner: set Google OAuth creds** in `.env.local` (G-05) — done, sign-in to be verified.
3. **Create S3 bucket** (G-06) — ✅ done 2026-11-09, with request-time signed reads (G-03).
4. **Build the upload path** (G-01, G-02) — ✅ done 2026-11-09.
5. **Browser-test the UI** end to end (G-14): customer flow, admin flow, 3D viewer with a real STL; `make-admin` after first sign-in.
6. Fix the 🟠 correctness items (G-07 … G-13).
7. Choose production hosting + DB (G-04).
8. Phase 2 (see below).

---

## C. Future improvements (post-launch ideas)

| ID | Idea | Notes |
|---|---|---|
| F-01 | **Phase 2 — STL generators** | See [phase-2-generators.md](./phase-2-generators.md). The headline feature. |
| F-02 | Automated payment (Maya / GCash API) | Removes manual verification; needs a payment-provider merchant account. Schema already stores method + reference. |
| F-04 | Courier API (J&T, LBC, Lalamove) | Live rates + label creation + tracking webhooks. |
| F-05 | Region-based shipping table | Replace flat ₱80. Config-driven, per province/zone. **Researched 2026-11-11: [shipping-research.md](./shipping-research.md)** (own zone × weight rate table, pickup option, manual courier booking; owner questions listed there). |
| F-06 | Discount codes / bundles | Keychain multi-packs, event giveaways. |
| F-07 | Bulk / corporate quote requests | Giveaways and events are a natural fit for 3D-printed keychains. |
| F-08 | Print-queue / production board | Kanban of `in_production` orders, filament usage, print-time estimates. |
| F-09 | Filament inventory | Track spools per color; block out-of-stock colors in the customizer. |
| F-10 | Multiple admins / roles | Staff accounts with limited permissions (currently single owner). |
| F-11 | Order-status SMS / Messenger notifications | PH customers live in Messenger/SMS more than email. |
| F-12 | Customer-uploaded STL printing service | Separate "upload your own model" flow with manual quote. |
| F-13 | Multi-color / AMS-aware preview | Per-part colors in the 3D viewer. |
| F-14 | Analytics & SEO | Product schema.org markup, sitemap, OG images, GA/Clarity (as on darl.dev). |
| F-15 | Backups & observability | Scheduled `pg_dump` of the `darlcreates` DB, Sentry/GlitchTip for errors. |

---

## C2. Candidate features (raised 2026-11-10, not yet decided)

| ID | Idea | Notes |
|---|---|---|
| F-16 | **3MF as personalized-order output** | Upload + preview of 3MF is done (see Resolved F-16a). Still open: *generating* a 3MF per personalized order (base + name as separate parts). Depends on F-17. |
| F-17 | **Personalize an existing product** (e.g. add a name to a stand/holder). **Proof of concept built 2026-11-11: [name-on-model.md](./name-on-model.md)** (G-79 to G-85 are what is left) | Distinct from Phase 2 generators. Staged plan in `docs/personalization-and-3mf.md`: owner adds name manually -> live 3D name preview -> auto-generated print file (3MF, name as a separate part). Needs owner answers (emboss vs engrave, same color or not, which products first). |

## D. Resolved

| ID | Resolved | Notes |
|---|---|---|
| G-25 | 2026-11-09 | `tasks.md` updated with real status. |
| G-01 | 2026-11-09 | Admin STL/photo upload: `POST /api/uploads/presign` (admin-only, validated, content-type signed) + `ProductFiles` UI; `attachStlAction` verifies the object exists via HEAD. Test: `scripts/test-uploads.ts`. |
| G-02 | 2026-11-09 | `addPhotoAction` / `deletePhotoAction` + photo grid in the product editor. |
| G-03 | 2026-11-09 | Chose request-time signing (no CloudFront). Cached pages embed stable `/api/files/<key>` URLs; that route signs a fresh 5-min S3 URL per request, only for published products' files (or any `photos/`/`stl/` for admins). See decisions D-14. |
| G-06 | 2026-11-09 | Bucket `darlcreates-uploads` (ap-south-1, acct 551892774595): all public access blocked, SSE-S3, BucketOwnerEnforced, CORS for localhost:3000/3001, abort-multipart lifecycle. IAM user `darlcreates-app` with an inline policy limited to this bucket; key stored in `.env.local`. Verified allowed on the bucket, AccessDenied on other buckets / list-buckets / IAM. |
| G-24 | 2026-11-10 | Real logo applied (header, admin, sign-in, favicon/apple-icon) from `brand/source/`; theme primary changed from magenta to cyan-blue (`oklch(0.52 0.14 225)`, white-on-primary 5.03:1). Built by `scripts/build-brand-assets.py`. |
| G-29 | 2026-11-10 | Dev-server `new Date()` blocking-route error: `getCurrentUser()` now calls `await connection()` first (decision D-16). Production build was unaffected; the dev check needs confirming on your side. |
| T-08 | 2026-11-10 | Designer supplied black and white wordmark logos; wired via `BrandLogo` (replaces the CSS-invert workaround). |
| G-31 | 2026-11-10 | Admin "Instant" dev error on `/admin/products/[id]`: a layout's `instant = false` does **not** cover its child pages. First fix covered only pages reading params; the same error then appeared on `/admin/products` because **any** uncached read triggers it. Now every admin page that awaits data has its own `export const instant = false`, and `scripts/test-instant.ts` fails if one is missing. Rule: any page reading uncached data or params outside Suspense needs its own opt-out or a Suspense boundary. |
| G-32 | 2026-11-10 | Admin STL upload failed in the browser (nothing reached S3): bucket CORS allowed only `localhost:3000/3001`, so the PUT was blocked from `127.0.0.1` / the Tailscale hostname. Added those origins; new `scripts/test-cors.ts`; the upload UI now explains a CORS failure instead of "Failed to fetch". |
| G-33 | 2026-11-10 | STL preview unusable for off-origin files (Outdoor Phone Stand exported at the bed middle, center 128,128,15, ~182 mm from origin). Auto-rotate spun the mesh around its own origin, so the model swung off-screen, and zoom limits were fixed numbers. Rebuilt viewer: geometry centered on its bounding box, camera/clip/zoom derived from model size, auto-rotate orbits the camera and stops on touch, pan enabled, Reset view button + double-click. Default elevation 10° (centering degrades with elevation; measured). Tests: `scripts/test-viewer-framing.ts` (synthetic + real files), verified in a real browser (drag/zoom/reset). |
| G-34 | 2026-11-10 | `/products/[slug]` threw the dev "Instant" error for any product created after build (`await params` outside Suspense). `params` now read inside a Suspense-wrapped component with a skeleton. `scripts/test-instant.ts` now covers every page, not just admin. Also T-01 (viewer tidy-up) and a plain `<a>` -> `<Link>`. |
| F-16a | 2026-11-10 | **3MF upload + preview.** Admin can upload `.stl` or `.3mf` (max 50 MB). New uploads go under `models/` (old `stl/` keys still valid; DB column stays `stl_key`). 3MF is verified to be a real ZIP (first-bytes check) before attaching. Viewer loads 3MF with three's `3MFLoader`, keeps colors embedded in the file and applies the customer's swatch only to parts with no color. Tested: `test-uploads.ts`, `test-viewer-framing.ts` (multi-part), and a real-browser render of a generated two-part 3MF (`scripts/fixtures/base-plus-name.3mf`). **Not yet tested with a real slicer-exported 3MF.** |
| G-37 | 2026-11-10 | Customer color selection on 3MF verified end to end on the real Bambu file: before selecting = neutral gray, then Green/Blue/Red measured hue 145°/219°/357° on the rendered model (headless browser, real clicks). The file has no color data, so the swatch paints the whole model. Note: the **Outdoor Phone Stand product has no Color option yet**, which is why it showed no color choices. |
| G-07 | 2026-11-10 | Payment amount is no longer taken from the browser: `submitGcashReference` stores the order total from the DB. A DB check also requires `payment.amount == order.total` at verify time. |
| G-08 | 2026-11-10 | Shipping fee defined once in `src/lib/shipping.ts`; checkout display and order placement both use it. |
| G-12 | 2026-11-10 | Sign-in from "Add to cart" returns to the product page you were on. New `safeRedirect()` rejects off-site / protocol-relative / `javascript:` targets (open-redirect guard). |
| G-15 | 2026-11-10 | Order logic moved to `src/lib/order-service.ts` (no framework imports); Server Actions are thin wrappers. `scripts/test-checkout.ts` exercises the real functions against the live DB (53 checks). |
| T-02 | 2026-11-10 | Order numbers: crypto RNG, 6 unambiguous chars, PH business date, unique-violation retry. |
| G-38 | 2026-11-10 | **Race conditions fixed.** Verify/reject/transition now run in one transaction with row locks (`FOR UPDATE`): 3 concurrent verifies => exactly 1 succeeds; 2 conflicting transitions => exactly 1 applies. |
| G-39 | 2026-11-10 | **Money-integrity holes closed.** (a) a payment on a cancelled/refunded order can no longer be verified into 'paid' (must be rejected); (b) the same GCash reference cannot back two live payments (unique partial index, references normalized: trimmed/upper-cased); (c) one pending payment per order (unique partial index); (d) 'paid' can only be reached by verifying a payment, never by hand; (e) dashboard revenue excludes cancelled/refunded orders. |
| G-09 | 2026-11-10 | **Customer image personalization.** Products can have an `image` option; signed-in customers upload JPG/PNG/WebP (max 5 MB) straight to S3 under `customer/<userId>/` (presign kind `customer`, rate-limited 30/h). On add-to-cart the server verifies ownership of the key, that the object exists and is within the limit, and the file's **magic bytes** (a non-image renamed `.png` is refused); a normalizer drops any field the product schema doesn't allow, so a crafted request can't attach someone else's file or a payment proof. Customer sees a thumbnail in cart/order; admin gets a preview + open link. `test-customer-images.ts` (34 checks). |
| G-10 | 2026-11-10 | **RA 10173 tools.** Privacy consent recorded with timestamp + policy version (`users.consent_at/consent_version`; the version is owner-controlled, see D-28); `requireUser` sends anyone without current consent to `/consent` (tick "ask again" in Admin → Legal pages to re-ask). `/account` has a JSON data export (right of access) and self-serve account deletion (anonymizes the person, removes sessions/addresses/cart/reviews/uploaded images; keeps order + payment rows; refused while an order is in progress). `test-privacy.ts` (36 checks). **Owner/legal review needed on the retention choice, see D-22.** |
| G-11 | 2026-11-10 | **Order Acknowledgment** at `/orders/[orderNo]/acknowledgment` (owner only) and `/admin/orders/[id]/acknowledgment`: printable / Save-as-PDF order confirmation. `test-acknowledgment.ts` guards the content and that it never mentions tax or registration status. |
| G-16 | 2026-11-10 | **Address book.** Checkout offers saved addresses and a "save this address" box (max 10, no duplicates, first is default); `/account` lists, sets default, deletes. |
| G-20 | 2026-11-10 | **Shop search + category filter.** Client-side (`ProductBrowser` + pure `product-filter.ts`): every word must match name/description/category, accent- and case-insensitive; category chips with counts; empty state with Clear filters. Done client-side on purpose so the listing stays static (no `searchParams`). Revisit server-side search past a few hundred products. `test-product-filter.ts` (23 checks). |
| G-46 | 2026-11-10 | **Unlinked form labels in the admin** (10 label/input pairs: shipping carrier + tracking, product status, schema builder). Screen readers would not announce them and clicking the label didn't focus the field. Found by the browser E2E (`getByLabel` failed). Fixed with `useId` + `htmlFor`/`id`; `scripts/test-a11y-labels.ts` now guards it. |
| G-47 | 2026-11-10 | Order Acknowledgment's title was a styled paragraph and the business name was the page's only `<h1>`. The document title is now the `<h1>`; test asserts exactly one. |
| G-48 | 2026-11-10 | Full test cycle executed (see `docs/testing.md`): authenticated browser E2E for the customer journey (customize + real image upload -> cart -> checkout -> order -> GCash reference), admin (verify -> production -> shipping -> delivered), review gating, consent gate, account export + deletion, access control. |
| G-43 | 2026-11-10 | Retention choice (keep anonymized order + payment rows after account deletion) **approved by owner**. |
| G-11b | 2026-11-10 | Order Acknowledgment wording **approved by owner**. |
| G-04 | 2026-11-10 | Hosting: owner serves the app publicly via **Tailscale Funnel** (works, incl. Google sign-in). Caveat: it must run a production build (`npm run build && npm run start`), not `next dev`. Database stays on the agent-server (reachable from this Mac). |
| G-18 | 2026-11-10 | **Dashboard time series.** Admin dashboard has a 30-day verified-revenue chart (pure CSS bars + a screen-reader table), stat cards, needs-attention strip, top products and recent orders. |
| G-49 | 2026-11-10 | **Admin + customer redesign.** One inset-sidebar shell (`InsetShell`): compact for admin, comfortable for customers (`(portal)` group: `/orders`, `/orders/[orderNo]`, acknowledgment, `/account`). Square tables. See D-24. |
| G-50 | 2026-11-10 | **Landing-page CMS** at `/admin/content`: announcement bar, hero (+ optional image), highlights, featured products, FAQ, CTA band, site-wide footer. See D-25. `test-content.ts` (53 checks). |
| G-51 | 2026-11-10 | **Customer workflow.** Cart-count badge, add-to-cart toast with "Go to cart", customizer choices survive the sign-in redirect, checkout steps, order progress bar, copy buttons for the GCash number/amount, customer cancel of an unpaid order, Buy again, review prompt on delivered orders. `test-customer-orders.ts` (21 checks). |
| G-52 | 2026-11-10 | "Top products" counted items from cancelled/refunded orders; now excluded. |
| G-53 | 2026-11-10 | **Store footer + editable legal pages.** Footer on every storefront page (about, contact details, hours, explore + social links, Privacy and Terms links) managed in Admin → Store & footer. Privacy Policy and new Terms and Conditions (`/terms`) edited in Admin → Legal pages with a live preview; the privacy version is now owner-controlled (D-28). Test: `test-content.ts` (now 87+ checks incl. consent-version rules). |
| G-54 | 2026-11-10 | **Mobile fixes.** Checked every page at 375 and 320 px. Fixed: checkout steps overflowed, Order Acknowledgment was cut off on the right, tables hid actions off-screen (now stacked cards, D-29), breadcrumbs crowded, cart Remove button overflowed at 320. Also fixed a parser bug found on mobile: a legal heading followed directly by text was rendered as one huge heading. |
| G-55 | 2026-11-10 | Dashboard stat cards are now the same height (every card has a hint line and fills its grid cell). |
| G-56 | 2026-11-10 | **Legal pages editor redesigned** (tabs, Write/Preview, toolbar, link dialog, dirty guard, acceptance stats). See D-31. |
| G-57 | 2026-11-10 | **Logo upload for every place a logo is used** (`/admin/branding`, six slots with size/format rules, previews). Replaced the fixed brand files with owner-uploadable ones; SVG intentionally not accepted. See D-30. `test-branding.ts` (67 checks incl. live S3). |
| G-58 | 2026-11-10 | **Demo seed + design review with real volume** (`scripts/seed-demo.ts`, `test-data-integrity.ts`). Found and fixed: the dashboard revenue figure was clipped (number now scales with its card), a hidden chart table stretched the page by 180 px, the admin orders list had no search/pagination/customer column (72 rows = one 3,500 px page), the "3D model" header wrapped, categories differing only in case were separate chips (now normalized), product-card prices floated at different heights, the product page's price label sat low, the activity log repeated "Order placed · Order placed", customer order numbers wrapped mid-number, and the product page overflowed by 8 px at 320 px. |
| G-59 | 2026-11-10 | **404 pages with broken colours.** Next's default 404 forced black/white body and text colours (and a dark variant), hiding the footer text. Branded `not-found.tsx` in every route group + `color-scheme: light`. |
| G-60 | 2026-11-10 | **Deleted product still listed (then 404 when clicked).** Test tooling deleted a product straight from the DB, so the cached shop listing outlived it; admin removals were also only stale-while-revalidate. Fixed: scripts call a guarded `/api/revalidate`, admin actions use `updateTag`. Verified on the public URL. |
| G-61 | 2026-11-10 | **3D viewer loading animation** (spinning cube + status text + "still working" hint after 6 s) shown through both waits (library download, model download/parse) until the first frame paints. |
| G-62 | 2026-11-10 | **Hint text no longer shifts inputs** (shared `Field`: hint sits on the label row, truncated, wired with `aria-describedby`). |
| G-63 | 2026-11-10 | **All mentions of the store's tax/registration status removed** (default Privacy/Terms, Order Acknowledgment, code, docs, specs, steering files); `test-content.ts` scans all source to keep it out. Store description rewritten: "Your 3D printing partner". |
| G-64 | 2026-11-10 | **User management** (`/admin/users`): see D-33. `test-user-admin.ts` (71 checks). |
| G-69 | 2026-11-11 | **Documentation pass.** New: `configuration.md`, `operations.md`, `security.md`, `order-lifecycle.md`, `design-system.md`, `admin-guide.md`, `code-map.md`. Rewrote `architecture.md`; refreshed `setup.md`, `database.md`, `testing.md`, `features.md`, READMEs, steering and `.env.example`. Added file header comments. New guard `scripts/test-docs.ts` fails when code is added without being documented. |
| G-70 | 2026-11-11 | **Logo squeezed on phones.** The header logo now keeps its natural width (`shrink-0`); on phones Shop becomes an icon and My Orders / Admin move into the account menu. Checked at 320 to 640 px signed in and out. |
| G-71 | 2026-11-11 | **Add to cart lost the customer's work when sign-in or privacy consent was missing.** The action now returns what is needed instead of redirecting; the product page keeps the choices and finishes the add after sign-in / consent. See D-35. Checked in a browser: signed out → sign-in → consent → added, and consent only. |
| G-72 | 2026-11-11 | **Internal waybill** at `/admin/orders/[id]/waybill` (A6, Code 128 barcode, ship-to, pack list, tick boxes, "do not ship" warning when unpaid). `test-waybill.ts`; barcode decoded back by Chromium's `BarcodeDetector`. See D-36. |
| G-73 | 2026-11-11 | **PWA.** Manifest, icons (incl. maskable), theme colour, service worker with offline page, footer install link. Verified in a production build: worker active, assets cached, offline navigation shows `/offline.html`. See D-37. |
| G-74 | 2026-11-11 | **SEO and answer-engine metadata.** Per-page titles, descriptions, canonical, Open Graph; schema.org Organization / WebSite / FAQPage / Product / BreadcrumbList / ItemList; `sitemap.xml`, `robots.txt` (AI crawlers allowed on public pages), `/llms.txt`; private pages `noindex`; owner-editable search title and description. `test-seo.ts`. See D-38. |
