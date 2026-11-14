/**
 * Admin order list: search (order no., name, email), LIKE-wildcard escaping, pagination, status filter,
 * items summary and status counts. Isolated TEST- data in the live DB, cleaned up in finally.
 * Run: npx tsx scripts/test-admin-orders.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const admin = await import("../src/lib/admin");

  const T = `TEST-AO-${Date.now()}`;
  const u1 = `${T}-a`, u2 = `${T}-b`;
  const orderIds: string[] = [];
  let productId = "";
  try {
    await db.insert(s.users).values([
      { id: u1, name: `Q_X ${T}`, email: `${T}-a@test.local`, emailVerified: true, role: "customer" as const },
      { id: u2, name: `QZX ${T}`, email: `${T}-b@test.local`, emailVerified: true, role: "customer" as const },
    ]);
    const [p] = await db.insert(s.products).values({ slug: `${T.toLowerCase()}-p`, name: `${T} Widget`, basePriceCents: 1000, status: "published" }).returning();
    productId = p.id;

    // 27 orders for u1 (every 9th is cancelled), 2 for u2
    const mk = async (userId: string, i: number, status: "paid" | "cancelled") => {
      const [o] = await db.insert(s.orders).values({
        orderNo: `${T}-${String(i).padStart(3, "0")}`, userId, status, subtotalCents: 1000, shippingCents: 8000, totalCents: 9000,
        shipAddress: {}, placedAt: new Date(Date.now() - i * 60_000),
      }).returning();
      orderIds.push(o.id);
      await db.insert(s.orderItems).values([
        { orderId: o.id, productId, nameSnapshot: "Beta item", qty: 1, unitPriceCents: 500 },
        { orderId: o.id, productId, nameSnapshot: "Alpha item", qty: 2, unitPriceCents: 250 },
      ]);
    };
    for (let i = 0; i < 27; i++) await mk(u1, i, i % 9 === 8 ? "cancelled" : "paid");
    await mk(u2, 100, "paid");
    await mk(u2, 101, "paid");

    console.log("\nsearch + pagination");
    const p1 = await admin.adminListOrders({ q: `Q_X ${T}` });
    assert("search by customer name finds only that customer's orders", p1.total === 27, String(p1.total));
    assert("page 1 has 25 rows", p1.rows.length === 25);
    const p2 = await admin.adminListOrders({ q: `Q_X ${T}`, page: 2 });
    assert("page 2 has the remaining 2", p2.rows.length === 2 && p2.page === 2);
    assert("page 3 is empty", (await admin.adminListOrders({ q: `Q_X ${T}`, page: 3 })).rows.length === 0);
    assert("a page number below 1 is treated as page 1", (await admin.adminListOrders({ q: `Q_X ${T}`, page: -4 })).page === 1);
    assert("newest first", p1.rows[0].placedAt.getTime() > p1.rows[1].placedAt.getTime());
    assert("pages don't overlap", !p1.rows.some((r) => p2.rows.some((x) => x.id === r.id)));
    assert("custom page size", (await admin.adminListOrders({ q: `Q_X ${T}`, pageSize: 10 })).rows.length === 10);

    console.log("\nLIKE wildcards are literal");
    assert("an underscore matches only a real underscore (not 'QZX')", (await admin.adminListOrders({ q: `Q_X ${T}` })).rows.every((r) => r.customer.startsWith("Q_X")));
    const both = await admin.adminListOrders({ q: `${T}-` });
    assert("a plain token matches both customers' orders (by order number/email)", both.total === 29, String(both.total));
    assert("a lone % does not match everything", (await admin.adminListOrders({ q: "%" })).total < (await admin.adminListOrders({})).total);
    assert("a lone _ does not match everything", (await admin.adminListOrders({ q: "_" })).total < (await admin.adminListOrders({})).total);

    console.log("\nother search fields");
    assert("by order number", (await admin.adminListOrders({ q: `${T}-100` })).total === 1);
    assert("by email, case-insensitive", (await admin.adminListOrders({ q: `${T}-B@TEST.LOCAL`.toLowerCase().toUpperCase() })).total === 2);
    assert("no match is an empty page, not an error", (await admin.adminListOrders({ q: `${T}-nothing-here` })).total === 0);
    assert("whitespace-only search is ignored", (await admin.adminListOrders({ q: "   " })).total >= 29);

    console.log("\nstatus filter + counts");
    const cancelled = await admin.adminListOrders({ q: `Q_X ${T}`, status: "cancelled" });
    assert("status filter combines with search", cancelled.total === 3 && cancelled.rows.every((r) => r.status === "cancelled"), String(cancelled.total));
    const counts = await admin.adminOrderStatusCounts();
    assert("status counts include the test orders", (counts.cancelled ?? 0) >= 3 && (counts.paid ?? 0) >= 26);
    assert("status counts add up to the unfiltered total", Object.values(counts).reduce((a, b) => a + b, 0) === (await admin.adminListOrders({})).total);

    console.log("\nrow content");
    const row = p1.rows[0];
    assert("items are summarised, sorted by name", row.itemsLabel === "2× Alpha item, 1× Beta item", String(row.itemsLabel));
    assert("customer name and email are included", row.customer.startsWith("Q_X") && row.email.endsWith("@test.local"));
  } finally {
    if (orderIds.length) await db.delete(s.orders).where(inArray(s.orders.id, orderIds));
    if (productId) await db.delete(s.products).where(eq(s.products.id, productId));
    await db.delete(s.users).where(inArray(s.users.id, [u1, u2]));
  }

  console.log(failures ? `\n${failures} FAILED` : "\nAll admin order list tests passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
