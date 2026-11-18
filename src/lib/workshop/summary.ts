/**
 * The numbers for the admin dashboard's Workshop panel: stock value and what is running low, profit from manual sales, and
 * profit on the online orders that have a saved cost. Windows follow the Philippine calendar (UTC+8). Server only.
 */
import { and, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { orders, payments } from "@/db/schema";
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
  const [partList, ...rest] = await Promise.all([
    listPartsWithCost(),
    ...wins.map(async (w) => ({ label: w.label, manual: await salesSummary(w.from, to), online: await onlineWindow(w.from, to) })),
  ]);
  return {
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
