# Darl Creates — Product Context

**Darl Creates** is a 3D-printing e-commerce platform for a Philippine micro-
business. Customers browse ready-to-print products, view them in 3D, customize
them (color / text / size / image), pay via **GCash with manual reference
verification**, and track orders. The owner (admin) controls the catalog,
customization schemas, order fulfilment, payment verification, shipping, and
sales analytics.

## Who it's for
- **Customers** — browse, 3D-view, customize, cart, GCash checkout, track, review.
- **Owner/Admin** (single, for launch) — products + customization schemas,
  STL/photo uploads, order management, payment verification queue, shipping,
  sales/revenue dashboard, review moderation.

## Phasing
- **Phase 1 (current):** catalog of standard, ready-to-print products. Admin
  uploads pre-made print-ready STLs; customers pick from predefined options.
- **Phase 2 (deferred, separate spec):** in-browser custom product generators
  (clicker / name keychain / ref magnet) that produce a real, downloadable,
  print-ready STL. Admin reviews/downloads before printing — never auto-fulfilled.

## Hard product rules
- **Money = integer centavos** (PHP). Never floats. Format via `lib/money.ts`.
- **Append-only** financial + audit records: `payments`, `order_status_history`.
- **Immutable snapshots**: cart/order items snapshot the chosen customization and
  price at the time; later catalog edits never mutate historical orders.
- **Manual GCash**: the system makes the owner's manual verification fast and
  auditable. No payment-gateway automation (yet).
- **Never mention tax or business-registration status anywhere** (site copy, legal pages, documents, emails, comments, docs). The owner does not want it discussed. The customer document is simply the "Order Acknowledgment".
- **Separation of duties**: payment verifier is recorded (`verifiedBy`), distinct
  from the paying customer.
- **Data Privacy Act (RA 10173)**: consent at signup, privacy policy, deletion path.

The spec (requirements / design / tasks) is the source of truth:
`.kiro/specs/darl-creates-ecommerce/`.
