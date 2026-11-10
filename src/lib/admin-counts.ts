import { count, eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments, reviews } from "@/db/schema";

/** Numbers shown as badges in the admin sidebar: things waiting for the owner. */
export async function adminBadgeCounts() {
  const [[pay], [rev], [await_]] = await Promise.all([
    db.select({ n: count() }).from(payments).where(eq(payments.status, "pending")),
    db.select({ n: count() }).from(reviews).where(eq(reviews.approved, false)),
    db.select({ n: count() }).from(orders).where(eq(orders.status, "awaiting_payment")),
  ]);
  return { pendingPayments: pay.n, pendingReviews: rev.n, awaitingPayment: await_.n };
}
