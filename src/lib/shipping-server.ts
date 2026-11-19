/**
 * Server side of shipping: what the items in a cart weigh, and the quote for an address. Reads the product weights and the rate table
 * from the database. Framework-free (scripts and tests use it too). Server only.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { loadPsgcIndex } from "./psgc-server";
import { quoteShipping, type ShippingConfig, type ShippingItem, type ShippingQuote } from "./shipping";
import { loadShippingConfig } from "./site-content-store";

/** Each line's quantity with its product's packed weight (null when the product has none, so the default applies). */
export async function shippingItems(lines: { productId: string; qty: number }[]): Promise<ShippingItem[]> {
  if (lines.length === 0) return [];
  const rows = await db.select({ id: products.id, weightGrams: products.weightGrams }).from(products).where(inArray(products.id, [...new Set(lines.map((l) => l.productId))]));
  const w = new Map(rows.map((r) => [r.id, r.weightGrams]));
  return lines.map((l) => ({ qty: l.qty, weightGrams: w.get(l.productId) ?? null }));
}

/** The quote for sending these items to a province, or null when the province code is not a province. */
export async function quoteFor(provinceCode: string, items: ShippingItem[], subtotalCents: number, cfg?: ShippingConfig): Promise<ShippingQuote | null> {
  const [config, index] = await Promise.all([cfg ?? loadShippingConfig(), loadPsgcIndex()]);
  const province = index.provinces.find((p) => p.code === provinceCode);
  return province ? quoteShipping(config, province, items, subtotalCents) : null;
}
