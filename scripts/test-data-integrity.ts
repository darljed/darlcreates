/**
 * Read-only integrity checks over ALL orders, payments, shipments and reviews in the database.
 * Passes on real data and on the demo seed (scripts/seed-demo.ts), so it doubles as a seed validator.
 * Run: npx tsx scripts/test-data-integrity.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { sql } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

async function rows<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  const { db } = await import("../src/db");
  return (await db.execute(q)) as unknown as T[];
}
const count = async (q: ReturnType<typeof sql>) => Number((await rows<{ n: number }>(q))[0]?.n ?? 0);

async function main() {
  const total = await count(sql`select count(*)::int as n from orders`);
  console.log(`\n${total} orders in the database`);

  console.log("\nmoney");
  assert("total = subtotal + shipping for every order", (await count(sql`select count(*)::int as n from orders where total_cents <> subtotal_cents + shipping_cents`)) === 0);
  assert("subtotal = sum(unit price × qty) for every order", (await count(sql`
    select count(*)::int as n from orders o
    where o.subtotal_cents <> coalesce((select sum(unit_price_cents * qty) from order_items i where i.order_id = o.id), 0)`)) === 0);
  assert("every order has at least one item", (await count(sql`select count(*)::int as n from orders o where not exists (select 1 from order_items i where i.order_id = o.id)`)) === 0);
  assert("no negative or zero money values", (await count(sql`select count(*)::int as n from orders where total_cents <= 0 or subtotal_cents < 0 or shipping_cents < 0`)) === 0);

  console.log("\nstatus history");
  assert("every order has a history", (await count(sql`select count(*)::int as n from orders o where not exists (select 1 from order_status_history h where h.order_id = o.id)`)) === 0);
  assert("the first history row is 'placed' (no previous status → awaiting_payment)", (await count(sql`
    select count(*)::int as n from orders o where (
      select (h.from_status is null and h.to_status = 'awaiting_payment') from order_status_history h where h.order_id = o.id order by h.created_at, h.id limit 1) is not true`)) === 0);
  assert("the last history row matches the order's status", (await count(sql`
    select count(*)::int as n from orders o where o.status <> (
      select h.to_status from order_status_history h where h.order_id = o.id order by h.created_at desc, h.id desc limit 1)`)) === 0);
  assert("history times never run backwards", (await count(sql`
    select count(*)::int as n from (select created_at, lag(created_at) over (partition by order_id order by created_at, id) as prev from order_status_history) x where prev is not null and created_at < prev`)) === 0);
  assert("an order is never placed in the future", (await count(sql`select count(*)::int as n from orders where placed_at > now() + interval '1 minute'`)) === 0);

  console.log("\npayments");
  assert("orders past 'awaiting payment' have a verified payment equal to the total (cancelled orders may not)", (await count(sql`
    select count(*)::int as n from orders o where o.status in ('paid','in_production','ready_to_ship','shipped','delivered','refunded')
    and not exists (select 1 from payments p where p.order_id = o.id and p.status = 'verified' and p.amount_cents = o.total_cents)`)) === 0);
  assert("an order awaiting payment has no verified payment", (await count(sql`
    select count(*)::int as n from orders o where o.status = 'awaiting_payment' and exists (select 1 from payments p where p.order_id = o.id and p.status = 'verified')`)) === 0);
  assert("at most one verified payment per order", (await count(sql`select count(*)::int as n from (select order_id from payments where status = 'verified' group by order_id having count(*) > 1) x`)) === 0);
  assert("at most one pending payment per order", (await count(sql`select count(*)::int as n from (select order_id from payments where status = 'pending' group by order_id having count(*) > 1) x`)) === 0);
  assert("a live GCash reference is used once", (await count(sql`select count(*)::int as n from (select gcash_reference from payments where status in ('pending','verified') group by gcash_reference having count(*) > 1) x`)) === 0);
  assert("verified and rejected payments record who decided and when", (await count(sql`
    select count(*)::int as n from payments where status in ('verified','rejected') and (verified_at is null)`)) === 0);
  assert("rejected payments have a reason", (await count(sql`select count(*)::int as n from payments where status = 'rejected' and coalesce(reject_reason,'') = ''`)) === 0);
  assert("a payment is never decided before it was submitted", (await count(sql`select count(*)::int as n from payments where verified_at is not null and verified_at < submitted_at`)) === 0);
  assert("nobody verifies their own order's payment (separation of duties)", (await count(sql`
    select count(*)::int as n from payments p join orders o on o.id = p.order_id where p.verified_by is not null and p.verified_by = o.user_id`)) === 0);

  console.log("\nshipments");
  assert("only shipped/delivered orders have a shipment", (await count(sql`
    select count(*)::int as n from shipments s join orders o on o.id = s.order_id where o.status not in ('shipped','delivered')`)) === 0);
  assert("every shipped/delivered order has a tracking number", (await count(sql`
    select count(*)::int as n from orders o where o.status in ('shipped','delivered') and not exists (select 1 from shipments s where s.order_id = o.id and s.tracking_no <> '')`)) === 0);

  console.log("\nreviews");
  assert("a review's order (when set) is delivered, belongs to the reviewer and contains the product", (await count(sql`
    select count(*)::int as n from reviews r where r.order_id is not null and not exists (
      select 1 from orders o join order_items i on i.order_id = o.id
      where o.id = r.order_id and o.user_id = r.user_id and o.status = 'delivered' and i.product_id = r.product_id)`)) === 0);
  assert("one review per customer per product", (await count(sql`select count(*)::int as n from (select user_id, product_id from reviews group by 1,2 having count(*) > 1) x`)) === 0);
  assert("ratings are 1 to 5", (await count(sql`select count(*)::int as n from reviews where rating < 1 or rating > 5`)) === 0);

  console.log("\nthe dashboard agrees with the raw data");
  const admin = await import("../src/lib/admin");
  const stats = await admin.adminDashboard();
  const [{ rev }] = await rows<{ rev: number }>(sql`
    select coalesce(sum(p.amount_cents),0)::bigint as rev from payments p join orders o on o.id = p.order_id
    where p.status = 'verified' and o.status not in ('cancelled','refunded')`);
  assert("verified revenue = sum of verified payments on live orders", stats.revenueCents === Number(rev), `${stats.revenueCents} vs ${rev}`);
  const byStatus = Object.fromEntries((await rows<{ status: string; n: number }>(sql`select status, count(*)::int as n from orders group by status`)).map((r) => [r.status, Number(r.n)]));
  assert("status cards match the order counts", stats.awaitingPayment === (byStatus.awaiting_payment ?? 0) && stats.inProduction === (byStatus.in_production ?? 0) && stats.shipped === (byStatus.shipped ?? 0) && stats.delivered === (byStatus.delivered ?? 0));
  const series = await admin.adminRevenueSeries(30);
  const seriesTotal = series.reduce((a, p) => a + p.cents, 0);
  assert("the 30-day chart never exceeds all-time revenue", seriesTotal <= stats.revenueCents, `${seriesTotal} > ${stats.revenueCents}`);
  const listed = await admin.adminListOrders({ pageSize: 1 });
  assert("the orders list total equals the order count", listed.total === total);

  console.log(failures ? `\n${failures} FAILED` : "\nAll data integrity checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
