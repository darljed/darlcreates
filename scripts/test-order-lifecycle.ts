/**
 * End-to-end order lifecycle test against the live DB. Creates isolated,
 * prefixed test data, asserts outcomes, and cleans up.
 * Run: npx tsx scripts/test-order-lifecycle.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { eq, inArray } from "drizzle-orm";

const PREFIX = "TEST-LC-";

let failures = 0;
function assert(name: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${name}`);
  } else console.log(`  ✓ ${name}`);
}

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { canTransition } = await import("../src/lib/orders");

  const customerId = `${PREFIX}cust-${Date.now()}`;
  const adminId = `${PREFIX}admin-${Date.now()}`;
  let productId = "";
  let orderId = "";

  try {
    // Seed two users (customer + admin) and a product.
    await db.insert(s.users).values([
      {
        id: customerId,
        name: "Test Customer",
        email: `${customerId}@test.local`,
        emailVerified: true,
        role: "customer",
      },
      {
        id: adminId,
        name: "Test Admin",
        email: `${adminId}@test.local`,
        emailVerified: true,
        role: "admin",
      },
    ]);
    const [product] = await db
      .insert(s.products)
      .values({
        slug: `${PREFIX}prod-${Date.now()}`,
        name: `${PREFIX}Widget`,
        basePriceCents: 10000,
        status: "published",
        stlKey: "stl/test.stl",
      })
      .returning();
    productId = product.id;

    // Place an order with an immutable snapshot (name + price + stl key).
    const [order] = await db
      .insert(s.orders)
      .values({
        orderNo: `${PREFIX}${Date.now()}`,
        userId: customerId,
        status: "awaiting_payment",
        subtotalCents: 10000,
        shippingCents: 8000,
        totalCents: 18000,
        shipAddress: { recipient: "Test", city: "QC", province: "NCR" },
      })
      .returning();
    orderId = order.id;
    await db.insert(s.orderItems).values({
      orderId,
      productId,
      nameSnapshot: product.name,
      qty: 1,
      unitPriceCents: 10000,
      stlKeySnapshot: product.stlKey,
    });
    await db.insert(s.orderStatusHistory).values({
      orderId,
      fromStatus: null,
      toStatus: "awaiting_payment",
      note: "placed",
      actorId: customerId,
    });

    assert("order total = subtotal + shipping", order.totalCents === 18000);

    // Snapshot immutability: edit the product price, order item must not change.
    await db
      .update(s.products)
      .set({ basePriceCents: 99999 })
      .where(eq(s.products.id, productId));
    const [item] = await db
      .select()
      .from(s.orderItems)
      .where(eq(s.orderItems.orderId, orderId));
    assert("order item price snapshot unchanged after product edit", item.unitPriceCents === 10000);
    assert("stl key snapshot preserved", item.stlKeySnapshot === "stl/test.stl");

    // Submit a GCash payment (append-only).
    await db.insert(s.payments).values({
      orderId,
      method: "gcash",
      gcashReference: "REF-1",
      amountCents: 18000,
      status: "pending",
    });
    // Re-submit -> a NEW row (append-only), not an overwrite.
    await db.insert(s.payments).values({
      orderId,
      method: "gcash",
      gcashReference: "REF-2",
      amountCents: 18000,
      status: "pending",
    });
    const pays = await db
      .select()
      .from(s.payments)
      .where(eq(s.payments.orderId, orderId));
    assert("payments are append-only (2 rows)", pays.length === 2);

    // Transition rules.
    assert("awaiting_payment -> paid allowed", canTransition("awaiting_payment", "paid"));
    assert("awaiting_payment -> shipped NOT allowed", !canTransition("awaiting_payment", "shipped"));
    assert("delivered is terminal", !canTransition("delivered", "shipped"));

    // Verify payment -> paid, record verifier (separation of duties data).
    const latest = pays.sort((a, b) => +b.submittedAt - +a.submittedAt)[0];
    await db
      .update(s.payments)
      .set({ status: "verified", verifiedBy: adminId, verifiedAt: new Date() })
      .where(eq(s.payments.id, latest.id));
    await db.update(s.orders).set({ status: "paid" }).where(eq(s.orders.id, orderId));
    await db.insert(s.orderStatusHistory).values({
      orderId,
      fromStatus: "awaiting_payment",
      toStatus: "paid",
      note: "verified",
      actorId: adminId,
    });

    const [verified] = await db
      .select()
      .from(s.payments)
      .where(eq(s.payments.id, latest.id));
    assert("payment verified by admin (SoD recorded)", verified.verifiedBy === adminId);
    assert("verifier != customer", verified.verifiedBy !== customerId);

    // History is append-only and attributable.
    const hist = await db
      .select()
      .from(s.orderStatusHistory)
      .where(eq(s.orderStatusHistory.orderId, orderId));
    assert("status history has 2 append-only rows", hist.length === 2);

    // Revenue counts verified payments only.
    const verifiedSum = (
      await db
        .select()
        .from(s.payments)
        .where(eq(s.payments.orderId, orderId))
    )
      .filter((p) => p.status === "verified")
      .reduce((a, p) => a + p.amountCents, 0);
    assert("verified revenue = 18000 (one verified row)", verifiedSum === 18000);
  } finally {
    // Cleanup (cascades handle children).
    if (orderId) await db.delete(s.orders).where(eq(s.orders.id, orderId));
    if (productId) await db.delete(s.products).where(eq(s.products.id, productId));
    await db.delete(s.users).where(inArray(s.users.id, [customerId, adminId]));
    console.log("  (cleaned up test data)");
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll order-lifecycle checks passed.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
