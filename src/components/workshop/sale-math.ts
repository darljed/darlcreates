import type { SaleRow, SaleStatus } from "@/lib/workshop/types";

/**
 * Client-safe sale arithmetic and the sale-to-payload mapping shared by the off-site sales views
 * (`saleCostCents` in lib/workshop/sales.ts imports the database, so it cannot be used in the browser).
 */
export function saleCost(s: SaleRow): number {
  return Math.round(s.unitCostCents * s.quantity + s.extraParts.reduce((t, e) => t + e.unitCostCents * e.qty, 0));
}

export const saleProfit = (s: SaleRow): number => s.totalCents - saleCost(s);

/** The payload `updateSaleAction` expects for an existing sale, with an optional new status. */
export function salePayload(s: SaleRow, status: SaleStatus = s.status) {
  return {
    saleDate: s.saleDate,
    productId: s.productId ?? "",
    quantity: s.quantity,
    pricePerItemPesos: s.pricePerItemCents / 100,
    extraParts: s.extraParts.map((e) => ({ partId: e.partId, qty: e.qty })),
    paymentStatus: s.paymentStatus,
    modeOfPayment: s.modeOfPayment || undefined,
    status,
    deliveryDetails: s.deliveryDetails || undefined,
    contact: s.contact || undefined,
    details: s.details || undefined,
  };
}

export interface SaleTotals { revenue: number; cost: number; profit: number; owed: number }

/** Summary of the sales shown: cancelled sales are ignored; revenue and profit count only paid (or free) sales. */
export function saleTotals(sales: SaleRow[]): SaleTotals {
  const t: SaleTotals = { revenue: 0, cost: 0, profit: 0, owed: 0 };
  for (const s of sales) {
    if (s.status === "Cancelled") continue;
    const cost = saleCost(s);
    t.cost += cost;
    if (s.paymentStatus === "Unpaid") { t.owed += s.totalCents; continue; }
    if (s.paymentStatus === "Paid") t.revenue += s.totalCents;
    t.profit += (s.paymentStatus === "Paid" ? s.totalCents : 0) - cost;
  }
  return t;
}
