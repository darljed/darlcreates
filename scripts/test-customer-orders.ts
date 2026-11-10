/**
 * Customer self-service on orders: cancel an unpaid order, order again, and the richer order list.
 * Real service functions, live DB. Isolated TEST- data, cleaned up in finally.
 * Run: npx tsx scripts/test-customer-orders.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}
const ADDR = { recipient: "Cass Cancel", phone: "09170000000", line1: "1 Test St", city: "Manila", province: "NCR" };

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const svc = await import("../src/lib/order-service");
  const ord = await import("../src/lib/orders");

  const T = `TEST-CC-${Date.now()}`;
  const me = `${T}-me`, other = `${T}-other`, admin = `${T}-admin`;
  const productIds: string[] = [];
  const orderIds: string[] = [];

  async function cartWith(userId: string, productId: string, qty: number) {
    const [cart] = await db.insert(s.carts).values({ userId }).onConflictDoNothing().returning();
    const cartId = cart?.id ?? (await db.select().from(s.carts).where(eq(s.carts.userId, userId)))[0].id;
    await db.insert(s.cartItems).values({ cartId, productId, qty, config: {}, unitPriceCents: 1 });
  }
  async function place(userId: string, productId: string, qty = 1) {
    await cartWith(userId, productId, qty);
    const r = await svc.placeOrder(userId, ADDR);
    if (!r.ok) throw new Error(`placeOrder failed: ${r.error}`);
    const [o] = await db.select().from(s.orders).where(eq(s.orders.orderNo, r.orderNo));
    orderIds.push(o.id);
    return r.orderNo;
  }

  try {
    await db.insert(s.users).values([me, other, admin].map((id, i) => ({
      id, name: `T ${id}`, email: `${id}@test.local`, emailVerified: true, role: (i === 2 ? "admin" : "customer") as "admin" | "customer",
    })));
    const [p1] = await db.insert(s.products).values({ slug: `${T}-a`.toLowerCase(), name: `${T} Alpha`, basePriceCents: 10000, status: "published" }).returning();
    const [p2] = await db.insert(s.products).values({ slug: `${T}-b`.toLowerCase(), name: `${T} Beta`, basePriceCents: 5000, status: "published" }).returning();
    productIds.push(p1.id, p2.id);

    // ---- cancel ----
    console.log("\ncancel own order");
    const a = await place(me, p1.id, 2);
    assert("owner can cancel an unpaid order", (await svc.cancelOwnOrder(me, a)).ok);
    const [oa] = await db.select().from(s.orders).where(eq(s.orders.orderNo, a));
    assert("status is cancelled", oa.status === "cancelled");
    const hist = await db.select().from(s.orderStatusHistory).where(eq(s.orderStatusHistory.orderId, oa.id));
    assert("history records the customer as actor", hist.some((h) => h.toStatus === "cancelled" && h.actorId === me && h.note === "Cancelled by customer"));
    assert("cancelling twice is refused", !(await svc.cancelOwnOrder(me, a)).ok);

    const b = await place(me, p1.id);
    assert("another customer cannot cancel it", !(await svc.cancelOwnOrder(other, b)).ok);
    assert("an unknown order number is refused", !(await svc.cancelOwnOrder(me, "DC-00000000-NOPE00")).ok);

    const sub = await svc.submitGcashReference(me, b, `REF${Date.now()}A`);
    assert("reference submitted", sub.ok);
    const blocked = await svc.cancelOwnOrder(me, b);
    assert("cancel is blocked while a payment awaits verification", !blocked.ok);
    const [pay] = await db.select().from(s.payments).where(eq(s.payments.orderId, orderIds[orderIds.length - 1]));
    await svc.rejectPayment(admin, pay.id, "wrong amount");
    assert("after the payment is rejected, the owner can cancel", (await svc.cancelOwnOrder(me, b)).ok);

    const c = await place(me, p1.id);
    const sub2 = await svc.submitGcashReference(me, c, `REF${Date.now()}B`);
    assert("second reference submitted", sub2.ok);
    const [pay2] = await db.select().from(s.payments).where(eq(s.payments.orderId, orderIds[orderIds.length - 1]));
    await svc.verifyPayment(admin, pay2.id);
    assert("a paid order cannot be cancelled by the customer", !(await svc.cancelOwnOrder(me, c)).ok);

    // ---- order list ----
    console.log("\norder list");
    const d = await place(me, p1.id, 3);
    await svc.submitGcashReference(me, d, `REF${Date.now()}C`);
    const list = await ord.listUserOrders(me);
    const rowD = list.find((r) => r.orderNo === d);
    assert("list includes an items label", rowD?.itemsLabel === `3× ${T} Alpha`, rowD?.itemsLabel);
    assert("list flags a pending payment", rowD?.paymentPending === true);
    assert("a cancelled order has no pending flag", list.find((r) => r.orderNo === a)?.paymentPending === false);
    assert("list is scoped to the user", (await ord.listUserOrders(other)).length === 0);
    assert("an empty history is an empty list, not an error", Array.isArray(await ord.listUserOrders(`${T}-nobody`)));

    // ---- reorder ----
    console.log("\norder again");
    const e = await place(other, p1.id, 2);
    await cartWith(other, p2.id, 1); // not part of the first order, to prove only that order is copied
    await db.delete(s.cartItems).where(eq(s.cartItems.cartId, (await db.select().from(s.carts).where(eq(s.carts.userId, other)))[0].id));
    const r1 = await svc.reorderToCart(other, e);
    assert("reorder adds the lines", r1.ok && r1.added === 1 && r1.skipped.length === 0);
    const lines = await db.select().from(s.cartItems).where(eq(s.cartItems.cartId, (await db.select().from(s.carts).where(eq(s.carts.userId, other)))[0].id));
    assert("quantity is copied", lines.length === 1 && lines[0].qty === 2);
    assert("price is recomputed from the live product, not the order snapshot", lines[0].unitPriceCents === 10000, String(lines[0]?.unitPriceCents));
    assert("someone else cannot reorder my order", !(await svc.reorderToCart(me, e)).ok);
    await db.update(s.products).set({ status: "archived" }).where(eq(s.products.id, p1.id));
    const r2 = await svc.reorderToCart(other, e);
    assert("an archived product is refused with a reason", !r2.ok && /not available/i.test(r2.error), JSON.stringify(r2));
  } finally {
    if (orderIds.length) {
      await db.delete(s.payments).where(inArray(s.payments.orderId, orderIds));
      await db.delete(s.orders).where(inArray(s.orders.id, orderIds));
    }
    const users = [me, other, admin];
    const carts = await db.select({ id: s.carts.id }).from(s.carts).where(inArray(s.carts.userId, users));
    if (carts.length) await db.delete(s.cartItems).where(inArray(s.cartItems.cartId, carts.map((c) => c.id)));
    await db.delete(s.carts).where(inArray(s.carts.userId, users));
    if (productIds.length) await db.delete(s.products).where(inArray(s.products.id, productIds));
    await db.delete(s.users).where(inArray(s.users.id, users));
  }

  console.log(failures ? `\n${failures} FAILED` : "\nAll customer-order tests passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
