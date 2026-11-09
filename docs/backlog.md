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
- Google OAuth credentials not yet set (`.env.local`).
- `darlcreates` DB not yet created on the agent-server (blocked on Tailscale).
- S3 bucket `darlcreates-uploads` not yet created (do when upload work starts).
- Real Darl Creates logo palette not yet applied — theme uses interim Vibrant
  Pop tokens (spec task 11.4).
- Shipping fee is manual/flat for v1; no courier API.
