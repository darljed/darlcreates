# Workshop: estimator, inventory, costing and the sales log

The internal side of the shop, merged in from the owner's separate 3dEstimator app ("Dreety"). It lives in the admin under
**Workshop** (Estimator, Inventory, Sales log), on each product's page (**Costing**) and on the dashboard (**Workshop** panel).
Everything here is admin-only (`requireAdmin()` on every page and Server Action) and nothing in it is ever shown to customers.

## What it does

| Screen | What for |
|---|---|
| **Estimator** `/admin/estimator` | Turn slicer numbers (grams, print time) into the true cost of a job and three prices. Save estimates with a comment and tags, reopen and edit them, and turn one into a product. |
| **Inventory** `/admin/inventory` | The parts and filament you stock: purchase lots (so each part has a weighted-average cost), manual corrections, a history per part, low-stock flags. |
| **Product costing** (on a product's page) | What one unit costs: its **bill of materials** (parts per unit) plus a **print cost** (machine time, labour, failures), and the margin that leaves at the product's price. |
| **Sales log** `/admin/sales` | Sales taken outside the website (Messenger, in person): table and kanban, payment and status, one-off extra parts. Replaces the spreadsheet. |
| **Dashboard panel** `/admin` | Stock value, what is running low, and profit by today / week / month from the sales log and from online orders whose cost is known. |

How the old app's pages map: Inventory -> Inventory, Products + BOM -> Costing on the existing shop products (there is one product
list now, not two), Orders -> Sales log (online orders already exist under Orders), Estimator -> Estimator, Dashboard -> the Workshop panel.

## The costing model

All amounts in the calculator are pesos (floats); they become integer centavos where they are saved. The code is
`src/lib/workshop/pricing.ts` (pure; covered by `scripts/test-workshop.ts`).

```
machine_hour_rate = printer_price / printer_lifetime_hours + maintenance_per_hr + (watts / 1000) * electricity_rate (+ queue premium)
material  = sum over filament lines of (grams / 1000) * price_per_kg          (waste % adds extra filament, costed and deducted)
machine   = machine_hour_rate * print_hours
labour    = labour_rate * minutes / 60
subtotal  = material + waste + components + machine + labour
failure   = subtotal * failure_pct
unit cost = subtotal + failure
price     = cost / (1 - margin)        margin, never markup; rounded UP to the rounding step (1 / 5 / 10)
```
Defaults: electricity ₱12/kWh, 150 W, printer ₱25,000 over 5,000 h, maintenance ₱2/h, labour ₱150/h, failure 5%, margins 30 / 50 / 65%, rounding ₱5
(Economy / Standard / Premium). Worked example: 147.91 g of PLA at ₱750/kg, 3 h 37 min, 20 min labour = **₱202.40** cost, **₱290 / ₱405 / ₱580**.

- **Several filament lines** (one per colour or material). A line can be a stocked part (price locked to its average cost, grams deducted from stock) or a preset (PLA, PETG...) that only prices.
- **Quantity modes:** *separate prints* (everything scales with the quantity) or *one print, N pieces* (material and machine are shared, so a piece gets cheaper).
- **Attached parts** (stocked parts used per unit) and **fees**: a *margin* fee is costed and earns margin; a *relay* fee is added after margin and earns nothing (a courier fee).
- **Per-tier margin sliders** (this session only) and a chosen tier. Settings are kept in the browser (`localStorage`), not the database.
- **Save as product:** *new product* creates a **draft** shop product (cost saved, the chosen tier as its price; add photos and publish on its page), or *existing product* replaces the costing of a product (its price is left alone). Parts linked to stock become the BOM; the rest of the unit cost becomes the print cost, so nothing is counted twice. A product is one piece: in batch mode the cost, price and BOM are per piece.

## Stock rules (the important part)

