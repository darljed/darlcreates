# Roadmap & Gap Tracker

The single place to track what is missing, risky, or planned. Every item has an
ID so commits/PRs can reference it (`fixes G-07`). When an item is done, move it
to **Resolved** with the date and commit. Keep `Last updated` current.

**Severity:** 🔴 blocks launch/real use · 🟠 should fix before launch · 🟡 polish / later
**Status:** ⬜ open · 🚧 in progress · ✅ resolved

Last updated: 2026-11-09 (S3 + uploads)

---

## A. Gaps found in the Phase 1 MVP

Verified against the code on 2026-11-09 (not from memory).

### Blocking real use

| ID | Sev | Gap | Detail / fix | Status |
|---|---|---|---|---|
| G-04 | 🔴 | **Production cannot reach the database** | DB is on the agent-server, Tailscale-only (`100.90.200.13`). A Vercel/Amplify deploy cannot connect. Also `next build` queries the DB (`generateStaticParams`), so CI/Vercel builds fail without access. Fix: choose prod DB (RDS / Supabase / exposed pooler), and decide whether build-time DB access is acceptable. | ⬜ |
| G-05 | 🔴 | **Google OAuth credentials not set** | `.env.local` has empty `GOOGLE_CLIENT_ID/SECRET`; nobody can sign in. Owner is adding these. Redirect URI: `{BETTER_AUTH_URL}/api/auth/callback/google`. | 🚧 creds set; sign-in not yet verified |

### Correctness / security — fix before launch

| ID | Sev | Gap | Detail / fix | Status |
|---|---|---|---|---|
| G-07 | 🟠 | **Payment amount is client-supplied** | `submitPaymentAction` stores the `amount` the browser sends. Server should use the order's `totalCents` (or reject a mismatch). Admin verifies manually, but the recorded figure must not be user-controlled. | ⬜ |
| G-08 | 🟠 | **Flat shipping fee defined twice** | `FLAT_SHIPPING_CENTS = 8000` is duplicated in `checkout/page.tsx` and `checkout/actions.ts`. Display and charge can drift. Move to one config module (also the first step toward region-based fees, F-05). | ⬜ |
| G-09 | 🟠 | **"Image" customization option is non-functional** | Customizer shows a placeholder sentence; `computeUnitPrice` requires an `imageKey` for image options, so a *required* image option makes the product un-addable. Needs customer upload flow (depends G-01) + server-side image validation (type/size/dimensions). | ⬜ |
| G-10 | 🟠 | **RA 10173 deletion path is email-only; no consent checkbox** | Privacy page tells users to email for deletion; sign-in shows a notice but no explicit consent capture/record. Spec FR-1.5 asks for explicit consent + a deletion path. Add consent timestamp on user + self-serve "delete my data" request. | ⬜ |
| G-11 | 🟠 | **No "Order Acknowledgment" document** | Spec FR-6.6 / task 11.2: printable non-BIR acknowledgment per order. Not built. (Schema already BIR-ready: `or_number`, `vat_cents`.) | ⬜ |
| G-12 | 🟠 | **Add-to-cart sign-in redirect loses the product** | `product-customizer.tsx` sends `/sign-in?redirect=/products`, not the current product page. Also confirm BetterAuth rejects off-site `callbackURL` values (open-redirect check). | ⬜ |
| G-13 | 🟠 | **Seeded DB password was shown in chat/terminal output** | The `darlcreates` DB role password was generated in-session and echoed. Rotate it and store in Bitwarden. | ⬜ |
| G-14 | 🟠 | **No real UI/browser testing yet** | Build, typecheck and 3 scripts pass, and unauthenticated pages were curl-checked. The authenticated customer flow, admin flow and 3D viewer with a real STL have **not** been exercised in a browser. Planned right after G-05/G-06. | ⬜ next |
| G-15 | 🟠 | **Tests don't call the real Server Actions** | `scripts/test-order-lifecycle.ts` re-creates the DB steps by hand; it validates the schema/rules, not `placeOrderAction` / `verifyPaymentAction` themselves. Refactor logic into callable service functions and test those. | ⬜ |

### Found while building uploads

| ID | Sev | Gap | Detail |
|---|---|---|---|
| G-26 | 🟠 | **Production origins missing from S3 CORS** | CORS allows only `localhost:3000/3001`. Add the production domain before launch or admin uploads fail there. |
| G-27 | 🟡 | **Orphaned S3 objects** | A file uploaded but never attached (admin closes the tab mid-way) stays in the bucket; replaced STLs are kept on purpose (orders reference them). Add a periodic sweep of unreferenced `stl/`/`photos/` keys. |
| G-28 | 🟡 | **App S3 key has no rotation plan** | `darlcreates-app` access key lives in `.env.local`. Store in Bitwarden; rotate periodically. |

