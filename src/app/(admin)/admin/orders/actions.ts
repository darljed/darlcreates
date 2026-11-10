"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { shipments, users } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import type { OrderStatus } from "@/lib/orders";
import { rejectPayment, saveShipment, transitionOrder, verifyPayment } from "@/lib/order-service";
import { sendEmail, orderEmails } from "@/lib/email";

type Result = { ok: true } | { ok: false; error: string };

async function emailFor(userId: string): Promise<string | null> {
  const [u] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u?.email ?? null;
}

const verifySchema = z.object({ paymentId: z.string().uuid() });

/** Thin wrapper: admin guard -> service (transactional, race-safe) -> revalidate + email. */
export async function verifyPaymentAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = verifySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const res = await verifyPayment(admin.id, parsed.data.paymentId);
  if (!res.ok) return res;

  revalidatePath("/admin/payments");
  revalidatePath("/admin/orders");
  revalidatePath(`/orders/${res.orderNo}`);
  const email = await emailFor(res.customerId);
  if (email) {
    const m = orderEmails.paymentVerified(res.orderNo);
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

  const res = await rejectPayment(admin.id, parsed.data.paymentId, parsed.data.reason);
  if (!res.ok) return res;

  revalidatePath("/admin/payments");
  revalidatePath(`/orders/${res.orderNo}`);
  const email = await emailFor(res.customerId);
  if (email) {
    const m = orderEmails.paymentRejected(res.orderNo, parsed.data.reason);
    await sendEmail(email, m.subject, m.text);
  }
  return { ok: true };
}

const transitionSchema = z.object({
  orderId: z.string().uuid(),
  to: z.enum(["awaiting_payment", "paid", "in_production", "ready_to_ship", "shipped", "delivered", "cancelled", "refunded"]),
  note: z.string().max(200).optional().default(""),
});

export async function transitionOrderAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = transitionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const res = await transitionOrder(admin.id, parsed.data.orderId, parsed.data.to as OrderStatus, parsed.data.note);
  if (!res.ok) return res;

  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath(`/orders/${res.orderNo}`);

  if (parsed.data.to === "shipped") {
    const [ship] = await db.select().from(shipments).where(eq(shipments.orderId, parsed.data.orderId)).limit(1);
    const email = await emailFor(res.customerId);
    if (email) {
      const m = orderEmails.shipped(res.orderNo, ship?.carrier || "courier", ship?.trackingNo || "N/A");
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

  const res = await saveShipment(parsed.data.orderId, parsed.data);
  if (!res.ok) return res;
  revalidatePath(`/admin/orders/${parsed.data.orderId}`);
  revalidatePath(`/orders/${res.orderNo}`);
  return { ok: true };
}