- **Append-only ledger.** Every change of a part's quantity is a row in `stock_movements` (never edited); `parts.qty_on_hand` is kept equal to their sum in the same transaction. Purchases, voids, adjustments, sales and orders all write rows.
- **Cost = weighted average** over a part's purchase lots (`sum(total cost) / sum(qty)`). Editing a lot voids it and re-records it with its date; voiding a lot recomputes the average.
- **Sales log:** a sale uses stock the first time it reaches **Packaged** or **Delivered** (`deducted_at` guards against twice). Moving it back to *For Processing*, to *Cancelled*, or deleting it gives the stock back; editing quantity, product or extras on a sale that used stock re-balances it. The product's BOM x quantity plus the sale's own extra parts are used.
- **Online orders:** when an order moves to **In production** its items' BOMs are used up (`orders.stock_deducted_at`), and the cost of making them is saved as `orders.cogs_cents`. **Cancelling** gives it back exactly (the order's own ledger rows are reversed). Items whose product has no BOM and no print cost (the clicker and keychain services) use nothing and add no cost. This happens inside the order's status change transaction (`transitionOrder`), so the status and the stock can never disagree.
- **Giving back is a ledger reversal,** not a recomputation: it is exact after later BOM edits, a deleted product, or a deleted part.
- **Stock may go negative.** The shop prints first and restocks later; the ledger shows it and the low-stock flag catches it.
- **Costs are snapshotted.** A sale saves the product's unit cost and its extra parts' costs when saved. Once it has used stock, editing it keeps those costs where what they price is unchanged, so a status drag cannot rewrite old profit with today's average cost.
- **Paid date:** a sale gets `paid_at` = now on the flip to Paid, kept while it stays Paid, cleared when it leaves Paid (a sale created already Paid is paid on its own date).

## Profit and the dashboard

- **Sales log:** revenue and profit count **Paid** sales only; "owed" is the Unpaid total of live (not cancelled) sales.
- **Online:** revenue is verified payments (as the main dashboard). Profit is shown only for orders that have a saved cost: `revenue of costed orders - cogs`. Orders with no costed items show "–", not a fake margin.
- Windows follow the Philippine calendar (UTC+8): today, this week (from Monday), this month (`phWindowStart`).

## Data

Tables (migration `0006_workshop.sql`): `parts`, `stock_purchases`, `stock_movements`, `product_parts`, `estimates`, `manual_sales`; new columns `products.print_cost_cents`, `orders.stock_deducted_at`, `orders.cogs_cents`. See [database.md](./database.md). Money is integer centavos; ids are uuids.

## Where the code is
`src/lib/workshop/` (pricing, inventory, stock, costing, estimates, sales, online-stock, summary, types), `src/components/workshop/` (the screens), the pages under `src/app/(admin)/admin/{estimator,inventory,sales}`, the Server Actions next to them (and `products/costing-actions.ts`). Server Actions return `{ ok: false, error }` instead of throwing, because production builds hide a thrown error's message.

## Known limits
- Nothing here has been used on real data yet; check the first few months' numbers against your own books.
- A sale whose product was later deleted has no product, so it cannot be moved on the kanban until you pick a product for it (editing it asks for one).
- Estimator settings live in the browser, so a second device starts from the defaults.
- The old app's Google sign-in and its separate database are not migrated; its data (the old `quotes`, parts, orders) is not imported. Re-enter parts under Inventory.
- Online orders are costed only from products that have costing set up; set it on the products you sell most first.

## Tests
`npx tsx scripts/test-workshop.ts`: the costing model against the worked example (tiers, batch, waste, fees, rounding), the weighted average, estimate-to-product, the Philippine windows, and (with the database, isolated TEST-WS data) the ledger always equalling the quantity on hand, lots, voids and edits, product costing, a manual sale using and giving back stock (edit, re-balance, cancel, delete), cost snapshots, the paid date, summaries, an online order using stock in production and giving it back when cancelled, saved estimates with tags, and deleting a part.
