import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  addresses,
  cartItems,
  orderItems,
  orders,
  orderStatusHistory,
  payments,
  shipments,
} from "@/db/schema";
import { getProductById } from "./catalog";
import { getCartLines, getOrCreateCart } from "./cart";
import { canTransition, generateOrderNo, type OrderStatus } from "./orders";
import { computeUnitPrice, firstImageKey, type ConfigSelection } from "./pricing";
import { shippingCentsFor } from "./shipping";

/**
 * Order business logic with NO framework dependencies (no next/*, no cookies/headers),
 * so Server Actions stay thin and scripts can exercise the real code (gap G-15).
 * Callers are responsible for authentication/authorization and pass the actor in.
 */
export type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

export const addressSchema = z.object({
  recipient: z.string().trim().min(2).max(120),
  phone: z.string().trim().min(7).max(20),
  line1: z.string().trim().min(3).max(200),
  line2: z.string().trim().max(200).optional().default(""),
  barangay: z.string().trim().max(120).optional().default(""),
  city: z.string().trim().min(2).max(120),
  province: z.string().trim().min(2).max(120),
  postalCode: z.string().trim().max(10).optional().default(""),
});
export type ShipAddress = z.infer<typeof addressSchema>;

function isUniqueViolation(err: unknown, constraintLike?: string): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    const o = e as { code?: string; constraint_name?: string; constraint?: string; cause?: unknown };
    if (o.code === "23505") {
      return !constraintLike || (o.constraint_name ?? o.constraint ?? "").includes(constraintLike);
    }
    e = o.cause;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Place order
// ---------------------------------------------------------------------------

/**
 * Place an order from the user's cart. Recomputes every line price from the live product
 * schema (never trusts cart snapshots for money), writes immutable order-item snapshots,
 * records the first status-history row and clears the cart, all in one transaction.
 * Optionally saves the address to the user's address book.
 */
export async function placeOrder(
  userId: string,
  addressInput: unknown,
  opts: { saveAddress?: boolean } = {},
): Promise<Result<{ orderNo: string; totalCents: number }>> {
  const addr = addressSchema.safeParse(addressInput);
  if (!addr.success) return { ok: false, error: "Please complete the shipping address." };

  const lines = await getCartLines(userId);
  if (lines.length === 0) return { ok: false, error: "Your cart is empty." };

  const resolved: {
    productId: string;
    name: string;
    qty: number;
    config: ConfigSelection;
    unitPriceCents: number;
    stlKey: string | null;
  }[] = [];

  for (const line of lines) {
    const product = await getProductById(line.productId);
    if (!product || product.status !== "published") {
      return { ok: false, error: `"${line.productName}" is no longer available.` };
    }
    const { unitPriceCents, errors } = computeUnitPrice(
      product.basePriceCents,
      product.options,
      line.config,
    );
    if (errors.length) return { ok: false, error: `"${product.name}": ${errors[0]}` };
    resolved.push({
      productId: product.id,
      name: product.name,
      qty: line.qty,
      config: line.config,
      unitPriceCents,
      stlKey: product.stlKey,
    });
  }

  const subtotal = resolved.reduce((a, r) => a + r.unitPriceCents * r.qty, 0);
  const shipping = shippingCentsFor(subtotal);
  const total = subtotal + shipping;

  for (let attempt = 0; attempt < 5; attempt++) {
    const orderNo = generateOrderNo();
    try {
      await db.transaction(async (tx) => {
        const [order] = await tx
          .insert(orders)
          .values({
            orderNo,
            userId,
            status: "awaiting_payment",
            subtotalCents: subtotal,
            shippingCents: shipping,
            totalCents: total,
            shipAddress: addr.data,
          })
          .returning();

        await tx.insert(orderItems).values(
          resolved.map((r) => ({
            orderId: order.id,
            productId: r.productId,
            nameSnapshot: r.name,
            qty: r.qty,
            config: r.config,
            imageKey: firstImageKey(r.config),
            unitPriceCents: r.unitPriceCents,
            stlKeySnapshot: r.stlKey,
          })),
        );

        await tx.insert(orderStatusHistory).values({
          orderId: order.id,
          fromStatus: null,
          toStatus: "awaiting_payment",
          note: "Order placed",
          actorId: userId,
        });

        const cartId = await getOrCreateCart(userId);
        await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));

        if (opts.saveAddress) await saveAddressTx(tx, userId, addr.data);
      });
      return { ok: true, orderNo, totalCents: total };
    } catch (err) {
      if (isUniqueViolation(err, "order_no")) continue; // astronomically rare: pick a new number
      throw err;
    }
  }
  return { ok: false, error: "Could not allocate an order number. Please try again." };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Insert an address unless an identical one is already saved; first one becomes the default. */
