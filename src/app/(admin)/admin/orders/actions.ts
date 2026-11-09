"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  orders,
  payments,
  shipments,
  orderStatusHistory,
} from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { canTransition, type OrderStatus } from "@/lib/orders";
import { sendEmail, orderEmails } from "@/lib/email";
import { formatPHP } from "@/lib/money";
import { users } from "@/db/schema";

type Result = { ok: true } | { ok: false; error: string };

async function emailFor(userId: string): Promise<string | null> {
  const [u] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u?.email ?? null;
}

const verifySchema = z.object({ paymentId: z.string().uuid() });

/**
 * Verify a pending GCash payment. Separation of duties: the verifying admin is
 * recorded in `verified_by`. Advances the order to `paid` and appends history.
 */
export async function verifyPaymentAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const [pay] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, parsed.data.paymentId))
    .limit(1);
  if (!pay) return { ok: false, error: "Payment not found" };
  if (pay.status !== "pending") return { ok: false, error: "Already resolved" };

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, pay.orderId))
    .limit(1);
  if (!order) return { ok: false, error: "Order not found" };

  // Separation of duties: the payer cannot verify their own payment.
  if (order.userId === admin.id) {
    return { ok: false, error: "You cannot verify your own order's payment" };
  }

  await db.transaction(async (tx) => {
    await tx
      .update(payments)
      .set({ status: "verified", verifiedBy: admin.id, verifiedAt: new Date() })
      .where(eq(payments.id, pay.id));

    if (order.status === "awaiting_payment") {
      await tx.update(orders).set({ status: "paid" }).where(eq(orders.id, order.id));
      await tx.insert(orderStatusHistory).values({
        orderId: order.id,
        fromStatus: "awaiting_payment",
        toStatus: "paid",
        note: `Payment ${pay.gcashReference} verified`,
        actorId: admin.id,
      });
    }
  });

  revalidatePath("/admin/payments");
  revalidatePath("/admin/orders");
  revalidatePath(`/orders/${order.orderNo}`);

  const email = await emailFor(order.userId);
  if (email) {
    const m = orderEmails.paymentVerified(order.orderNo);
    await sendEmail(email, m.subject, m.text);
  }
  return { ok: true };
}

const rejectSchema = z.object({
  paymentId: z.string().uuid(),
  reason: z.string().min(2).max(200),
});

export async function rejectPaymentAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = rejectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "A reason is required" };

  const [pay] = await db
    .select()
    .from(payments)
    .where(eq(payments.id, parsed.data.paymentId))
    .limit(1);
  if (!pay) return { ok: false, error: "Payment not found" };
  if (pay.status !== "pending") return { ok: false, error: "Already resolved" };

  await db
    .update(payments)
    .set({
      status: "rejected",
      verifiedBy: admin.id,
      verifiedAt: new Date(),
      rejectReason: parsed.data.reason,
    })
    .where(eq(payments.id, pay.id));

  const [order] = await db
    .select({ orderNo: orders.orderNo, userId: orders.userId })
    .from(orders)
    .where(eq(orders.id, pay.orderId))
    .limit(1);

  revalidatePath("/admin/payments");
  if (order) {
    revalidatePath(`/orders/${order.orderNo}`);
    const email = await emailFor(order.userId);
    if (email) {
      const m = orderEmails.paymentRejected(order.orderNo, parsed.data.reason);
      await sendEmail(email, m.subject, m.text);
    }
  }
  return { ok: true };
}

const transitionSchema = z.object({
  orderId: z.string().uuid(),
  to: z.enum([
    "awaiting_payment",
    "paid",
    "in_production",
    "ready_to_ship",
    "shipped",
    "delivered",
    "cancelled",
    "refunded",
  ]),
  note: z.string().max(200).optional().default(""),
});

export async function transitionOrderAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const [order] = await db
    .select()
    .from(orders)
    .where(eq(orders.id, parsed.data.orderId))
    .limit(1);
  if (!order) return { ok: false, error: "Order not found" };

  const from = order.status as OrderStatus;
  const to = parsed.data.to as OrderStatus;
  if (!canTransition(from, to)) {
    return { ok: false, error: `Cannot move ${from} → ${to}` };
  }

  await db.transaction(async (tx) => {
    await tx.update(orders).set({ status: to }).where(eq(orders.id, order.id));
    await tx.insert(orderStatusHistory).values({
      orderId: order.id,
      fromStatus: from,
      toStatus: to,
      note: parsed.data.note,
      actorId: admin.id,
    });
  });

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${order.id}`);
  revalidatePath(`/orders/${order.orderNo}`);

  if (to === "shipped") {
    const [ship] = await db
      .select()
      .from(shipments)
      .where(eq(shipments.orderId, order.id))
      .limit(1);
    const email = await emailFor(order.userId);
    if (email) {
      const m = orderEmails.shipped(
        order.orderNo,
        ship?.carrier || "courier",
        ship?.trackingNo || "N/A",
      );
      await sendEmail(email, m.subject, m.text);
    }
  }
  return { ok: true };
}

const shipmentSchema = z.object({
  orderId: z.string().uuid(),
  carrier: z.string().max(80).optional().default(""),
  trackingNo: z.string().max(80).optional().default(""),
  status: z.string().max(80).optional().default(""),
});

export async function saveShipmentAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = shipmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const [existing] = await db
    .select({ id: shipments.id })
    .from(shipments)
    .where(eq(shipments.orderId, parsed.data.orderId))
    .limit(1);

  if (existing) {
    await db
      .update(shipments)
      .set({
        carrier: parsed.data.carrier,
        trackingNo: parsed.data.trackingNo,
        status: parsed.data.status,
        updatedAt: new Date(),
      })
      .where(eq(shipments.id, existing.id));
  } else {
    await db.insert(shipments).values({
      orderId: parsed.data.orderId,
      carrier: parsed.data.carrier,
      trackingNo: parsed.data.trackingNo,
      status: parsed.data.status,
    });
  }

  const [order] = await db
    .select({ orderNo: orders.orderNo })
    .from(orders)
    .where(eq(orders.id, parsed.data.orderId))
    .limit(1);

  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  if (order) revalidatePath(`/orders/${order.orderNo}`);
  return { ok: true };
}
