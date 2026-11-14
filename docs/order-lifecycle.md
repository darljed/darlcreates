# Order lifecycle

How an order moves from cart to delivered, who can do what at each step, what is recorded, and what the customer sees.
The logic is in `src/lib/order-service.ts` (framework-free, tested by `scripts/test-checkout.ts` and friends); the Server
Actions only check who is asking, validate input, call the service, refresh pages and send email.

## Statuses and allowed moves

```
awaiting_payment ──► paid ──► in_production ──► ready_to_ship ──► shipped ──► delivered
       │               │  │          │                  │
       │               │  └► refunded │                 │
       └► cancelled ◄──┴──────────────┴─────────────────┘   (cancelled also from paid / in_production / ready_to_ship)
```

| From | Can move to | Done by |
|---|---|---|
| `awaiting_payment` | `paid` | **Only** by verifying a payment (an admin cannot just "mark paid") |
| `awaiting_payment` | `cancelled` | The customer (if no payment is waiting for verification), or an admin |
| `paid` | `in_production`, `refunded`, `cancelled` | Admin |
| `in_production` | `ready_to_ship`, `cancelled` | Admin |
| `ready_to_ship` | `shipped`, `cancelled` | Admin |
| `shipped` | `delivered` | Admin |
| `delivered`, `cancelled`, `refunded` | nothing | final |

The table is `ORDER_TRANSITIONS` in `src/lib/orders.ts`. Each move reads the current status **under a row lock** inside a
transaction, so two admins clicking at once cannot skip or double-apply a step. Moves never go backwards.

"Refunded" and "cancelled after payment" change the status and the books only. **Sending the money back is done by hand in GCash.**

## Step by step

1. **Customer places the order** (`placeOrder`, checkout page).
   - Every line price is recomputed from the product's current options; the cart's remembered prices are ignored.
   - Writes the order (`awaiting_payment`), item snapshots (name, chosen options, unit price, model file, uploaded image), and the
     first history row "Order placed". Clears the cart. Optionally saves the address.
   - Order number: `DC-YYYYMMDD-XXXXXX`. The date is the Philippine date; the six characters are random and avoid look-alikes (no 0/O/1/I). The column is unique and a collision is retried.
   - Shipping is the flat fee from `src/lib/shipping.ts`. Total = subtotal + shipping.
   - Email to the customer: "Order … received".
2. **Customer pays by GCash and submits the reference** (`submitGcashReference`).
   - The amount stored is always the order total from the database; whatever the browser sends is ignored.
   - The reference is trimmed, spaces removed, upper-cased, then must be 6 to 32 characters of `A-Z 0-9 -`.
   - The database itself enforces: at most **one pending payment per order**, and a reference can back at most **one live (pending or verified) payment** anywhere.
   - Each submission is a **new row** in `payments`. Rows are never edited except to record the decision.
3. **Admin verifies or rejects** (Admin → Payments, or the order page).
   - **Verify:** in one transaction with row locks. Refused if the payer is the same person as the admin (separation of duties), if the order is no longer awaiting payment, or if the payment amount differs from the order total. On success the payment becomes `verified` (with `verified_by` and `verified_at`), the order becomes `paid`, and a history row "Payment … verified" is written. Email to the customer.
   - **Reject:** needs a reason (2+ characters). The payment becomes `rejected`; the order **stays** `awaiting_payment` and the customer sees the reason and can submit a corrected reference. Email to the customer.
4. **Production and shipping** (admin moves the status; `transitionOrder`). A note (up to 200 characters) can be added. Moving to `shipped` sends the customer an email with the courier and tracking number from the shipping form (`saveShipment`: carrier, tracking number, status).
5. **Delivered.** The customer can now review each product once (held for the admin's approval before it shows).

## What is recorded (and cannot be changed)

| Record | Rule |
|---|---|
| `payments` | Append-only ledger. A re-submission is a new row. |
| `order_status_history` | Append-only: from, to, note, who, when. Shown to the customer as "Activity" and to the admin on the order. |
| `order_items`, `orders.ship_address` | Snapshots. Editing a product, price, option or the customer's saved address later never changes an old order. |
| `admin_audit` | Admin actions on user accounts (block, edits, deletion). See [security.md](./security.md). |

Reserved, unused columns: `orders.or_number`, `orders.vat_cents`.

## Customer self-service

- **Cancel**: only while `awaiting_payment` **and** no payment is waiting for verification (once they may have sent money, the owner decides). Recorded in history as "Cancelled by customer". (A reference submitted in the same instant as the cancel can leave a pending payment on a cancelled order; verifying it is refused, so reject it.)
- **Buy again**: re-adds the items through the normal add-to-cart path, so prices are the *current* prices and any archived or changed product is skipped with a reason.
- **Order Acknowledgment**: a printable confirmation (items, amounts, delivery address, payment state). Customers open it from the order page; admins from the order page too. It never shows tax or registration wording.
- **Delete account**: refused while any order is `awaiting_payment`, `paid`, `in_production`, `ready_to_ship` or `shipped`.

## Where each number comes from (dashboard and lists)

| Figure | Definition |
|---|---|
| Verified revenue | Sum of **verified** payments on orders that are not `cancelled` or `refunded` (`REVENUE_ORDER_FILTER`) |
| Revenue chart | The same, per Philippine calendar day, last 30 days |
| Paid orders | Orders in `paid`, `in_production`, `ready_to_ship`, `shipped` or `delivered` |
| Awaiting payment / In production / Shipped / Delivered | Count of orders currently in that status |
| Top products | Quantity sold on orders that are not cancelled or refunded |
| User "Spent" | Verified payments on that user's live orders |

`scripts/test-data-integrity.ts` checks these rules against the whole database (totals add up, history ends at the status, payments match totals, one verified payment per order, no one verifies their own order, and the dashboard agrees with the raw data).

## Emails

| When | Subject |
|---|---|
| Order placed | Order … received |
| Payment verified | Payment verified for … |
| Payment rejected | Payment issue for … (includes the reason) |
| Order shipped | Order … shipped (courier and tracking) |

Plain-text, best-effort. With no SMTP settings they are printed in the server console. Wording lives in `src/lib/email.ts`.
