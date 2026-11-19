/**
 * The numbers for the admin dashboard's Workshop panel: stock value and what is running low, profit from manual sales, and
 * profit on the online orders that have a saved cost. Windows follow the Philippine calendar (UTC+8). Server only.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { manualSales, orderItems, orders, payments } from "@/db/schema";
import { adminRevenueSeries } from "../admin";
import { REVENUE_ORDER_FILTER } from "../order-service";
import { listPartsWithCost } from "./inventory";
import { salesSummary } from "./sales";

const PH_OFFSET_MS = 8 * 3600_000;
const DAY_MS = 86400_000;

/** Start (as a real instant) of the Philippine day, week (Monday) or month that contains `now`. */
export function phWindowStart(now: Date, unit: "day" | "week" | "month"): Date {
  const ph = new Date(now.getTime() + PH_OFFSET_MS); // its UTC fields read as the Philippine wall clock
  let startPh: number;
  if (unit === "month") startPh = Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), 1);
  else {
    const day = Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), ph.getUTCDate());
    startPh = unit === "day" ? day : day - ((ph.getUTCDay() + 6) % 7) * DAY_MS;
  }
  return new Date(startPh - PH_OFFSET_MS);
}

export type WorkshopSummary = {
  /** Everything ever: revenue (and profit where the cost is known) per source. */
  allTime: { online: { revenueCents: number; costedRevenueCents: number; cogsCents: number }; offsite: { revenueCents: number; profitCents: number; pendingCents: number } };
  partsCount: number;
  inventoryValueCents: number;
  lowStock: { id: string; name: string; unit: string; qtyOnHand: number; reorderLevel: number }[];
  windows: { label: string; manual: { revenueCents: number; profitCents: number; pendingCents: number; count: number }; online: { revenueCents: number; costedRevenueCents: number; cogsCents: number } }[];
};

async function onlineWindow(from: Date, to: Date) {
  const [r] = await db
    .select({
      revenue: sql<number>`coalesce(sum(${payments.amountCents}), 0)`,
      costedRevenue: sql<number>`coalesce(sum(case when ${orders.cogsCents} is not null then ${payments.amountCents} end), 0)`,
      cogs: sql<number>`coalesce(sum(${orders.cogsCents}), 0)`,
    })
    .from(payments)
    .innerJoin(orders, eq(payments.orderId, orders.id))
    .where(and(eq(payments.status, "verified"), REVENUE_ORDER_FILTER, gte(payments.verifiedAt, from), lt(payments.verifiedAt, to)));
  return { revenueCents: Number(r?.revenue ?? 0), costedRevenueCents: Number(r?.costedRevenue ?? 0), cogsCents: Number(r?.cogs ?? 0) };
}

export async function workshopSummary(now = new Date()): Promise<WorkshopSummary> {
  const to = new Date(now.getTime() + 1000);
  const wins = [
    { label: "Today", from: phWindowStart(now, "day") },
    { label: "This week", from: phWindowStart(now, "week") },
    { label: "This month", from: phWindowStart(now, "month") },
  ];
  const [partList, allOnline, allOffsite, ...rest] = await Promise.all([
    listPartsWithCost(),
    onlineWindow(new Date(0), to),
    salesSummary(new Date(0), to),
    ...wins.map(async (w) => ({ label: w.label, manual: await salesSummary(w.from, to), online: await onlineWindow(w.from, to) })),
  ]);
  return {
    allTime: {
      online: allOnline,
      offsite: { revenueCents: allOffsite.revenueCents, profitCents: allOffsite.profitCents, pendingCents: allOffsite.pendingCents },
    },
    partsCount: partList.length,
    inventoryValueCents: partList.reduce((s, p) => s + p.stockValueCents, 0),
    lowStock: partList.filter((p) => p.lowStock).map((p) => ({ id: p.id, name: p.name, unit: p.unit, qtyOnHand: p.qtyOnHand, reorderLevel: p.reorderLevel })),
    windows: rest.map((w) => ({
      label: w.label,
      manual: { revenueCents: w.manual.revenueCents, profitCents: w.manual.profitCents, pendingCents: w.manual.pendingCents, count: w.manual.count },
      online: w.online,
    })),
  };
}

export type SourcePoint = { day: string; onlineCents: number; offsiteCents: number };

/**
 * Revenue per Philippine calendar day for the last `days` days, split by where it came from: online orders (verified payments) and
 * off-site sales (the sales log, Paid, by the day they were paid). Oldest first, zero-filled.
 */
export async function revenueSeriesBySource(days = 30): Promise<SourcePoint[]> {
  const online = await adminRevenueSeries(days);
  const when = sql`coalesce(${manualSales.paidAt}, ${manualSales.saleDate})`;
  const rows = await db
    .select({
      day: sql<string>`to_char((((${when}) at time zone 'UTC') at time zone 'Asia/Manila')::date, 'YYYY-MM-DD')`,
      cents: sql<number>`coalesce(sum(${manualSales.totalCents}), 0)`,
    })
    .from(manualSales)
    .where(and(eq(manualSales.paymentStatus, "Paid"), sql`${when} >= now() - (${days}::int + 1) * interval '1 day'`))
    .groupBy(sql`1`);
  const off = new Map(rows.map((r) => [r.day, Number(r.cents)]));
  return online.map((p) => ({ day: p.day, onlineCents: p.cents, offsiteCents: off.get(p.day) ?? 0 }));
}

export type TopProduct = { name: string; online: number; offsite: number };

/** Best sellers by units, online and off-site together, with how many came from each. Cancelled and refunded are left out. */
export async function topProductsBySource(limit = 5): Promise<TopProduct[]> {
  const [on, off] = await Promise.all([
    db
      .select({ name: orderItems.nameSnapshot, qty: sql<number>`sum(${orderItems.qty})` })
      .from(orderItems)
      .innerJoin(orders, eq(orderItems.orderId, orders.id))
      .where(REVENUE_ORDER_FILTER)
      .groupBy(orderItems.nameSnapshot),
    db
      .select({ name: manualSales.product, qty: sql<number>`sum(${manualSales.quantity})` })
      .from(manualSales)
      .where(sql`${manualSales.status} <> 'Cancelled'`)
      .groupBy(manualSales.product),
  ]);
  const by = new Map<string, TopProduct>();
  for (const r of on) by.set(r.name, { name: r.name, online: Number(r.qty), offsite: 0 });
  for (const r of off) by.set(r.name, { ...(by.get(r.name) ?? { name: r.name, online: 0 }), offsite: Number(r.qty) });
  return [...by.values()].sort((a, b) => b.online + b.offsite - (a.online + a.offsite)).slice(0, limit);
}
