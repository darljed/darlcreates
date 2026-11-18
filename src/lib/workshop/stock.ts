/**
 * The stock ledger rules shared by manual sales and online orders. Every change of a part's quantity is an appended row in
 * `stock_movements` (never edited); `parts.qty_on_hand` is kept equal to their sum inside the same transaction.
 *
 * Giving stock back reverses the NET of the thing's own ledger rows per part, rather than recomputing from the current
 * product or BOM. So it is exact after later edits, BOM changes, or a deleted product or part (a deleted part's rows are gone
 * with it, so it is simply skipped).
 */
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { parts, stockMovements } from "@/db/schema";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type StockRef = { refType: "manual_sale" | "order"; refId: string; consumeReason: string; restockReason: string };

export const saleRef = (id: string): StockRef => ({ refType: "manual_sale", refId: id, consumeReason: "sale", restockReason: "sale-restock" });
export const orderRef = (id: string): StockRef => ({ refType: "order", refId: id, consumeReason: "order", restockReason: "order-restock" });

/** Use up `needed` (part id -> quantity). Stock may go below zero: the shop prints first and restocks later, and the ledger shows it. */
export async function consumeStock(tx: Tx, ref: StockRef, needed: Map<string, number>): Promise<void> {
  for (const [partId, amount] of needed) {
    if (!(amount > 0)) continue;
    await tx.insert(stockMovements).values({ partId, delta: -amount, reason: ref.consumeReason, refType: ref.refType, refId: ref.refId });
    await tx.update(parts).set({ qtyOnHand: sql`${parts.qtyOnHand} - ${amount}` }).where(eq(parts.id, partId));
  }
}

/** Give back whatever this thing still holds: per part, the net of its own ledger rows. */
export async function restockFromLedger(tx: Tx, ref: StockRef): Promise<void> {
  const held = await tx
    .select({ partId: stockMovements.partId, net: sql<number>`sum(${stockMovements.delta})` })
    .from(stockMovements)
    .where(and(eq(stockMovements.refType, ref.refType), eq(stockMovements.refId, ref.refId)))
    .groupBy(stockMovements.partId);
  for (const h of held) {
    const net = Number(h.net);
    if (!(net < -1e-9)) continue; // nothing outstanding (tolerates float noise)
    const give = -net;
    await tx.insert(stockMovements).values({ partId: h.partId, delta: give, reason: ref.restockReason, refType: ref.refType, refId: ref.refId });
    await tx.update(parts).set({ qtyOnHand: sql`${parts.qtyOnHand} + ${give}` }).where(eq(parts.id, h.partId));
  }
}