### Missing from the spec (planned, not built)

| ID | Sev | Gap | Spec ref | Status |
|---|---|---|---|---|
| G-16 | 🟡 | Address book (`addresses` table unused; checkout re-types address every time) | FR-1.4 | ⬜ |
| G-17 | 🟡 | Review photos + reviewer name (`review_photos` unused; `authorName` never populated) | FR-9.1 | ⬜ |
| G-18 | 🟡 | Dashboard time-series chart (only totals + top products) | FR-10.1 | ⬜ |
| G-19 | 🟡 | Option/photo **reordering**, option **edit**, option-value **delete** in schema builder (add + delete-option only) | FR-2.5 | ⬜ |
| G-20 | 🟡 | Product search + category filtering (listing shows category chips only, non-interactive) | FR-3.1 | ⬜ |
| G-21 | 🟡 | Per-value STL/scale override for size options (column exists, unused) | FR-2.4 | ⬜ |
| G-22 | 🟡 | Accessibility audit (contrast of accent-on-primary pairs, keyboard walk-through, 3D viewer a11y) | NFR-4 | ⬜ |
| G-23 | 🟡 | SMTP not configured — emails only log to console | FR-8.2 | ⬜ |
| G-24 | 🟡 | Real logo + brand palette not applied (Drive folder blocked by macOS TCC) | task 11.4 | ⬜ |
| G-25 | 🟡 | Spec `tasks.md` checkboxes never updated | — | ✅ 2026-11-09 |

### Tech debt / small things

| ID | Sev | Item |
|---|---|---|
| T-01 | 🟡 | `stl-viewer.tsx` has a stray `export { Loader2 }` and an `import` mid-file (ErrorBoundary) — tidy. |
| T-02 | 🟡 | `generateOrderNo()` uses `Math.random()` (4 chars). Collisions are caught by the `UNIQUE` constraint but would surface as a 500. Use nanoid/retry. |
| T-03 | 🟡 | `scripts/seed.ts` deletes sample products by slug; will fail once real orders reference them (`order_items` FK is `restrict`). Fine for dev, never run against prod. |
| T-04 | 🟡 | `getProductById` is uncached by design (used in actions); catalog list/detail are cached. Watch for N+1 queries in `assembleProduct` / `listPublishedProducts` as catalog grows. |
| T-05 | 🟡 | Interim palette uses `oklch` tokens; verify AA contrast programmatically once real brand colors land. |
| T-06 | 🟡 | `.env.example` GCash number was taken from the owner profile — **confirm it is the business GCash number** before showing customers. |
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
| F-02 | Automated payment (Maya / GCash API) | Removes manual verification; needs business registration. Schema already stores method + reference. |
| F-03 | BIR registration switch-on | Populate `or_number` / `vat_cents`, issue Official Receipts, VAT math config-driven. Schema is ready. |
| F-04 | Courier API (J&T, LBC, Lalamove) | Live rates + label creation + tracking webhooks. |
| F-05 | Region-based shipping table | Replace flat ₱80. Config-driven, per province/zone. |
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

## D. Resolved

| ID | Resolved | Notes |
|---|---|---|
| G-25 | 2026-11-09 | `tasks.md` updated with real status. |
| G-01 | 2026-11-09 | Admin STL/photo upload: `POST /api/uploads/presign` (admin-only, validated, content-type signed) + `ProductFiles` UI; `attachStlAction` verifies the object exists via HEAD. Test: `scripts/test-uploads.ts`. |
| G-02 | 2026-11-09 | `addPhotoAction` / `deletePhotoAction` + photo grid in the product editor. |
| G-03 | 2026-11-09 | Chose request-time signing (no CloudFront). Cached pages embed stable `/api/files/<key>` URLs; that route signs a fresh 5-min S3 URL per request, only for published products' files (or any `photos/`/`stl/` for admins). See decisions D-14. |
| G-06 | 2026-11-09 | Bucket `darlcreates-uploads` (ap-south-1, acct 551892774595): all public access blocked, SSE-S3, BucketOwnerEnforced, CORS for localhost:3000/3001, abort-multipart lifecycle. IAM user `darlcreates-app` with an inline policy limited to this bucket; key stored in `.env.local`. Verified allowed on the bucket, AccessDenied on other buckets / list-buckets / IAM. |
