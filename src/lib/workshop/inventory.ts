/**
 * Inventory: the parts catalog, purchase lots and manual stock adjustments. A part's unit cost is the weighted average
 * over its purchase lots. Server only (used by the admin Server Actions). Money is integer centavos.
 */
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { parts, stockMovements, stockPurchases } from "@/db/schema";
import type { PartWithCost, PurchaseRow } from "./types";
import type { Tx } from "./stock";

export interface PartInput {
  name: string;
  category?: string;
  unit: string;
  reorderLevel?: number;
  notes?: string;
}

/** Weighted-average unit cost in centavos from purchase lots (0 when there is no basis yet). Pure. */
export function weightedAvgUnitCostCents(lots: { totalCostCents: number; qty: number }[]): number {
  let spent = 0, qty = 0;
  for (const l of lots) { spent += l.totalCostCents; qty += l.qty; }
  return qty > 0 ? Math.round(spent / qty) : 0;
}

const clean = (i: PartInput) => ({
  name: i.name.trim(),
  category: i.category?.trim() || null,
  unit: i.unit,
  reorderLevel: i.reorderLevel ?? 0,
  notes: i.notes?.trim() || null,
});

export async function createPart(input: PartInput): Promise<string> {
  const [row] = await db.insert(parts).values(clean(input)).returning({ id: parts.id });
  return row.id;
}

export async function updatePart(id: string, input: PartInput): Promise<void> {
  await db.update(parts).set(clean(input)).where(eq(parts.id, id));
}

/** Deleting a part removes its lots and ledger rows, and takes it out of every product's BOM (they cascade). */
export async function deletePart(id: string): Promise<void> {
  await db.delete(parts).where(eq(parts.id, id));
}

async function recordPurchaseTx(tx: Tx, input: { partId: string; qty: number; totalCostCents: number; supplier?: string; purchasedAt?: Date }): Promise<string> {
  const [lot] = await tx
    .insert(stockPurchases)
    .values({ partId: input.partId, qty: input.qty, totalCostCents: input.totalCostCents, supplier: input.supplier?.trim() || null, purchasedAt: input.purchasedAt ?? new Date() })
    .returning({ id: stockPurchases.id });
  await tx.insert(stockMovements).values({ partId: input.partId, delta: input.qty, reason: "purchase", refType: "purchase", refId: lot.id });
  await tx.update(parts).set({ qtyOnHand: sql`${parts.qtyOnHand} + ${input.qty}` }).where(eq(parts.id, input.partId));
  return lot.id;
}

/** Record a purchase lot: the lot, a positive ledger row and the part's running quantity, in one transaction. */
export async function recordPurchase(input: { partId: string; qty: number; totalCostCents: number; supplier?: string; purchasedAt?: Date }): Promise<string> {
  return db.transaction((tx) => recordPurchaseTx(tx, input));
}

/** Manual correction (spoilage, opening balance, recount). Give `delta` (+/-) or `setTo` (the real count). */
export async function adjustStock(input: { partId: string; delta?: number; setTo?: number; reason: string }): Promise<void> {
  // NaN or Infinity would be stored in a float column and poison the quantity for good (NaN + x stays NaN).
  if (input.setTo != null && !Number.isFinite(input.setTo)) throw new Error("The new count must be a number");
  if (input.delta != null && !Number.isFinite(input.delta)) throw new Error("The change must be a number");
  return db.transaction(async (tx) => {
    let delta = input.delta ?? 0;
    if (input.setTo != null) {
      const [p] = await tx.select({ q: parts.qtyOnHand }).from(parts).where(eq(parts.id, input.partId)).for("update");
      if (!p) throw new Error("Part not found");
      delta = input.setTo - p.q;
    }
    if (delta === 0) return;
    await tx.insert(stockMovements).values({ partId: input.partId, delta, reason: "adjustment", refType: "adjustment", refId: null, note: input.reason.slice(0, 200) });
    await tx.update(parts).set({ qtyOnHand: sql`${parts.qtyOnHand} + ${delta}` }).where(eq(parts.id, input.partId));
  });
}