async function saveAddressTx(tx: Tx, userId: string, a: ShipAddress) {
  const existing = await tx.select().from(addresses).where(eq(addresses.userId, userId));
  const dup = existing.find(
    (x) =>
      x.recipient === a.recipient && x.phone === a.phone && x.line1 === a.line1 &&
      x.line2 === a.line2 && x.city === a.city && x.province === a.province,
  );
  if (dup) return;
  if (existing.length >= 10) return; // keep the book small; ignore extras silently
  await tx.insert(addresses).values({
    userId,
    label: existing.length === 0 ? "Home" : `Address ${existing.length + 1}`,
    recipient: a.recipient,
    phone: a.phone,
    line1: a.line1,
    line2: a.line2,
    barangay: a.barangay,
    city: a.city,
    province: a.province,
    postalCode: a.postalCode,
    isDefault: existing.length === 0 ? 1 : 0,
  });
}

// ---------------------------------------------------------------------------
// Payments (GCash, manual verification)
// ---------------------------------------------------------------------------

/** Canonical form of a GCash reference: trimmed, spaces removed, upper-cased. */
export function normalizeReference(ref: string): string {
  return ref.replace(/\s+/g, "").toUpperCase();
}

const referenceSchema = z
  .string()
  .transform(normalizeReference)
  .pipe(z.string().regex(/^[A-Z0-9-]{6,32}$/, "Enter the reference number exactly as shown in GCash"));

/**
 * Customer submits a GCash reference for their own awaiting_payment order.
 * The amount is ALWAYS the order total from the database; the browser's value is
 * not accepted (gap G-07). Append-only: always a new row. DB indexes guarantee one
 * pending payment per order and a reference that backs at most one live payment.
 */
export async function submitGcashReference(
  userId: string,
  orderNo: string,
  referenceInput: string,
): Promise<Result<{ orderNo: string }>> {
  const ref = referenceSchema.safeParse(referenceInput);
  if (!ref.success) return { ok: false, error: ref.error.issues[0]?.message ?? "Invalid reference" };

  const [order] = await db.select().from(orders).where(eq(orders.orderNo, orderNo)).limit(1);
  if (!order || order.userId !== userId) return { ok: false, error: "Order not found" };
  if (order.status !== "awaiting_payment") {
    return { ok: false, error: "This order is no longer awaiting payment" };
  }

  try {
    await db.insert(payments).values({
      orderId: order.id,
      method: "gcash",
      gcashReference: ref.data,
      amountCents: order.totalCents,
      status: "pending",
    });
  } catch (err) {
    if (isUniqueViolation(err, "one_pending_per_order")) {
      return { ok: false, error: "A payment for this order is already awaiting verification." };
    }
    if (isUniqueViolation(err, "active_reference")) {
      return { ok: false, error: "This reference number was already submitted. Check it and try again." };
    }
    throw err;
  }
  return { ok: true, orderNo: order.orderNo };
}

/**
 * Admin verifies a pending payment. All checks and writes happen in ONE transaction with
 * row locks, so two concurrent clicks cannot both succeed. Rules: the payer cannot verify
 * their own order (separation of duties); only an awaiting_payment order can become paid
 * (a payment on a cancelled/refunded order must be rejected, not verified).
 */
