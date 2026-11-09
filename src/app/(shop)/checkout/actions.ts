"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import {
  orders,
  orderItems,
  orderStatusHistory,
  cartItems,
  payments,
} from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getProductById } from "@/lib/catalog";
import { getOrCreateCart, getCartLines, cartSubtotalCents } from "@/lib/cart";
import { generateOrderNo } from "@/lib/orders";
import { computeUnitPrice } from "@/lib/pricing";
import { parsePesoInput } from "@/lib/money";
import type { ConfigSelection } from "@/lib/pricing";

const addressSchema = z.object({
  recipient: z.string().min(2).max(120),
  phone: z.string().min(7).max(20),
  line1: z.string().min(3).max(200),
  line2: z.string().max(200).optional().default(""),
  barangay: z.string().max(120).optional().default(""),
  city: z.string().min(2).max(120),
  province: z.string().min(2).max(120),
  postalCode: z.string().max(10).optional().default(""),
});

/** Flat shipping fee for v1 (manual). ponytail: upgrade path = region table. */
const FLAT_SHIPPING_CENTS = 8000; // ₱80.00

/**
 * Place an order from the user's cart. Recomputes every line price from the
 * live product schema (never trusts cart snapshots for money), writes immutable
 * order-item snapshots, records the initial status history, and clears the cart.
 */
export async function placeOrderAction(formData: FormData) {
  const user = await requireUser();

  const parsed = addressSchema.safeParse({
    recipient: formData.get("recipient"),
    phone: formData.get("phone"),
    line1: formData.get("line1"),
    line2: formData.get("line2") ?? "",
    barangay: formData.get("barangay") ?? "",
    city: formData.get("city"),
    province: formData.get("province"),
    postalCode: formData.get("postalCode") ?? "",
  });
  if (!parsed.success) {
    throw new Error("Please complete the shipping address.");
  }

  const lines = await getCartLines(user.id);
  if (lines.length === 0) throw new Error("Your cart is empty.");

  // Re-validate + recompute each line authoritatively.
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
      throw new Error(`"${line.productName}" is no longer available.`);
    }
    const { unitPriceCents, errors } = computeUnitPrice(
      product.basePriceCents,
      product.options,
      line.config,
    );
    if (errors.length) {
      throw new Error(`"${product.name}": ${errors[0]}`);
    }
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
  const shipping = FLAT_SHIPPING_CENTS;
  const total = subtotal + shipping;
  const orderNo = generateOrderNo();

  await db.transaction(async (tx) => {
    const [order] = await tx
      .insert(orders)
      .values({
        orderNo,
        userId: user.id,
        status: "awaiting_payment",
        subtotalCents: subtotal,
        shippingCents: shipping,
        totalCents: total,
        shipAddress: parsed.data,
      })
      .returning();

    await tx.insert(orderItems).values(
      resolved.map((r) => ({
        orderId: order.id,
        productId: r.productId,
        nameSnapshot: r.name,
        qty: r.qty,
        config: r.config,
        unitPriceCents: r.unitPriceCents,
        stlKeySnapshot: r.stlKey,
      })),
    );

    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: null,
      toStatus: "awaiting_payment",
      note: "Order placed",
      actorId: user.id,
    });

    // Clear the cart.
    const cartId = await getOrCreateCart(user.id);
    await tx.delete(cartItems).where(eq(cartItems.cartId, cartId));
  });

  revalidatePath("/cart");
  revalidatePath("/orders");
  redirect(`/orders/${orderNo}`);
}

const paymentSchema = z.object({
  orderNo: z.string().min(3),
  reference: z.string().min(4).max(40),
  amount: z.string().min(1),
});

type Result = { ok: true } | { ok: false; error: string };

/**
 * Customer submits a GCash reference against an awaiting_payment order.
 * Append-only: a new pending payment row is inserted (never overwrites).
 */
export async function submitPaymentAction(input: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid payment details" };

  const amountCents = parsePesoInput(parsed.data.amount);
  if (amountCents === null) return { ok: false, error: "Invalid amount" };

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.orderNo, parsed.data.orderNo))
    .limit(1);
  if (!order || order.userId !== user.id) {
    return { ok: false, error: "Order not found" };
  }
  if (order.status !== "awaiting_payment") {
    return { ok: false, error: "This order is no longer awaiting payment" };
  }

  await db.insert(payments).values({
    orderId: order.id,
    method: "gcash",
    gcashReference: parsed.data.reference.trim(),
    amountCents,
    status: "pending",
  });

  revalidatePath(`/orders/${order.orderNo}`);
  return { ok: true };
}
