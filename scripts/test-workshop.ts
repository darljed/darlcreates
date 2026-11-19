/**
 * Workshop (estimator, inventory, product costing, manual sales log, online-order stock, dashboard numbers): the pure costing
 * model against the worked example, then the database rules with isolated TEST-WS data that is removed in `finally`: weighted
 * average cost, the append-only ledger staying equal to each part's quantity, a manual sale using and giving back stock,
 * cost snapshots, the paid date, an online order using stock when it enters production and giving it back when cancelled,
 * saved estimates with tags, and product costing.
 * Run: npx tsx scripts/test-workshop.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray, like, sql } from "drizzle-orm";
import { computeCost, DEFAULT_SETTINGS, machineHourRate, perPieceMaterialParts, priceTiers, productUnitPrice, roundUpTo, toDecimalHours, type Job } from "../src/lib/workshop/pricing";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) <= eps;

async function main() {
  // ---------------------------------------------------------------------------------------------------------------
  console.log("\ncosting model (the worked example in docs/workshop.md)");
  const ref: Job = { filamentGrams: 147.91, printHours: toDecimalHours(3, 37), materialPricePerKg: 750, laborMinutes: 20, quantity: 1 };
  const rc = computeCost(ref, DEFAULT_SETTINGS);
  assert("machine hour rate = 5 + 2 + 1.80 = 8.80", near(machineHourRate(DEFAULT_SETTINGS), 8.8));
  assert("material 110.93, machine 31.83, labour 50, failure 5%, cost 202.40", near(rc.material, 110.93) && near(rc.machine, 31.83) && near(rc.labor, 50) && near(rc.unitCost, 202.4, 0.02), JSON.stringify(rc));
  const tiers = priceTiers(rc.totalCost, DEFAULT_SETTINGS.margins, 1, { roundingStep: 5 });
  assert("tiers use margin (divide), rounded up to 5: 290 / 405 / 580", tiers.map((t) => t.rounded).join("/") === "290/405/580", tiers.map((t) => t.rounded).join("/"));
  assert("profit = price - cost", near(tiers[1].profit, 405 - rc.totalCost, 0.02));
  assert("rounding survives float noise (21 / 0.7 = 30, not 35)", roundUpTo(21 / 0.7, 5) === 30);
  const batch = computeCost({ ...ref, quantity: 10, quantityMode: "batch" }, DEFAULT_SETTINGS);
  const perUnit = computeCost({ ...ref, quantity: 10, quantityMode: "per-unit" }, DEFAULT_SETTINGS);
  assert("per-unit mode: ten pieces cost ten times", near(perUnit.totalCost, rc.unitCost * 10, 0.05));
  assert("batch mode: the print is shared, so a piece costs less", batch.unitCost < perUnit.unitCost && near(batch.totalCost, batch.unitCost * 10, 0.05));
  const waste = computeCost({ ...ref, wastePct: 10 }, DEFAULT_SETTINGS);
  assert("waste adds 10% filament cost and grams", near(waste.materialWaste, rc.material * 0.1, 0.01) && near(waste.totalGrams, 147.91 * 1.1, 0.01));
  const fees = computeCost({ ...ref, lineItems: [{ label: "Design", amount: 100, applyMargin: true }, { label: "Courier", amount: 50, applyMargin: false }] }, DEFAULT_SETTINGS);
  const ft = priceTiers(fees.totalCost, DEFAULT_SETTINGS.margins, 1, { roundingStep: 5, passThrough: fees.passThroughLineItems });
  assert("a margin fee is costed, a relay fee is added after margin with no profit", near(fees.totalCost, rc.unitCost + 100, 0.02) && near(ft[1].rounded, roundUpTo(fees.totalCost / 0.5, 5) + 50) && near(ft[1].profit, roundUpTo(fees.totalCost / 0.5, 5) - fees.totalCost, 0.02));
  assert("two material lines on the same part become one product BOM line", (() => {
    const lines = perPieceMaterialParts({ ...ref, materials: [{ partId: "p1", name: "Black", grams: 50, pricePerKg: 750 }, { partId: "p1", name: "Black", grams: 25, pricePerKg: 750 }, { partId: null, name: "PLA", grams: 10, pricePerKg: 750 }], wastePct: 20 });
    return lines.length === 1 && near(lines[0].qty, 75 * 1.2, 1e-9);
  })());
  assert("a product's price comes from per-piece cost and the margin", productUnitPrice(202.4, 0.5, 5) === 405);

  // pure workshop helpers
  const { weightedAvgUnitCostCents } = await import("../src/lib/workshop/inventory");
  assert("weighted average over lots: (1000 + 3000) / (10 + 10) = 200", weightedAvgUnitCostCents([{ totalCostCents: 1000, qty: 10 }, { totalCostCents: 3000, qty: 10 }]) === 200 && weightedAvgUnitCostCents([]) === 0);
  const { productFromEstimate, bomCostCents, buildableQty } = await import("../src/lib/workshop/costing");
  const pf = productFromEstimate({ totalCostCents: 20240, components: [{ partId: "a", qty: 100, unitPriceCents: 75 }, { partId: "a", qty: 50, unitPriceCents: 75 }, { partId: null, qty: 2, unitPriceCents: 1000 }] });
  assert("estimate to product: linked parts become the BOM (merged), the rest is print cost", pf.bom.length === 1 && pf.bom[0].qty === 150 && pf.printCostCents === 20240 - 11250);
  assert("BOM cost and how many can be built", bomCostCents([{ qty: 150, unitCostCents: 75 }]) === 11250 && buildableQty([{ qty: 50, qtyOnHand: 160 }, { qty: 1, qtyOnHand: 2 }]) === 2 && buildableQty([]) === null);
  const { phWindowStart } = await import("../src/lib/workshop/summary");
  // 2026-11-18 23:30 UTC is already 07:30 on the 19th in the Philippines (a Thursday)
  const now = new Date("2026-11-18T23:30:00Z");
  assert("Philippine day, week (Monday) and month windows", phWindowStart(now, "day").toISOString() === "2026-11-18T16:00:00.000Z" && phWindowStart(now, "week").toISOString() === "2026-11-15T16:00:00.000Z" && phWindowStart(now, "month").toISOString() === "2026-10-31T16:00:00.000Z");

  // ---------------------------------------------------------------------------------------------------------------
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const inv = await import("../src/lib/workshop/inventory");
  const costing = await import("../src/lib/workshop/costing");
  const sales = await import("../src/lib/workshop/sales");
  const estimates = await import("../src/lib/workshop/estimates");
  const { transitionOrder } = await import("../src/lib/order-service");
  const { workshopSummary } = await import("../src/lib/workshop/summary");
  const T = `TEST-WS-${Date.now()}`;
  const userId = `${T}-u`, adminId = `${T}-a`;
  const qtyOf = async (id: string) => (await db.select({ q: s.parts.qtyOnHand }).from(s.parts).where(eq(s.parts.id, id)))[0]?.q;
  /** The ledger must always add up to the quantity on hand. */
  const ledgerOk = async (ids: string[]) => {
    for (const id of ids) {
      const [r] = await db.select({ sum: sql<number>`coalesce(sum(${s.stockMovements.delta}), 0)` }).from(s.stockMovements).where(eq(s.stockMovements.partId, id));
      if (!near(Number(r.sum), (await qtyOf(id)) ?? NaN, 1e-6)) return false;
    }
    return true;
  };
  const cleanup = async () => {
    await db.delete(s.orders).where(inArray(s.orders.userId, [userId]));
    await db.delete(s.manualSales).where(like(s.manualSales.product, `${T}%`));
    await db.delete(s.estimates).where(like(s.estimates.title, `${T}%`));
    await db.delete(s.products).where(like(s.products.slug, `${T.toLowerCase()}%`));
    await db.delete(s.parts).where(like(s.parts.name, `${T}%`));
    await db.delete(s.users).where(like(s.users.id, "TEST-WS-%"));
  };
  try {
    await cleanup();
    await db.insert(s.users).values([
      { id: userId, name: "T", email: `${userId}@test.local`, emailVerified: true, role: "customer" },
      { id: adminId, name: "A", email: `${adminId}@test.local`, emailVerified: true, role: "admin" },
    ]);

    console.log("\ninventory: lots, weighted average, ledger");
    const fil = await inv.createPart({ name: `${T} Black PLA`, category: "filament", unit: "g", reorderLevel: 200 });
    const sw = await inv.createPart({ name: `${T} Switch`, category: "switch", unit: "piece", reorderLevel: 2 });
    const lot1 = await inv.recordPurchase({ partId: fil, qty: 1000, totalCostCents: 75000 }); // 75 c/g
    assert("a purchase adds stock and sets the unit cost", (await qtyOf(fil)) === 1000 && (await inv.unitCostCents(fil)) === 75);
    const lot2 = await inv.recordPurchase({ partId: fil, qty: 1000, totalCostCents: 95000 });
    assert("the unit cost is the weighted average of the lots (85 c/g)", (await inv.unitCostCents(fil)) === 85 && (await qtyOf(fil)) === 2000);
    await inv.editPurchase(lot2, { qty: 1000, totalCostCents: 75000 });
    assert("editing a lot re-records it (average back to 75, stock unchanged)", (await inv.unitCostCents(fil)) === 75 && (await qtyOf(fil)) === 2000);
    await inv.recordPurchase({ partId: sw, qty: 10, totalCostCents: 5000 });
    await inv.adjustStock({ partId: sw, setTo: 8, reason: "recount" });
    assert("set-to adjustment writes the difference", (await qtyOf(sw)) === 8);
    let threw = false;
    try { await inv.adjustStock({ partId: sw, setTo: Number.NaN, reason: "x" }); } catch { threw = true; }
    assert("NaN cannot poison the quantity", threw && (await qtyOf(sw)) === 8);
    const listed = (await inv.listPartsWithCost()).find((p) => p.id === sw)!;
    assert("list shows cost, value and the low-stock flag", listed.unitCostCents === 500 && listed.stockValueCents === 4000 && !listed.lowStock);
    await inv.voidPurchase(lot1);
    assert("voiding a lot removes its stock and recomputes the average", (await qtyOf(fil)) === 1000 && (await inv.unitCostCents(fil)) === 75);
    await inv.recordPurchase({ partId: fil, qty: 0, totalCostCents: 0 }).catch(() => undefined);
    assert("the ledger equals the quantity on hand", await ledgerOk([fil, sw]));

    console.log("\nproduct costing");
    const prod = await costing.createProductFromEstimate({ name: `${T} Keychain`, priceCents: 20000, printCostCents: 3000, bom: [{ partId: fil, qty: 20 }, { partId: sw, qty: 1 }] });
    const c1 = (await costing.getProductCosting(prod.id))!;
    assert("a draft product is created from an estimate with its BOM", c1.status === "draft" && c1.bom.length === 2 && c1.basePriceCents === 20000 && prod.slug.startsWith(T.toLowerCase()));
    assert("cost = parts (20 g x 75c + 1 x 500c = 2000c) + print cost 3000c", c1.partsCostCents === 2000 && c1.unitCostCents === 5000 && near(c1.marginPct, 0.75, 1e-9));
    assert("buildable from stock: min(1000/20, 8/1) = 8", c1.buildableQty === 8);
    const dup = await costing.createProductFromEstimate({ name: `${T} Keychain`, priceCents: 100, printCostCents: 0, bom: [] });
    assert("a second product with the same name gets its own slug", dup.slug !== prod.slug);
    await costing.saveProductCosting(prod.id, { printCostCents: 4000, bom: [{ partId: fil, qty: 20 }, { partId: fil, qty: 10 }, { partId: sw, qty: 0 }] });
    const c2 = (await costing.getProductCosting(prod.id))!;
    assert("saving costing replaces the BOM (same part summed, zero lines dropped)", c2.bom.length === 1 && c2.bom[0].qty === 30 && c2.printCostCents === 4000);
    await costing.saveProductCosting(prod.id, { printCostCents: 3000, bom: [{ partId: fil, qty: 20 }, { partId: sw, qty: 1 }] });

    console.log("\nmanual sales: stock used only when Packaged / Delivered");
    const base = { productId: prod.id, product: `${T} Keychain`, pricePerItemCents: 20000, unitCostCents: 5000, extraParts: [] as { partId: string; qty: number; unitCostCents: number }[], paymentStatus: "Unpaid" as const, status: "For Processing" as const, saleDate: new Date() };
    const sale = await sales.createSale({ ...base, quantity: 2 });
    assert("a new sale 'For Processing' uses no stock", (await qtyOf(fil)) === 1000 && (await qtyOf(sw)) === 8 && (await sales.getSale(sale))?.deductedAt === null);
    await sales.updateSale(sale, { ...base, quantity: 2, status: "Packaged", extraParts: [{ partId: sw, qty: 1, unitCostCents: 500 }] });
    assert("Packaged uses the BOM x quantity plus the extra parts (40 g, 3 switches)", (await qtyOf(fil)) === 960 && (await qtyOf(sw)) === 5);
    await sales.updateSale(sale, { ...base, quantity: 2, status: "Delivered", extraParts: [{ partId: sw, qty: 1, unitCostCents: 500 }] });
    assert("Packaged -> Delivered does not use stock twice", (await qtyOf(fil)) === 960 && (await qtyOf(sw)) === 5);
    await sales.updateSale(sale, { ...base, quantity: 3, status: "Delivered", extraParts: [{ partId: sw, qty: 1, unitCostCents: 500 }] });
    assert("changing the quantity of a used sale re-balances (60 g, 4 switches)", (await qtyOf(fil)) === 940 && (await qtyOf(sw)) === 4);
    await sales.updateSale(sale, { ...base, quantity: 3, status: "For Processing", extraParts: [{ partId: sw, qty: 1, unitCostCents: 500 }] });
    assert("moving back below Packaged gives everything back exactly", (await qtyOf(fil)) === 1000 && (await qtyOf(sw)) === 8 && (await sales.getSale(sale))?.deductedAt === null);
    await sales.updateSale(sale, { ...base, quantity: 3, status: "Packaged" });
    await sales.updateSale(sale, { ...base, quantity: 3, status: "Cancelled" });
    assert("cancelling a used sale restocks it", (await qtyOf(fil)) === 1000 && (await qtyOf(sw)) === 8);
    await sales.updateSale(sale, { ...base, quantity: 1, status: "Packaged" });
    await sales.deleteSale(sale);
    assert("deleting a used sale restocks it and removes the row", (await qtyOf(fil)) === 1000 && (await qtyOf(sw)) === 8 && (await sales.getSale(sale)) === null);
    assert("the ledger still equals the quantity on hand", await ledgerOk([fil, sw]));

    console.log("\nmanual sales: cost snapshots, paid date, totals");
    const s2 = await sales.createSale({ ...base, quantity: 1, status: "Packaged", paymentStatus: "Paid" });
    const row2 = (await sales.getSale(s2))!;
    assert("created Paid: paid on its own date; totals are price x quantity", row2.paidAt === row2.saleDate && row2.totalCents === 20000);
    // the average cost of the filament changes after the sale was packaged
    await inv.recordPurchase({ partId: fil, qty: 100, totalCostCents: 100000 });
    const kept = await sales.snapshotCosts(row2, prod.id, [], { unitCost: () => costing.productUnitCostCents(prod.id), partCost: (id) => inv.unitCostCents(id) });
    assert("a sale that used stock keeps its saved cost when the part's average cost changes", kept.unitCostCents === 5000 && (await costing.productUnitCostCents(prod.id)) > 5000);
    const fresh = await sales.snapshotCosts({ ...row2, deductedAt: null }, prod.id, [], { unitCost: () => costing.productUnitCostCents(prod.id), partCost: (id) => inv.unitCostCents(id) });
    assert("a sale that has not used stock takes the current cost", fresh.unitCostCents === (await costing.productUnitCostCents(prod.id)));
    await sales.updateSale(s2, { ...base, quantity: 1, status: "Packaged", paymentStatus: "Unpaid" });
    assert("leaving Paid clears the paid date", (await sales.getSale(s2))?.paidAt === null);
    await sales.updateSale(s2, { ...base, quantity: 1, status: "Packaged", paymentStatus: "Paid" });
    const paidAt1 = (await sales.getSale(s2))!.paidAt!;
    await sales.updateSale(s2, { ...base, quantity: 1, status: "Delivered", paymentStatus: "Paid" });
    assert("the flip to Paid stamps now, and re-saving keeps it", Math.abs(new Date(paidAt1).getTime() - Date.now()) < 60_000 && (await sales.getSale(s2))!.paidAt === paidAt1);
    const s3 = await sales.createSale({ ...base, quantity: 1, status: "For Processing", paymentStatus: "Unpaid" });
    const s4 = await sales.createSale({ ...base, quantity: 1, status: "Cancelled", paymentStatus: "Unpaid" });
    const from = new Date(Date.now() - 3600_000), to = new Date(Date.now() + 3600_000);
    const sum = await sales.salesSummary(from, to);
    assert("revenue counts Paid only; the open balance counts live Unpaid sales and not cancelled ones", sum.revenueCents >= 20000 && sum.profitCents === sum.revenueCents - sum.costCents && sum.pendingCents >= 20000);
    const open = await sales.salesSummary(from, to, "paid");
    assert("by date paid the revenue is the paid sale and the owed total is the whole open balance", open.revenueCents >= 20000 && open.pendingCents >= 20000);
    await sales.deleteSale(s3); await sales.deleteSale(s4);
    await sales.updateSale(s2, { ...base, quantity: 1, status: "For Processing", paymentStatus: "Paid" });

    console.log("\nonline orders: stock when production starts");
    const [order] = await db.insert(s.orders).values({ orderNo: `${T}-1`, userId, status: "paid", subtotalCents: 40000, totalCents: 40000, shipAddress: {} }).returning();
    await db.insert(s.orderItems).values({ orderId: order.id, productId: prod.id, nameSnapshot: "x", qty: 2, unitPriceCents: 20000 });
    const f0 = (await qtyOf(fil))!, w0 = (await qtyOf(sw))!;
    const to1 = await transitionOrder(adminId, order.id, "in_production");
    const [o1] = await db.select().from(s.orders).where(eq(s.orders.id, order.id));
    assert("entering production uses the BOM x quantity and saves the cost", to1.ok && near((await qtyOf(fil))!, f0 - 40) && (await qtyOf(sw)) === w0 - 2 && !!o1.stockDeductedAt && o1.cogsCents === 2 * (2000 + 3000 > 0 ? (await costing.productUnitCostCents(prod.id)) : 0));
    const to2 = await transitionOrder(adminId, order.id, "ready_to_ship");
    assert("later steps use nothing more", to2.ok && near((await qtyOf(fil))!, f0 - 40) && (await qtyOf(sw)) === w0 - 2);
    const to3 = await transitionOrder(adminId, order.id, "cancelled");
    const [o3] = await db.select().from(s.orders).where(eq(s.orders.id, order.id));
    assert("cancelling gives the stock back and clears the saved cost", to3.ok && near((await qtyOf(fil))!, f0) && (await qtyOf(sw)) === w0 && o3.stockDeductedAt === null && o3.cogsCents === null);
    const [order2] = await db.insert(s.orders).values({ orderNo: `${T}-2`, userId, status: "paid", subtotalCents: 20000, totalCents: 20000, shipAddress: {} }).returning();
    const plain = await costing.createProductFromEstimate({ name: `${T} Plain`, priceCents: 5000, printCostCents: 0, bom: [] });
    await db.insert(s.orderItems).values({ orderId: order2.id, productId: plain.id, nameSnapshot: "p", qty: 1, unitPriceCents: 5000 });
    await transitionOrder(adminId, order2.id, "in_production");
    const [o4] = await db.select().from(s.orders).where(eq(s.orders.id, order2.id));
    assert("an item with no BOM and no print cost uses nothing and adds no cost", near((await qtyOf(fil))!, f0) && o4.cogsCents === null && !!o4.stockDeductedAt);
    assert("the ledger still equals the quantity on hand", await ledgerOk([fil, sw]));

    console.log("\nsaved estimates and tags");
    const input = { job: { printH: "3", printM: "37", materials: [], wastePct: "", laborMinutes: "20", quantity: "1", quantityMode: "per-unit" as const }, settings: {}, components: [], lineItems: [], margins: [0.3, 0.5, 0.65] as [number, number, number], selectedTier: 1 };
    const tierRows = tiers.map((t) => ({ ...t }));
    const e1 = await estimates.saveEstimate({ title: `${T} A`, input, tiers: tierRows, totalCostCents: 20240, priceCents: 40500, quantity: 1, tags: ["Keychain", "keychain", "  Rush "] });
    const e2 = await estimates.saveEstimate({ title: `${T} B`, input, tiers: tierRows, totalCostCents: 1000, priceCents: 2000, quantity: 1, tags: ["rush"] });
    assert("tags are trimmed, lower-cased and de-duplicated", (await estimates.getEstimate(e1))?.tags.join(",") === "keychain,rush");
    const both = (await estimates.listEstimates(["RUSH", "keychain"])).filter((e) => e.title?.startsWith(T));
    const one = (await estimates.listEstimates(["rush"])).filter((e) => e.title?.startsWith(T));
    assert("filtering by tags keeps estimates that have ALL of them, case-insensitively", both.length === 1 && both[0].id === e1 && one.length === 2);
    assert("the tag list includes the tags in use", (await estimates.listEstimateTags()).includes("keychain"));
    assert("an estimate can be updated in place", (await estimates.updateEstimate(e2, { title: `${T} B2`, input, tiers: tierRows, totalCostCents: 1500, priceCents: 2500, quantity: 2, tags: [] })) && (await estimates.getEstimate(e2))?.tags.length === 0 && !(await estimates.updateEstimate("00000000-0000-0000-0000-000000000000", { input, tiers: tierRows, totalCostCents: 0, priceCents: 0, quantity: 1, tags: [] })));
    await estimates.deleteEstimate(e1);
    assert("an estimate can be deleted", (await estimates.getEstimate(e1)) === null);

    console.log("\ndeleting a part");
    await inv.deletePart(sw);
    assert("it leaves the BOM and its history goes with it", (await costing.getProductCosting(prod.id))!.bom.length === 1);

    console.log("\ndashboard numbers");
    const sum2 = await workshopSummary();
    assert("the summary has stock value, low stock, three windows", sum2.inventoryValueCents > 0 && Array.isArray(sum2.lowStock) && sum2.windows.length === 3 && sum2.windows[0].label === "Today");
    const { revenueSeriesBySource, topProductsBySource } = await import("../src/lib/workshop/summary");
    const series = await revenueSeriesBySource(30);
    const todayKey = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });
    assert("the 30-day series has one point per day, oldest first, ending today", series.length === 30 && series[29].day === todayKey && series[0].day < series[29].day);
    assert("a paid off-site sale shows under off-site on the day it was paid, not under online", series[29].offsiteCents >= 20000);
    const topAll = await topProductsBySource(500);
    const mine = topAll.find((t) => t.name === `${T} Keychain`);
    assert("top products split units by source (this sale is off-site only)", !!mine && mine.offsite >= 1 && mine.online === 0);
  } finally {
    await cleanup();
  }
  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll workshop checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