export async function verifyPayment(
  adminId: string,
  paymentId: string,
): Promise<Result<{ orderNo: string; customerId: string }>> {
  return db.transaction(async (tx) => {
    const [pay] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!pay) return { ok: false as const, error: "Payment not found" };
    if (pay.status !== "pending") return { ok: false as const, error: "Already resolved" };

    const [order] = await tx.select().from(orders).where(eq(orders.id, pay.orderId)).for("update");
    if (!order) return { ok: false as const, error: "Order not found" };
    if (order.userId === adminId) {
      return { ok: false as const, error: "You cannot verify your own order's payment" };
    }
    if (order.status !== "awaiting_payment") {
      return {
        ok: false as const,
        error: `This order is ${order.status.replace("_", " ")}; reject the payment instead of verifying it.`,
      };
    }
    if (pay.amountCents !== order.totalCents) {
      return { ok: false as const, error: "Payment amount does not match the order total" };
    }

    await tx
      .update(payments)
      .set({ status: "verified", verifiedBy: adminId, verifiedAt: new Date() })
      .where(eq(payments.id, pay.id));
    await tx.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));
    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: "awaiting_payment",
      toStatus: "paid",
      note: `Payment ${pay.gcashReference} verified`,
      actorId: adminId,
    });
    return { ok: true as const, orderNo: order.orderNo, customerId: order.userId };
  });
}

export async function rejectPayment(
  adminId: string,
  paymentId: string,
  reason: string,
): Promise<Result<{ orderNo: string; customerId: string }>> {
  const why = reason.trim();
  if (why.length < 2) return { ok: false, error: "A reason is required" };
  return db.transaction(async (tx) => {
    const [pay] = await tx.select().from(payments).where(eq(payments.id, paymentId)).for("update");
    if (!pay) return { ok: false as const, error: "Payment not found" };
    if (pay.status !== "pending") return { ok: false as const, error: "Already resolved" };
    const [order] = await tx.select().from(orders).where(eq(orders.id, pay.orderId));
    if (!order) return { ok: false as const, error: "Order not found" };

    await tx
      .update(payments)
      .set({ status: "rejected", verifiedBy: adminId, verifiedAt: new Date(), rejectReason: why })
      .where(eq(payments.id, pay.id));
    return { ok: true as const, orderNo: order.orderNo, customerId: order.userId };
  });
}

// ---------------------------------------------------------------------------
// Status transitions + shipping
// ---------------------------------------------------------------------------

/**
 * Admin moves an order forward. The current status is read under a row lock inside the
 * transaction, so concurrent updates cannot skip or double-apply a transition.
 * Moving to `paid` is only possible through verifyPayment (the ledger is the truth).
 */
export async function transitionOrder(
  adminId: string,
  orderId: string,
  to: OrderStatus,
  note = "",
): Promise<Result<{ orderNo: string; customerId: string; from: OrderStatus }>> {
  if (to === "paid") {
    return { ok: false, error: "Orders become paid only by verifying a payment." };
  }
  return db.transaction(async (tx) => {
    const [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update");
    if (!order) return { ok: false as const, error: "Order not found" };
    const from = order.status as OrderStatus;
    if (!canTransition(from, to)) {
      return { ok: false as const, error: `Cannot move ${from} → ${to}` };
    }
    await tx.update(orders).set({ status: to }).where(eq(orders.id, order.id));
    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: from,
      toStatus: to,
      note: note.slice(0, 200),
      actorId: adminId,
    });
    return { ok: true as const, orderNo: order.orderNo, customerId: order.userId, from };
  });
}

export async function saveShipment(
  orderId: string,
  data: { carrier: string; trackingNo: string; status: string },
): Promise<Result<{ orderNo: string }>> {
  const [order] = await db.select().from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!order) return { ok: false, error: "Order not found" };
  const [existing] = await db
    .select({ id: shipments.id })
    .from(shipments)
    .where(eq(shipments.orderId, orderId))
    .limit(1);
  const values = { carrier: data.carrier, trackingNo: data.trackingNo, status: data.status };
  if (existing) {
    await db.update(shipments).set({ ...values, updatedAt: new Date() }).where(eq(shipments.id, existing.id));
  } else {
    await db.insert(shipments).values({ orderId, ...values });
  }
  return { ok: true, orderNo: order.orderNo };
}

/** Revenue counts verified payments on orders that were not cancelled or refunded. */
export const REVENUE_ORDER_FILTER = sql`${orders.status} not in ('cancelled', 'refunded')`;