async function voidPurchaseTx(tx: Tx, purchaseId: string): Promise<void> {
  const [lot] = await tx.select().from(stockPurchases).where(eq(stockPurchases.id, purchaseId)).for("update");
  if (!lot) throw new Error("Purchase not found");
  await tx.insert(stockMovements).values({ partId: lot.partId, delta: -lot.qty, reason: "purchase-void", refType: "purchase", refId: lot.id });
  await tx.update(parts).set({ qtyOnHand: sql`${parts.qtyOnHand} - ${lot.qty}` }).where(eq(parts.id, lot.partId));
  await tx.delete(stockPurchases).where(eq(stockPurchases.id, purchaseId));
}

/** Void a lot: the lot goes, a reversing row is appended, and the average cost recomputes from the lots that remain. */
export async function voidPurchase(purchaseId: string): Promise<void> {
  return db.transaction((tx) => voidPurchaseTx(tx, purchaseId));
}

/** Edit a lot = void it and record the corrected one in the same transaction, keeping the original date. */
export async function editPurchase(purchaseId: string, next: { qty: number; totalCostCents: number; supplier?: string }): Promise<string> {
  return db.transaction(async (tx) => {
    const [lot] = await tx.select({ partId: stockPurchases.partId, purchasedAt: stockPurchases.purchasedAt }).from(stockPurchases).where(eq(stockPurchases.id, purchaseId)).for("update");
    if (!lot) throw new Error("Purchase not found");
    await voidPurchaseTx(tx, purchaseId);
    return recordPurchaseTx(tx, { partId: lot.partId, qty: next.qty, totalCostCents: next.totalCostCents, supplier: next.supplier, purchasedAt: lot.purchasedAt });
  });
}

/** Weighted-average unit cost (centavos) of every part that has lots, as a map. */
export async function partUnitCosts(): Promise<Map<string, number>> {
  const agg = await db
    .select({
      partId: stockPurchases.partId,
      spent: sql<number>`coalesce(sum(${stockPurchases.totalCostCents}), 0)`,
      qty: sql<number>`coalesce(sum(${stockPurchases.qty}), 0)`,
    })
    .from(stockPurchases)
    .groupBy(stockPurchases.partId);
  return new Map(agg.map((a) => [a.partId, Number(a.qty) > 0 ? Math.round(Number(a.spent) / Number(a.qty)) : 0]));
}

export async function unitCostCents(partId: string): Promise<number> {
  return (await partUnitCosts()).get(partId) ?? 0;
}

/** All parts with their average unit cost, stock value and low-stock flag. */
export async function listPartsWithCost(): Promise<PartWithCost[]> {
  const [rows, costs] = await Promise.all([db.select().from(parts).orderBy(parts.name), partUnitCosts()]);
  return rows.map((p) => {
    const unitCost = costs.get(p.id) ?? 0;
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      unit: p.unit,
      qtyOnHand: p.qtyOnHand,
      reorderLevel: p.reorderLevel,
      notes: p.notes,
      unitCostCents: unitCost,
      stockValueCents: Math.round(unitCost * Math.max(0, p.qtyOnHand)),
      lowStock: p.reorderLevel > 0 && p.qtyOnHand <= p.reorderLevel,
    };
  });
}

/** Purchase history of one part, newest first. */
export async function listPurchases(partId: string): Promise<PurchaseRow[]> {
  const rows = await db.select().from(stockPurchases).where(eq(stockPurchases.partId, partId)).orderBy(desc(stockPurchases.purchasedAt));
  return rows.map((r) => ({ id: r.id, partId: r.partId, qty: r.qty, totalCostCents: r.totalCostCents, supplier: r.supplier, purchasedAt: r.purchasedAt.toISOString() }));
}

/** Recent ledger rows of one part (for the "History" view). */
export async function listMovements(partId: string, limit = 50) {
  const rows = await db.select().from(stockMovements).where(eq(stockMovements.partId, partId)).orderBy(desc(stockMovements.createdAt)).limit(limit);
  return rows.map((r) => ({ id: r.id, delta: r.delta, reason: r.reason, note: r.note, createdAt: r.createdAt.toISOString() }));
}
