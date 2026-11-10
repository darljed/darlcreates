/**
 * Checkout + payment + fulfilment through the REAL service functions (src/lib/order-service.ts)
 * against the live DB. Isolated TEST- data, cleaned up in finally.
 * Run: npx tsx scripts/test-checkout.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray, like } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

const ADDR = { recipient: "Test Buyer", phone: "09170000000", line1: "1 Test St", city: "Manila", province: "NCR" };

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const svc = await import("../src/lib/order-service");
  const { generateOrderNo } = await import("../src/lib/orders");
  const { safeRedirect } = await import("../src/lib/safe-redirect");
  const { FLAT_SHIPPING_CENTS } = await import("../src/lib/shipping");

  const T = `TEST-CO-${Date.now()}`;
  const buyer = `${T}-buyer`, buyer2 = `${T}-buyer2`, admin = `${T}-admin`;
  let productId = "";
  const orderIds: string[] = [];

  async function cartWith(userId: string, qty = 2) {
    const [cart] = await db.insert(s.carts).values({ userId }).onConflictDoNothing().returning();
    const cartId = cart?.id ?? (await db.select().from(s.carts).where(eq(s.carts.userId, userId)))[0].id;
    await db.insert(s.cartItems).values({ cartId, productId, qty, config: {}, unitPriceCents: 1 /* deliberately wrong: must be recomputed */ });
  }

  try {
    await db.insert(s.users).values([buyer, buyer2, admin].map((id, i) => ({
      id, name: `T ${id}`, email: `${id}@test.local`, emailVerified: true, role: (i === 2 ? "admin" : "customer") as "admin" | "customer",
    })));
    const [p] = await db.insert(s.products).values({ slug: `${T}-prod`, name: `${T} Widget`, basePriceCents: 10000, status: "published", stlKey: "models/test.3mf" }).returning();
    productId = p.id;

    // ---- pure helpers ----
    console.log("\nhelpers");
    const no = generateOrderNo(new Date("2026-11-09T20:00:00Z")); // 04:00 on 2026-11-10 in Manila
    assert("order no format DC-YYYYMMDD-XXXXXX (6 unambiguous chars)", /^DC-\d{8}-[A-HJ-NP-Z2-9]{6}$/.test(no), no);
    assert("order no uses the PH business day", no.startsWith("DC-20261110-"), no);
    assert("1000 order numbers have no duplicates", new Set(Array.from({ length: 1000 }, () => generateOrderNo())).size === 1000);
    assert("normalizeReference trims, strips spaces, upper-cases", svc.normalizeReference(" ab 12 cd34 ") === "AB12CD34");
    assert("safeRedirect keeps a same-site path", safeRedirect("/products/abc?x=1") === "/products/abc?x=1");
    assert("safeRedirect blocks absolute URL", safeRedirect("https://evil.example") === "/");
    assert("safeRedirect blocks protocol-relative", safeRedirect("//evil.example") === "/");
    assert("safeRedirect blocks encoded protocol-relative", safeRedirect("%2F%2Fevil.example") === "/");
    assert("safeRedirect blocks javascript:", safeRedirect("javascript:alert(1)") === "/");
    assert("safeRedirect blocks backslash trick", safeRedirect("/\\evil.example") === "/");

    // ---- place order ----
    console.log("\nplace order");
    assert("empty cart is rejected", !(await svc.placeOrder(buyer, ADDR)).ok);
    await cartWith(buyer, 2);
    assert("bad address is rejected", !(await svc.placeOrder(buyer, { ...ADDR, recipient: "" })).ok);
    const placed = await svc.placeOrder(buyer, ADDR);
    assert("order placed", placed.ok);
    if (!placed.ok) throw new Error(placed.error);
    const [order] = await db.select().from(s.orders).where(eq(s.orders.orderNo, placed.orderNo));
    orderIds.push(order.id);
    assert("price recomputed server-side (client sent 1 centavo) = 2 x 10000", order.subtotalCents === 20000, `${order.subtotalCents}`);
    assert("shipping comes from the single config", order.shippingCents === FLAT_SHIPPING_CENTS);
    assert("total = subtotal + shipping", order.totalCents === 20000 + FLAT_SHIPPING_CENTS);
    assert("status awaiting_payment", order.status === "awaiting_payment");
    const items = await db.select().from(s.orderItems).where(eq(s.orderItems.orderId, order.id));
    assert("item snapshot: name, unit price, model key", items[0].nameSnapshot === `${T} Widget` && items[0].unitPriceCents === 10000 && items[0].stlKeySnapshot === "models/test.3mf");
    const cartLeft = await db.select().from(s.cartItems).where(inArray(s.cartItems.cartId, (await db.select().from(s.carts).where(eq(s.carts.userId, buyer))).map((c) => c.id)));
    assert("cart cleared", cartLeft.length === 0);
    const hist = await db.select().from(s.orderStatusHistory).where(eq(s.orderStatusHistory.orderId, order.id));
    assert("first history row written", hist.length === 1 && hist[0].toStatus === "awaiting_payment");

    // ---- payments ----
    console.log("\npayments");
    assert("short/garbage reference rejected", !(await svc.submitGcashReference(buyer, placed.orderNo, "12")).ok);
    assert("another user cannot pay my order", !(await svc.submitGcashReference(buyer2, placed.orderNo, "GC12345678")).ok);
    const ref = `${T}`.slice(-10).replace(/[^A-Z0-9]/gi, "X").toUpperCase().padStart(10, "0");
    const sub1 = await svc.submitGcashReference(buyer, placed.orderNo, ` ${ref.slice(0, 5)} ${ref.slice(5)} `);
    assert("reference submitted (spaces/case normalized)", sub1.ok);
    const [pay] = await db.select().from(s.payments).where(eq(s.payments.orderId, order.id));
    assert("amount stored = order total from DB (no client amount exists)", pay.amountCents === order.totalCents);
    assert("reference stored normalized", pay.gcashReference === ref);
    const dupSame = await svc.submitGcashReference(buyer, placed.orderNo, "ZZ99887766");
    assert("second pending payment for same order blocked", !dupSame.ok && /already awaiting/i.test(dupSame.ok ? "" : dupSame.error));

    // another order trying to reuse the same live reference
    await cartWith(buyer2, 1);
    const placed2 = await svc.placeOrder(buyer2, ADDR);
    if (!placed2.ok) throw new Error(placed2.error);
    const [order2] = await db.select().from(s.orders).where(eq(s.orders.orderNo, placed2.orderNo)); orderIds.push(order2.id);
    const reuse = await svc.submitGcashReference(buyer2, placed2.orderNo, ref);
    assert("same reference cannot back a second live payment", !reuse.ok && /already submitted/i.test(reuse.ok ? "" : reuse.error));

    // ---- verify: SoD, race, wrong state ----
    console.log("\nverify / reject");
    const asBuyer = await svc.verifyPayment(buyer, pay.id);
    assert("payer cannot verify own payment (SoD)", !asBuyer.ok);
    // admin who is also the buyer of order #2 cannot verify their own
    const [adminCart] = await db.insert(s.carts).values({ userId: admin }).returning();
    await db.insert(s.cartItems).values({ cartId: adminCart.id, productId, qty: 1, config: {}, unitPriceCents: 1 });
    const placedAdmin = await svc.placeOrder(admin, ADDR);
    if (!placedAdmin.ok) throw new Error(placedAdmin.error);
    const [orderA] = await db.select().from(s.orders).where(eq(s.orders.orderNo, placedAdmin.orderNo)); orderIds.push(orderA.id);
    await svc.submitGcashReference(admin, placedAdmin.orderNo, "ADMIN123456");
    const [payA] = await db.select().from(s.payments).where(eq(s.payments.orderId, orderA.id));
    const selfVerify = await svc.verifyPayment(admin, payA.id);
    assert("admin cannot verify their OWN order's payment", !selfVerify.ok);

    // concurrent double-click: exactly one wins
    const race = await Promise.all([svc.verifyPayment(admin, pay.id), svc.verifyPayment(admin, pay.id), svc.verifyPayment(admin, pay.id)]);
    assert("3 concurrent verifies => exactly 1 succeeds", race.filter((r) => r.ok).length === 1, JSON.stringify(race.map((r) => r.ok)));
    const [orderAfter] = await db.select().from(s.orders).where(eq(s.orders.id, order.id));
    assert("order is paid", orderAfter.status === "paid");
    const histAfter = await db.select().from(s.orderStatusHistory).where(eq(s.orderStatusHistory.orderId, order.id));
    assert("exactly one 'paid' history row (no duplicates from the race)", histAfter.filter((h) => h.toStatus === "paid").length === 1);
    const [payAfter] = await db.select().from(s.payments).where(eq(s.payments.id, pay.id));
    assert("verifier recorded", payAfter.verifiedBy === admin && payAfter.status === "verified");

    // reject then resubmit (append-only)
    const rej = await svc.rejectPayment(admin, payA.id, " ");
    assert("reject without a reason refused", !rej.ok);
    assert("reject with reason ok", (await svc.rejectPayment(admin, payA.id, "Amount mismatch")).ok);
    assert("rejected reference can be re-entered correctly (new row)", (await svc.submitGcashReference(admin, placedAdmin.orderNo, "ADMIN654321")).ok);
    const payRows = await db.select().from(s.payments).where(eq(s.payments.orderId, orderA.id));
    assert("payments are append-only: 2 rows (1 rejected + 1 pending)", payRows.length === 2 && payRows.filter((r) => r.status === "rejected").length === 1);

    // cancelled order: a late payment can't be verified into 'paid'
    const cancel = await svc.transitionOrder(admin, order2.id, "cancelled", "customer asked");
    assert("awaiting_payment -> cancelled allowed", cancel.ok);
    assert("cannot submit payment on a cancelled order", !(await svc.submitGcashReference(buyer2, placed2.orderNo, "LATE123456")).ok);

    // a payment that was pending when the order got cancelled must be rejected, never verified
    const pendingRow = (await db.select().from(s.payments).where(eq(s.payments.orderId, orderA.id))).find((r) => r.status === "pending")!;
    await db.update(s.orders).set({ status: "cancelled" }).where(eq(s.orders.id, orderA.id));
    const lateVerify = await svc.verifyPayment(buyer, pendingRow.id); // buyer is NOT the order owner, so SoD can't be the reason
    assert("verifying a payment on a CANCELLED order is refused, for the right reason",
      !lateVerify.ok && /cancelled/i.test(lateVerify.ok ? "" : lateVerify.error), lateVerify.ok ? "" : lateVerify.error);
    const [stillPending] = await db.select().from(s.payments).where(eq(s.payments.id, pendingRow.id));
    assert("...and the payment stays pending (revenue ledger untouched)", stillPending.status === "pending");

    // ---- transitions ----
    console.log("\ntransitions");
    assert("cannot jump paid -> shipped", !(await svc.transitionOrder(admin, order.id, "shipped")).ok);
    assert("cannot mark paid by hand (only via verified payment)", !(await svc.transitionOrder(admin, order.id, "paid")).ok);
    for (const to of ["in_production", "ready_to_ship", "shipped", "delivered"] as const) {
      assert(`-> ${to}`, (await svc.transitionOrder(admin, order.id, to)).ok);
    }
    assert("delivered is terminal", !(await svc.transitionOrder(admin, order.id, "cancelled")).ok);
    const full = await db.select().from(s.orderStatusHistory).where(eq(s.orderStatusHistory.orderId, order.id));
    const bySteps = [...full].sort((a, b) => ["awaiting_payment","paid","in_production","ready_to_ship","shipped","delivered"].indexOf(a.toStatus) - ["awaiting_payment","paid","in_production","ready_to_ship","shipped","delivered"].indexOf(b.toStatus));
    assert("history has all 6 steps in the right chain", full.length === 6 && bySteps.every((h, i) => i === 0 ? h.fromStatus === null : h.fromStatus === bySteps[i - 1].toStatus), JSON.stringify(full.map((h) => `${h.fromStatus}>${h.toStatus}`)));
    assert("every admin step is attributed to the admin (and the first to the buyer)", bySteps.slice(1).every((h) => h.actorId === admin) && bySteps[0].actorId === buyer);
    // parallel transitions on a fresh paid order. in_production and refunded conflict (refunded is only reachable from paid), so exactly ONE can win
    const [cartR] = await db.insert(s.carts).values({ userId: buyer2 }).onConflictDoNothing().returning();
    const cartIdR = cartR?.id ?? (await db.select().from(s.carts).where(eq(s.carts.userId, buyer2)))[0].id;
    await db.insert(s.cartItems).values({ cartId: cartIdR, productId, qty: 1, config: {}, unitPriceCents: 1 });
    const placedR = await svc.placeOrder(buyer2, ADDR);
    if (!placedR.ok) throw new Error(placedR.error);
    const [orderR] = await db.select().from(s.orders).where(eq(s.orders.orderNo, placedR.orderNo)); orderIds.push(orderR.id);
    await db.update(s.orders).set({ status: "paid" }).where(eq(s.orders.id, orderR.id));
    const moves = await Promise.all([svc.transitionOrder(admin, orderR.id, "in_production"), svc.transitionOrder(admin, orderR.id, "refunded")]);
    assert("two conflicting transitions at once => exactly one applies", moves.filter((m) => m.ok).length === 1, JSON.stringify(moves.map((m) => m.ok)));
    const histR = await db.select().from(s.orderStatusHistory).where(eq(s.orderStatusHistory.orderId, orderR.id));
    assert("...and exactly one history row leaves 'paid'", histR.filter((h) => h.fromStatus === "paid").length === 1);
    const [finalR] = await db.select().from(s.orders).where(eq(s.orders.id, orderR.id));
    const lastHist = histR.sort((a, b) => +a.createdAt - +b.createdAt).at(-1)!;
    assert("...and the order status equals the last history row (no drift)", finalR.status === lastHist.toStatus);

    assert("shipment upsert works", (await svc.saveShipment(order.id, { carrier: "J&T", trackingNo: "T123", status: "in_transit" })).ok);
    assert("shipment upsert is idempotent (1 row)", (await svc.saveShipment(order.id, { carrier: "LBC", trackingNo: "T456", status: "in_transit" })).ok && (await db.select().from(s.shipments).where(eq(s.shipments.orderId, order.id))).length === 1);
  } finally {
    if (orderIds.length) await db.delete(s.orders).where(inArray(s.orders.id, orderIds));
    const uids = [buyer, buyer2, admin];
    await db.delete(s.carts).where(inArray(s.carts.userId, uids));
    await db.delete(s.addresses).where(inArray(s.addresses.userId, uids));
    if (productId) await db.delete(s.products).where(eq(s.products.id, productId));
    await db.delete(s.users).where(inArray(s.users.id, uids));
    const left = await db.select().from(s.users).where(like(s.users.id, "TEST-CO-%"));
    console.log(`  (cleaned up; leftover test users: ${left.length})`);
  }

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll checkout checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
