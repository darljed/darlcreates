import { db } from "@/db";
import { products, orders, payments, orderItems } from "@/db/schema";
import { desc, eq, inArray, sql } from "drizzle-orm";

export async function adminListProducts() {
  return db
    .select({
      id: products.id,
      slug: products.slug,
      name: products.name,
      category: products.category,
      basePriceCents: products.basePriceCents,
      status: products.status,
      stlKey: products.stlKey,
    })
    .from(products)
    .orderBy(desc(products.updatedAt));
}

export type PendingPayment = {
  paymentId: string;
  orderId: string;
  orderNo: string;
  reference: string;
  amountCents: number;
  submittedAt: Date;
  proofKey: string | null;
};

export async function adminPendingPayments(): Promise<PendingPayment[]> {
  const rows = await db
    .select({
      paymentId: payments.id,
      orderId: payments.orderId,
      orderNo: orders.orderNo,
      reference: payments.gcashReference,
      amountCents: payments.amountCents,
      submittedAt: payments.submittedAt,
      proofKey: payments.proofKey,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(eq(payments.status, "pending"))
    .orderBy(desc(payments.submittedAt));
  return rows;
}

export async function adminListOrders(status?: string) {
  const base = db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      totalCents: orders.totalCents,
      placedAt: orders.placedAt,
    })
    .from(orders)
    .orderBy(desc(orders.placedAt));
  if (status) {
    return base.where(
      eq(orders.status, status as typeof orders.$inferSelect.status),
    );
  }
  return base;
}

export type DashboardStats = {
  revenueCents: number;
  paidOrders: number;
  awaitingPayment: number;
  inProduction: number;
  shipped: number;
  delivered: number;
  topProducts: { name: string; qty: number }[];
};

/** Revenue counts only VERIFIED payments (the money ledger is the truth). */
export async function adminDashboard(): Promise<DashboardStats> {
  const [rev] = await db
    .select({
      total: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
    })
    .from(payments)
    .where(eq(payments.status, "verified"));

  const statusRows = await db
    .select({ status: orders.status, c: sql<number>`count(*)` })
    .from(orders)
    .groupBy(orders.status);

  const byStatus = (s: string) =>
    Number(statusRows.find((r) => r.status === s)?.c ?? 0);

  const top = await db
    .select({
      name: orderItems.nameSnapshot,
      qty: sql<number>`sum(${orderItems.qty})`,
    })
    .from(orderItems)
    .groupBy(orderItems.nameSnapshot)
    .orderBy(desc(sql`sum(${orderItems.qty})`))
    .limit(5);

  return {
    revenueCents: Number(rev?.total ?? 0),
    paidOrders:
      byStatus("paid") +
      byStatus("in_production") +
      byStatus("ready_to_ship") +
      byStatus("shipped") +
      byStatus("delivered"),
    awaitingPayment: byStatus("awaiting_payment"),
    inProduction: byStatus("in_production"),
    shipped: byStatus("shipped"),
    delivered: byStatus("delivered"),
    topProducts: top.map((t) => ({ name: t.name, qty: Number(t.qty) })),
  };
}
