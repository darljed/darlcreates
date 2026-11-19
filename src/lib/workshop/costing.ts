/**
 * Product costing: what one unit of a storefront product costs to make. Cost = its bill of materials (each part's quantity x
 * the part's weighted-average cost) + the product's own "print cost" (machine time, labour and failures that are not a stocked
 * part). Also turns an estimate into a product. Server only, except `productFromEstimate` (pure). Money is integer centavos.
 */
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { parts, productParts, products } from "@/db/schema";
import { partUnitCosts } from "./inventory";
import type { BomLineCosted, ProductCosting } from "./types";
import type { Tx } from "./stock";

export interface BomLine {
  partId: string;
  qty: number;
}

/** Pure: cost of a BOM from its lines' unit costs. */
export function bomCostCents(bom: { qty: number; unitCostCents: number }[]): number {
  return Math.round(bom.reduce((s, b) => s + b.unitCostCents * b.qty, 0));
}

/** Pure: how many units the stock on hand could build (null when there is no BOM). */
export function buildableQty(bom: { qty: number; qtyOnHand: number }[]): number | null {
  if (bom.length === 0) return null;
  return Math.max(0, Math.min(...bom.map((b) => (b.qty > 0 ? Math.floor(b.qtyOnHand / b.qty) : 0))));
}

function costOf(p: { id: string; name: string; status: string; basePriceCents: number; printCostCents: number }, bom: BomLineCosted[]): ProductCosting {
  const partsCost = bomCostCents(bom);
  const unitCost = partsCost + p.printCostCents;
  return {
    id: p.id,
    name: p.name,
    status: p.status,
    basePriceCents: p.basePriceCents,
    printCostCents: p.printCostCents,
    bom,
    partsCostCents: partsCost,
    unitCostCents: unitCost,
    marginPct: p.basePriceCents > 0 ? (p.basePriceCents - unitCost) / p.basePriceCents : 0,
    buildableQty: buildableQty(bom),
  };
}

async function loadBom(productIds: string[]): Promise<Map<string, BomLineCosted[]>> {
  const out = new Map<string, BomLineCosted[]>();
  if (productIds.length === 0) return out;
  const [rows, costs] = await Promise.all([
    db
      .select({ productId: productParts.productId, partId: productParts.partId, qty: productParts.qty, partName: parts.name, unit: parts.unit, qtyOnHand: parts.qtyOnHand })
      .from(productParts)
      .innerJoin(parts, eq(parts.id, productParts.partId))
      .where(inArray(productParts.productId, productIds))
      .orderBy(parts.name),
    partUnitCosts(),
  ]);
  for (const r of rows) {
    const list = out.get(r.productId) ?? [];
    list.push({ partId: r.partId, partName: r.partName, qty: r.qty, unit: r.unit, unitCostCents: costs.get(r.partId) ?? 0, qtyOnHand: r.qtyOnHand });
    out.set(r.productId, list);
  }
  return out;
}

/** Costing of every shop product (not the designer services), by name. */
export async function listProductCosting(): Promise<ProductCosting[]> {
  const prods = await db
    .select({ id: products.id, name: products.name, status: products.status, basePriceCents: products.basePriceCents, printCostCents: products.printCostCents })
    .from(products)
    .where(eq(products.isService, false))
    .orderBy(products.name);
  const bom = await loadBom(prods.map((p) => p.id));
  return prods.map((p) => costOf(p, bom.get(p.id) ?? []));
}

export async function getProductCosting(productId: string): Promise<ProductCosting | null> {
  const [p] = await db
    .select({ id: products.id, name: products.name, status: products.status, basePriceCents: products.basePriceCents, printCostCents: products.printCostCents })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  if (!p) return null;
  const bom = await loadBom([p.id]);
  return costOf(p, bom.get(p.id) ?? []);
}

/** What one unit of a product costs to make right now (0 for an unknown product). */
export async function productUnitCostCents(productId: string): Promise<number> {
  return (await getProductCosting(productId))?.unitCostCents ?? 0;
}

/** The parts one unit of a product uses, as part id -> quantity (reads inside a transaction). */
export async function bomNeeds(tx: Tx, productId: string, units: number): Promise<Map<string, number>> {
  const lines = await tx.select({ partId: productParts.partId, qty: productParts.qty }).from(productParts).where(eq(productParts.productId, productId));
  const out = new Map<string, number>();
  for (const l of lines) out.set(l.partId, (out.get(l.partId) ?? 0) + l.qty * units);
  return out;
}

/** Replace a product's print cost and bill of materials. Lines with no quantity are dropped; a part listed twice is summed. */
export async function saveProductCosting(productId: string, input: { printCostCents: number; bom: BomLine[] }): Promise<void> {
  const qtyByPart = new Map<string, number>();
  for (const l of input.bom) if (l.qty > 0) qtyByPart.set(l.partId, (qtyByPart.get(l.partId) ?? 0) + l.qty);
  await db.transaction(async (tx) => {
    await tx.update(products).set({ printCostCents: Math.max(0, Math.round(input.printCostCents)), updatedAt: new Date() }).where(eq(products.id, productId));
    await tx.delete(productParts).where(eq(productParts.productId, productId));
    for (const [partId, qty] of qtyByPart) await tx.insert(productParts).values({ productId, partId, qty });
  });
}

/**
 * Pure: turn an estimate's components and unit cost into a product's costing. Components linked to a part become the BOM;
 * their cost is taken off the total so the rest (machine time, labour, failures, unlinked items) is the print cost. Nothing is
 * counted twice.
 */
export function productFromEstimate(input: {
  totalCostCents: number;
  components: { partId?: string | null; qty: number; unitPriceCents: number }[];
}): { printCostCents: number; bom: BomLine[] } {
  const qtyByPart = new Map<string, number>();
  let partLinkedCost = 0;
  for (const c of input.components) {
    if (c.partId && c.qty > 0) {
      qtyByPart.set(c.partId, (qtyByPart.get(c.partId) ?? 0) + c.qty);
      partLinkedCost += Math.round(c.unitPriceCents * c.qty);
    }
  }
  return { printCostCents: Math.max(0, input.totalCostCents - partLinkedCost), bom: [...qtyByPart].map(([partId, qty]) => ({ partId, qty })) };
}

const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "product";

/** A slug no other product uses ("name", "name-2", ...). */
async function freeSlug(base: string): Promise<string> {
  for (let i = 1; i < 50; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    const [hit] = await db.select({ id: products.id }).from(products).where(eq(products.slug, slug)).limit(1);
    if (!hit) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Create a DRAFT shop product from an estimate: its costing is saved and the selected tier is the price. The owner adds photos and publishes it. */
export async function createProductFromEstimate(input: { name: string; priceCents: number; printCostCents: number; bom: BomLine[] }): Promise<{ id: string; slug: string }> {
  const name = input.name.trim().slice(0, 120);
  const slug = await freeSlug(slugify(name));
  const [row] = await db
    .insert(products)
    .values({ name, slug, basePriceCents: Math.max(0, Math.round(input.priceCents)), status: "draft", description: "" })
    .returning({ id: products.id, slug: products.slug });
  await saveProductCosting(row.id, { printCostCents: input.printCostCents, bom: input.bom });
  return row;
}
