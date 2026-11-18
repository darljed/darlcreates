/**
 * The manual sales log: sales taken outside the website (Messenger, in person...), one product per row, with payment and
 * fulfilment status. Money is integer centavos.
 *
 * Stock rule: the product's bill of materials (x quantity) plus the sale's one-off extra parts are used up the first time the
 * sale reaches Packaged or Delivered (`deductedAt` guards against doing it twice). Moving it back to For Processing, to
 * Cancelled, or deleting it gives the stock back exactly (ledger reversal, see stock.ts). Editing the quantity, product or extras
 * of a sale that has used stock re-balances it.
 */
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { manualSales } from "@/db/schema";
import { bomNeeds } from "./costing";
import { consumeStock, restockFromLedger, saleRef, type Tx } from "./stock";
import type { PaymentStatus, SaleExtraPart, SaleRow, SaleStatus } from "./types";

const CONSUMED: SaleStatus[] = ["Packaged", "Delivered"];

export interface SaleInput {
  saleDate: Date;
  productId: string | null;
  product: string;
  quantity: number;
  pricePerItemCents: number;
  unitCostCents: number;
  extraParts: SaleExtraPart[];
  paymentStatus: PaymentStatus;
  modeOfPayment?: string;
  status: SaleStatus;
  deliveryDetails?: string;
  contact?: string;
  details?: string;
}

async function consumeForSale(tx: Tx, id: string, productId: string | null, qty: number, extras: SaleExtraPart[]) {
  const needed = productId ? await bomNeeds(tx, productId, qty) : new Map<string, number>();
  for (const e of extras) if (e.partId && e.qty > 0) needed.set(e.partId, (needed.get(e.partId) ?? 0) + e.qty);
  await consumeStock(tx, saleRef(id), needed);
}

/** A stable key for what a sale draws from stock (product, quantity and extras). */
const drawKey = (productId: string | null, qty: number, extras: SaleExtraPart[]) =>
  `${productId ?? "-"}|${qty}|${extras.map((e) => `${e.partId}:${e.qty}`).sort().join(",")}`;

const fields = (i: SaleInput) => ({
  saleDate: i.saleDate,
  productId: i.productId,
  product: i.product.trim(),
  quantity: i.quantity,
  pricePerItemCents: i.pricePerItemCents,
  totalCents: i.pricePerItemCents * i.quantity,
  unitCostCents: i.unitCostCents,
  extraParts: i.extraParts,
  paymentStatus: i.paymentStatus,
  modeOfPayment: i.modeOfPayment?.trim() || null,
  status: i.status,
  deliveryDetails: i.deliveryDetails?.trim() || null,
  contact: i.contact?.trim() || null,
  details: i.details?.trim() || null,
});

export async function createSale(input: SaleInput): Promise<string> {
  return db.transaction(async (tx) => {
    const consumed = CONSUMED.includes(input.status);
    const [row] = await tx
      .insert(manualSales)
      .values({
        ...fields(input),
        deductedAt: consumed ? new Date() : null,
        // created already Paid: paid on its own date (a spreadsheet row, or a same-day sale)
        paidAt: input.paymentStatus === "Paid" ? input.saleDate : null,
      })
      .returning({ id: manualSales.id });
    if (consumed) await consumeForSale(tx, row.id, input.productId, input.quantity, input.extraParts);
    return row.id;
  });
}

export async function updateSale(id: string, input: SaleInput): Promise<void> {
  return db.transaction(async (tx) => {
    // lock the row: two quick updates (a double-clicked drag) must not both read the same deductedAt
    const [existing] = await tx.select().from(manualSales).where(eq(manualSales.id, id)).for("update");
    if (!existing) throw new Error("Sale not found");
    const wasDeducted = existing.deductedAt != null;
    const willConsume = CONSUMED.includes(input.status);
    // paid date: "now" on the flip to Paid, kept while it stays Paid, cleared when it leaves Paid
    const paidAt = input.paymentStatus !== "Paid" ? null : existing.paymentStatus === "Paid" ? existing.paidAt : new Date();
    let deductedAt = existing.deductedAt;
    const oldExtras = (existing.extraParts ?? []) as SaleExtraPart[];

    if (!wasDeducted && willConsume) {
      await consumeForSale(tx, id, input.productId, input.quantity, input.extraParts);
      deductedAt = new Date();
    } else if (wasDeducted && !willConsume) {
      await restockFromLedger(tx, saleRef(id));
      deductedAt = null;
    } else if (wasDeducted && willConsume && drawKey(existing.productId, existing.quantity, oldExtras) !== drawKey(input.productId, input.quantity, input.extraParts)) {
      await restockFromLedger(tx, saleRef(id));
      await consumeForSale(tx, id, input.productId, input.quantity, input.extraParts);
    }
    await tx.update(manualSales).set({ ...fields(input), deductedAt, paidAt }).where(eq(manualSales.id, id));
  });
}

