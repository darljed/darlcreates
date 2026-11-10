import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  accounts,
  addresses,
  carts,
  orderItems,
  orders,
  payments,
  reviews,
  sessions,
  users,
} from "@/db/schema";
import { PRIVACY_VERSION } from "./business";
import { customerPrefix } from "./uploads";
import { deletePrefix, isStorageConfigured } from "./storage";
import type { Result } from "./order-service";

/**
 * RA 10173 (Data Privacy Act) support: consent record, right of access (export) and
 * erasure (anonymize). Framework-free so it can be tested. Order and payment rows are
 * KEPT (business/financial records) but stripped of personal data; this retention is a
 * documented decision (docs/decisions.md D-22), not an oversight.
 */

/** Orders in these states are still being fulfilled: an account can't be deleted under them. */
export const IN_PROGRESS_STATUSES = ["awaiting_payment", "paid", "in_production", "ready_to_ship", "shipped"] as const;

export async function getConsent(userId: string) {
  const [u] = await db
    .select({ consentAt: users.consentAt, consentVersion: users.consentVersion, deletedAt: users.deletedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return u ?? null;
}

export function hasCurrentConsent(c: { consentAt: Date | null; consentVersion: string | null } | null): boolean {
  return Boolean(c?.consentAt) && c?.consentVersion === PRIVACY_VERSION;
}

export async function recordConsent(userId: string): Promise<void> {
  await db
    .update(users)
    .set({ consentAt: new Date(), consentVersion: PRIVACY_VERSION, updatedAt: new Date() })
    .where(eq(users.id, userId));
}

/** Everything we hold about the user, as plain JSON (no auth tokens/secrets). */
export async function exportUserData(userId: string) {
  const [user] = await db
    .select({
      id: users.id, name: users.name, email: users.email, image: users.image, role: users.role,
      createdAt: users.createdAt, consentAt: users.consentAt, consentVersion: users.consentVersion,
    })
    .from(users)
    .where(eq(users.id, userId));
  if (!user) return null;

  const addrs = await db.select().from(addresses).where(eq(addresses.userId, userId));
  const myOrders = await db.select().from(orders).where(eq(orders.userId, userId));
  const orderIds = myOrders.map((o) => o.id);
  const items = orderIds.length ? await db.select().from(orderItems).where(inArray(orderItems.orderId, orderIds)) : [];
  const pays = orderIds.length ? await db.select().from(payments).where(inArray(payments.orderId, orderIds)) : [];
  const myReviews = await db.select().from(reviews).where(eq(reviews.userId, userId));

  return {
    exportedAt: new Date().toISOString(),
    note: "Personal data held by Darl Creates. Order and payment records are retained for business and tax purposes.",
    profile: user,
    addresses: addrs.map((a) => ({
      label: a.label, recipient: a.recipient, phone: a.phone, line1: a.line1, line2: a.line2,
      barangay: a.barangay, city: a.city, province: a.province, postalCode: a.postalCode, isDefault: a.isDefault === 1,
    })),
    orders: myOrders.map((o) => ({
      orderNo: o.orderNo, status: o.status, placedAt: o.placedAt,
      subtotalCents: o.subtotalCents, shippingCents: o.shippingCents, totalCents: o.totalCents,
      shipAddress: o.shipAddress,
      items: items.filter((i) => i.orderId === o.id).map((i) => ({ name: i.nameSnapshot, qty: i.qty, unitPriceCents: i.unitPriceCents, customization: i.config, hasUploadedImage: Boolean(i.imageKey) })),
      payments: pays.filter((p) => p.orderId === o.id).map((p) => ({ method: p.method, reference: p.gcashReference, amountCents: p.amountCents, status: p.status, submittedAt: p.submittedAt })),
    })),
    reviews: myReviews.map((r) => ({ productId: r.productId, rating: r.rating, body: r.body, approved: r.approved, createdAt: r.createdAt })),
  };
}

/**
 * Delete (anonymize) an account. Refused while any order is still in progress. Everything
 * personal is removed or blanked; order/payment rows stay for the books. Idempotent.
 */
export async function deleteAccount(userId: string): Promise<Result<{ removedUploads: number }>> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) return { ok: false, error: "Account not found" };
  if (user.deletedAt) return { ok: true, removedUploads: 0 };
  if (user.role === "admin") return { ok: false, error: "The admin account can't be deleted here." };

  const mine = await db.select({ id: orders.id, status: orders.status, orderNo: orders.orderNo }).from(orders).where(eq(orders.userId, userId));
  const open = mine.filter((o) => (IN_PROGRESS_STATUSES as readonly string[]).includes(o.status));
  if (open.length) {
    return { ok: false, error: `You have ${open.length} order(s) still in progress (${open.map((o) => o.orderNo).join(", ")}). Cancel or wait for delivery first.` };
  }

  await db.transaction(async (tx) => {
    const ids = mine.map((o) => o.id);
    await tx.delete(sessions).where(eq(sessions.userId, userId));
    await tx.delete(accounts).where(eq(accounts.userId, userId));
    await tx.delete(addresses).where(eq(addresses.userId, userId));
    await tx.delete(carts).where(eq(carts.userId, userId)); // cart_items cascade
    await tx.delete(reviews).where(eq(reviews.userId, userId)); // review_photos cascade
    if (ids.length) {
      await tx.update(orders).set({ shipAddress: { redacted: true } }).where(inArray(orders.id, ids));
      await tx.update(orderItems).set({ imageKey: null }).where(inArray(orderItems.orderId, ids));
      await tx.update(payments).set({ proofKey: null }).where(inArray(payments.orderId, ids));
    }
    await tx
      .update(users)
      .set({
        name: "Deleted user",
        email: `deleted-${userId}@deleted.invalid`,
        image: null,
        emailVerified: false,
        deletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));
  });

  // Uploaded artwork lives in S3 under the user's folder; remove it after the DB commit.
  let removedUploads = 0;
  if (isStorageConfigured()) {
    try {
      removedUploads = await deletePrefix(customerPrefix(userId));
    } catch (err) {
      console.error("[privacy] S3 cleanup failed for", userId, err);
    }
  }
  return { ok: true, removedUploads };
}
