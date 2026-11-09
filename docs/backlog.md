# Backlog

## Phase 1 — in progress (see `.kiro/specs/darl-creates-ecommerce/tasks.md`)
Catalog of ready-to-print products: admin catalog + customization schema builder,
storefront browse + 3D viewer + customizer, cart + GCash checkout, payment
verification, order management + shipping, order tracking + notifications,
reviews, sales dashboard, compliance + a11y polish.

## Phase 2 — deferred (needs its own spec)
- **In-browser STL generators** (clicker / name keychain / ref magnet):
  parametric geometry → real, downloadable, **print-ready** STL. Must handle
  minimum wall thickness, solid keychain rings, overhang checks. Admin reviews +
  downloads before printing — never auto-fulfilled. Reference mechanic:
  vostoklabs Clicker-Generator (conceptual, not a dependency).

## Known gaps / follow-ups
- Google OAuth credentials not yet set (`.env.local`) — needed to sign in and
  exercise the authenticated + admin flows in the browser. After first sign-in,
  run `npx tsx scripts/make-admin.ts <email>` to become admin.
- S3 bucket `darlcreates-uploads` not yet created. Storage lib + presign route
  + admin STL-download route exist and degrade gracefully; product STL/photo
  keys are entered manually until the direct-upload UI lands.
- Real Darl Creates logo palette not yet applied — theme uses interim Vibrant
  Pop tokens (spec task 11.4). Logo folder blocked by macOS TCC permissions.
- Shipping fee is a flat ₱80 for v1; no courier API.
- DB password for the `darlcreates` role was generated during setup — it lives
  only in `.env.local` (gitignored). Rotate/store in Bitwarden as desired.
