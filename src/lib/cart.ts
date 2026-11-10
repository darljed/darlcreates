import { db } from "@/db";
import { carts, cartItems } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getProductById } from "./catalog";
import { fileUrl } from "./storage";
import type { ConfigSelection, ProductOptionInput } from "./pricing";

/** Get or create the user's single active cart. */
export async function getOrCreateCart(userId: string): Promise<string> {
  const [existing] = await db
    .select({ id: carts.id })
    .from(carts)
    .where(eq(carts.userId, userId))
    .limit(1);
  if (existing) return existing.id;
  const [created] = await db
    .insert(carts)
    .values({ userId })
    .returning({ id: carts.id });
  return created.id;
}

export type CartLine = {
  id: string;
  productId: string;
  productName: string;
  slug: string;
  qty: number;
  unitPriceCents: number;
  lineTotalCents: number;
  config: ConfigSelection;
  summary: { label: string; value: string }[];
  imageUrl: string | null;
};

/** Human-readable summary of a config snapshot using the product's schema. */
export function summarizeConfig(
  options: ProductOptionInput[],
  config: ConfigSelection,
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const opt of options) {
    const sel = config[opt.id];
    if (!sel) continue;
    if (opt.type === "text" && sel.text) {
      out.push({ label: opt.label, value: sel.text });
    } else if (sel.valueId) {
      const v = opt.values.find((x) => x.id === sel.valueId);
      if (v) out.push({ label: opt.label, value: v.label });
    } else if (sel.imageKey) {
      out.push({ label: opt.label, value: "uploaded image" });
    }
  }
  return out;
}

export async function getCartLines(userId: string): Promise<CartLine[]> {
  const cartId = await getOrCreateCart(userId);
  const items = await db
    .select()
    .from(cartItems)
    .where(eq(cartItems.cartId, cartId));

  const lines: CartLine[] = [];
  for (const it of items) {
    const product = await getProductById(it.productId);
    if (!product) continue; // product removed — skip stale line
    const config = (it.config ?? {}) as ConfigSelection;
    lines.push({
      id: it.id,
      productId: it.productId,
      productName: product.name,
      slug: product.slug,
      qty: it.qty,
      unitPriceCents: it.unitPriceCents,
      lineTotalCents: it.unitPriceCents * it.qty,
      config,
      summary: summarizeConfig(product.options, config),
      imageUrl: fileUrl(product.photos[0]?.key ?? null),
    });
  }
  return lines;
}

export function cartSubtotalCents(lines: CartLine[]): number {
  return lines.reduce((acc, l) => acc + l.lineTotalCents, 0);
}
