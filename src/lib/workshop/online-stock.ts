/**
 * Stock for online orders. When an order enters production its items' bills of materials are used up (and the cost of making
 * them is saved on the order as `cogs_cents`, for profit reporting). Cancelling gives the stock back exactly. Items whose
 * product has no BOM and no print cost (for example the designer services) use nothing and add no cost.
 * Both functions run inside the caller's transaction (the order's status change), so the status and the stock never disagree.
 */
import { eq } from "drizzle-orm";
import { orderItems, orders } from "@/db/schema";
import { bomNeeds, listProductCosting } from "./costing";
import { consumeStock, orderRef, restockFromLedger, type Tx } from "./stock";

export async function consumeOnlineOrderStock(tx: Tx, orderId: string): Promise<void> {
  const items = await tx.select({ productId: orderItems.productId, qty: orderItems.qty }).from(orderItems).where(eq(orderItems.orderId, orderId));
  const costing = new Map((await listProductCosting()).map((p) => [p.id, p]));
  const needed = new Map<string, number>();
  let cogs = 0;
  let costed = false;
  for (const it of items) {
    const p = costing.get(it.productId);
    if (!p || (p.bom.length === 0 && p.printCostCents === 0)) continue;
    costed = true;
    cogs += p.unitCostCents * it.qty;
    for (const [partId, qty] of await bomNeeds(tx, it.productId, it.qty)) needed.set(partId, (needed.get(partId) ?? 0) + qty);
  }
  await consumeStock(tx, orderRef(orderId), needed);
  await tx.update(orders).set({ stockDeductedAt: new Date(), cogsCents: costed ? Math.round(cogs) : null }).where(eq(orders.id, orderId));
}

export async function restockOnlineOrder(tx: Tx, orderId: string): Promise<void> {
  await restockFromLedger(tx, orderRef(orderId));
  await tx.update(orders).set({ stockDeductedAt: null, cogsCents: null }).where(eq(orders.id, orderId));
}
