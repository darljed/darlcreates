import { db } from "@/db";
import { products, orders, payments, orderItems, users } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { REVENUE_ORDER_FILTER } from "./order-service";

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
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(and(eq(payments.status, "verified"), REVENUE_ORDER_FILTER));

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

export type RevenuePoint = { day: string; cents: number };

/**
 * Verified revenue per PH calendar day for the last `days` days (oldest first, zero-filled).
 * Counts the verification date, on orders that are not cancelled/refunded.
 */
export async function adminRevenueSeries(days = 30): Promise<RevenuePoint[]> {
  const rows = await db
    .select({
      day: sql<string>`to_char((${payments.verifiedAt} at time zone 'Asia/Manila')::date, 'YYYY-MM-DD')`,
      cents: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(and(
      eq(payments.status, "verified"),
      REVENUE_ORDER_FILTER,
      sql`${payments.verifiedAt} >= now() - (${days}::int + 1) * interval '1 day'`,
    ))
    .groupBy(sql`1`);
  const byDay = new Map(rows.map((r) => [r.day, Number(r.cents)]));
  const out: RevenuePoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const day = d.toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    out.push({ day, cents: byDay.get(day) ?? 0 });
  }
  return out;
}

export async function adminRecentOrders(limit = 8) {
  return db
    .select({
      id: orders.id,
      orderNo: orders.orderNo,
      status: orders.status,
      totalCents: orders.totalCents,
      placedAt: orders.placedAt,
      customer: users.name,
    })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .orderBy(desc(orders.placedAt))
    .limit(limit);
}