export async function deleteSale(id: string): Promise<void> {
  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(manualSales).where(eq(manualSales.id, id)).for("update");
    if (existing?.deductedAt != null) await restockFromLedger(tx, saleRef(id));
    await tx.delete(manualSales).where(eq(manualSales.id, id));
  });
}

/**
 * The cost to save with a sale. A new sale saves today's cost. Once a sale has used stock its cost is real, so an update keeps
 * the saved cost wherever what it prices is unchanged (same product, an extra already on the sale): a status drag or a Paid
 * toggle must not rewrite old profit with today's average cost. Before it has used stock, saving takes the current cost.
 */
export async function snapshotCosts(
  existing: Pick<SaleRow, "productId" | "unitCostCents" | "extraParts" | "deductedAt"> | null,
  productId: string,
  extras: { partId: string; qty: number }[],
  current: { unitCost: () => Promise<number>; partCost: (partId: string) => Promise<number> },
): Promise<{ unitCostCents: number; extraParts: SaleExtraPart[] }> {
  const locked = existing?.deductedAt != null ? existing : null;
  const unitCostCents = locked && locked.productId === productId ? locked.unitCostCents : await current.unitCost();
  const had = new Map((locked?.extraParts ?? []).map((e) => [e.partId, e]));
  const extraParts: SaleExtraPart[] = [];
  for (const e of extras) {
    const prior = had.get(e.partId);
    extraParts.push({ partId: e.partId, qty: e.qty, unitCostCents: prior ? prior.unitCostCents : await current.partCost(e.partId) });
  }
  return { unitCostCents, extraParts };
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

function toRow(r: typeof manualSales.$inferSelect): SaleRow {
  return {
    id: r.id,
    saleDate: r.saleDate.toISOString(),
    productId: r.productId,
    product: r.product,
    quantity: r.quantity,
    pricePerItemCents: r.pricePerItemCents,
    totalCents: r.totalCents,
    unitCostCents: r.unitCostCents,
    extraParts: (r.extraParts ?? []) as SaleExtraPart[],
    paymentStatus: r.paymentStatus as PaymentStatus,
    modeOfPayment: r.modeOfPayment ?? undefined,
    status: r.status as SaleStatus,
    deliveryDetails: r.deliveryDetails ?? undefined,
    contact: r.contact ?? undefined,
    details: r.details ?? undefined,
    deductedAt: iso(r.deductedAt),
    paidAt: iso(r.paidAt),
    createdAt: r.createdAt.toISOString(),
  };
}

export async function getSale(id: string): Promise<SaleRow | null> {
  const [r] = await db.select().from(manualSales).where(eq(manualSales.id, id)).limit(1);
  return r ? toRow(r) : null;
}

export async function listSales(): Promise<SaleRow[]> {
  const rows = await db.select().from(manualSales).orderBy(desc(manualSales.saleDate), desc(manualSales.createdAt));
  return rows.map(toRow);
}

/** What a paid sale cost to make: unit cost x quantity plus its extra parts. */
export const saleCostCents = (s: { unitCostCents: number; quantity: number; extraParts: SaleExtraPart[] }) =>
  s.unitCostCents * s.quantity + s.extraParts.reduce((t, e) => t + e.unitCostCents * e.qty, 0);

/**
 * Totals over a window. Revenue and profit count PAID sales only. `pending` is the Unpaid total of sales still alive
 * (a cancelled sale is not owed). `basis` picks which date places a sale in the window: the sale date (default) or the day it
 * was marked Paid (older Paid rows without a paid date fall back to the sale date); with "paid", `pending` is the whole open balance.
 */
export async function salesSummary(from: Date, to: Date, basis: "sale" | "paid" = "sale") {
  const dateCol = basis === "paid" ? sql`coalesce(${manualSales.paidAt}, ${manualSales.saleDate})` : manualSales.saleDate;
  const inWindow = and(sql`${dateCol} >= ${from.toISOString()}::timestamp`, sql`${dateCol} < ${to.toISOString()}::timestamp`);
  const rows = await db.select().from(manualSales).where(basis === "paid" ? and(eq(manualSales.paymentStatus, "Paid"), inWindow) : inWindow);
  let revenue = 0, cost = 0, pending = 0, paidCount = 0;
  for (const r of rows) {
    if (r.paymentStatus === "Paid") {
      revenue += r.totalCents;
      cost += saleCostCents({ unitCostCents: r.unitCostCents, quantity: r.quantity, extraParts: (r.extraParts ?? []) as SaleExtraPart[] });
      paidCount += 1;
    } else if (r.paymentStatus === "Unpaid" && r.status !== "Cancelled") pending += r.totalCents;
  }
  if (basis === "paid") {
    const [open] = await db
      .select({ total: sql<number>`coalesce(sum(${manualSales.totalCents}), 0)` })
      .from(manualSales)
      .where(and(eq(manualSales.paymentStatus, "Unpaid"), sql`${manualSales.status} <> 'Cancelled'`));
    pending = Number(open?.total ?? 0);
  }
  return { revenueCents: revenue, costCents: cost, profitCents: revenue - cost, pendingCents: pending, paidCount, count: rows.length };
}
