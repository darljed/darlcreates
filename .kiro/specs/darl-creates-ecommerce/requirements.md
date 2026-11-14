# Requirements — Darl Creates E-Commerce

> 3D-printing e-commerce platform. Customers browse ready-to-print products,
> view them in 3D, customize them, pay via GCash (manual reference verification),
> and track orders. The owner (admin) controls products, customization schemas,
> order fulfilment, payment verification, shipping, and sales analytics.

## Glossary

- **Storefront** — the public, customer-facing surface.
- **Admin** — the owner-only control panel (RBAC-gated).
- **STL** — stereolithography mesh file; the 3D model that gets sliced and printed.
- **Customization schema** — per-product definition of what a customer may change
  (color, text, size, image), with constraints and price deltas.
- **Centavos** — money is stored as integer centavos (never floats).
- **Manual payment verification** — owner confirms a GCash reference number by hand.

## Phasing

- **Phase 1 (this spec's primary scope):** Catalog of standard, ready-to-print
  products. Admin uploads pre-made print-ready STLs + photos. Customers browse,
  view in 3D, pick from predefined customization options, add to cart, check out
  via GCash, and track orders. Admin verifies payments, manages orders, updates
  shipping, and sees sales analytics. Customers leave reviews.
- **Phase 2 (planned, out of scope for initial build):** In-browser custom
  product generators (clicker / name keychain / ref magnet) that generate a real,
  downloadable, print-ready STL from customer text/image input.

---

## Functional Requirements

### FR-1 Authentication & Accounts
- **FR-1.1** Users can sign up and log in with **Google OAuth** (BetterAuth).
- **FR-1.2** A user has a role: `customer` (default) or `admin`.
- **FR-1.3** Admin routes (`/admin/**`) and admin APIs are server-side RBAC-gated;
  a non-admin receives 403/redirect, never partial admin data.
- **FR-1.4** Customer profile stores name, email (from Google), and shipping
  addresses.
- **FR-1.5** Data Privacy Act (RA 10173): explicit consent at signup, a privacy
  policy, and the ability to request account/data deletion.

### FR-2 Product Catalog (Admin)
- **FR-2.1** Admin can create, edit, publish/unpublish, and archive products.
- **FR-2.2** A product has: name, slug, description, base price (centavos),
  category, actual photos (multiple), and a print-ready STL file.
- **FR-2.3** Admin uploads STL files and photos (stored in S3 via presigned URLs).
- **FR-2.4** Admin defines a **customization schema** per product: an ordered list
  of options, each typed as `color` | `text` | `size` | `image`, each with a
  label, required flag, price delta (centavos), and type-specific constraints:
  - `color`: enumerated swatches (label + hex + optional per-value price delta).
  - `text`: max length, allowed character set, optional font choices.
  - `size`: enumerated values (label + optional per-value price delta +
    optional STL/scale override).
  - `image`: allowed formats, max file size, min resolution.
- **FR-2.5** Admin can reorder options and reorder product photos.

### FR-3 Storefront Browsing & 3D Viewing
- **FR-3.1** Customers can browse published products by category and search.
- **FR-3.2** Product detail page shows photos + an interactive **3D STL viewer**
  (rotate, zoom, pan) rendered client-side.
- **FR-3.3** The 3D viewer is progressively enhanced: a photo/placeholder shows
  first; the mesh loads lazily; a failure to load never blocks purchase.
- **FR-3.4** Price updates live as the customer changes customization options.

### FR-4 Customization (Phase 1 — predefined options)
- **FR-4.1** Customers configure a product per its customization schema
  (choose color, type text within constraints, pick size, upload image).
- **FR-4.2** All inputs are validated against the schema client- and server-side
  (max length, allowed chars/formats/sizes).
- **FR-4.3** The chosen configuration + computed price is snapshotted immutably
  when added to cart and again when ordered.
- **FR-4.4** Uploaded customer images are stored securely in S3 and linked to the
  cart/order item.

### FR-5 Cart & Checkout
- **FR-5.1** Customers have a cart of configured items; quantity editable.
- **FR-5.2** Checkout collects shipping address and shipping method/fee.
- **FR-5.3** Order total = sum(item price snapshots × qty) + shipping, in centavos.
- **FR-5.4** On placing an order, the system creates an `order` in state
  `awaiting_payment` with an immutable snapshot of items, prices, and address.

### FR-6 Payment — GCash manual verification
- **FR-6.1** After placing an order, the customer sees GCash payment instructions
  (account name/number, exact amount) and the order reference.
- **FR-6.2** The customer submits the **GCash reference number** (and optional
  proof-of-payment screenshot) against the order.
- **FR-6.3** Admin sees a **payment verification queue** of submitted references.
- **FR-6.4** Admin can mark a payment `verified` or `rejected`, with a reason;
  the action is recorded with who/when (separation of duties / auditability).
- **FR-6.5** Verifying a payment advances the order to `paid`; rejecting returns
  it to `awaiting_payment` and notifies the customer.
- **FR-6.6** The document issued to the customer is an "Order Acknowledgment": what was ordered, the
  amounts and the delivery address. It never discusses tax or registration status.

### FR-7 Order Management & Fulfilment (Admin)
- **FR-7.1** Admin sees all orders with filter by status.
- **FR-7.2** Order lifecycle: `awaiting_payment` → `paid` → `in_production` →
  `ready_to_ship` → `shipped` → `delivered`; plus `cancelled` / `refunded`.
- **FR-7.3** Every status change is recorded in an **append-only** history
  (who, when, from→to, note).
- **FR-7.4** For each paid order item, admin can download the exact print-ready
  STL and view the customer's chosen customization + uploaded image.
- **FR-7.5** Admin records shipping: carrier, tracking number, and status.

### FR-8 Order Tracking (Customer)
- **FR-8.1** Customers see their order history and the live status of each order,
  including payment state, production/shipping status, and tracking number.
- **FR-8.2** Customers receive email notifications on key transitions
  (order placed, payment verified/rejected, shipped, delivered).

### FR-9 Reviews & Feedback
- **FR-9.1** After an order is `delivered`, the customer may review the purchased
  product(s): star rating + text + optional photos.
- **FR-9.2** Admin can approve/hide reviews (moderation).
- **FR-9.3** Approved reviews and aggregate rating show on the product page.

### FR-10 Sales / Revenue Dashboard (Admin)
- **FR-10.1** Admin dashboard shows revenue (verified-paid only), order counts by
  status, top products, and a time-series of sales.
- **FR-10.2** All monetary figures derived from the append-only order/payment
  ledger, in centavos, formatted as PHP (₱).

---

## Non-Functional Requirements

- **NFR-1 Money integrity:** all money is integer **centavos**; business math is
  config-driven; the order/payment ledger is **append-only** (no destructive
  edits to financial records).
- **NFR-2 Security:** server-side RBAC on every admin route/action; Zod validation
  at every trust boundary; presigned, scoped S3 uploads; no secrets in the client;
  separation of duties on payment verification.
- **NFR-3 Privacy (RA 10173):** consent capture, privacy policy, data-deletion
  path, least-privilege handling of PII and uploaded images.
- **NFR-4 Accessibility:** WCAG AA — keyboard navigation, focus states, color
  contrast (critical given the Vibrant Pop high-saturation palette), alt text,
  reduced-motion support for the 3D viewer and animations.
- **NFR-5 Responsive & production-ready:** mobile-first; the 3D viewer degrades
  gracefully on low-power devices.
- **NFR-6 Performance:** lazy-load the 3D mesh; defer heavy Three.js bundles;
  Core Web Vitals-conscious.
- **NFR-7 Design system:** "Vibrant Pop" visual direction — bold saturated
  accents, strong type hierarchy, generous spacing, energetic rounded shapes,
  playful hover/add-to-cart micro-interactions — implemented via shadcn/ui themed
  with CSS variables. Adapt the principles; do not copy the reference brand.
- **NFR-8 Auditability:** order status history and payment actions are append-only
  and attributable to a user.

---

## Out of Scope (initial build)
- Phase 2 in-browser STL generators.
- Automated payment gateways (Maya/GCash API) — manual only for now.
- Multi-currency (PHP only).
- Multiple admins / granular admin permissions (single owner-admin for now).

---

## Open Questions / Assumptions
- **A-1** Single admin (the owner) for launch; multi-admin deferred.
- **A-2** PHP currency only.
- **A-3** Shipping fee is entered/looked up manually per order region for v1
  (flat or table-based); no courier API integration yet.
- **A-4** Brand assets (logo, exact palette) come from the Darl Creates logo
  files once accessible; Vibrant Pop theme uses interim tokens until then.
