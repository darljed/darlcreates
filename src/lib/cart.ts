import { db } from "@/db";
import { carts, cartItems } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getProductById } from "./catalog";
import { fileUrl, readUrl } from "./storage";
import type { ConfigSelection } from "./pricing";

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
  /** The customer's own uploaded artwork (signed, short-lived), if any. */
  uploadUrl: string | null;
};

export { summarizeConfig } from "./config-summary";
import { summarizeConfig } from "./config-summary";

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
      uploadUrl: await readUrl(it.imageKey),
    });
  }
  return lines;
}

export function cartSubtotalCents(lines: CartLine[]): number {
  return lines.reduce((acc, l) => acc + l.lineTotalCents, 0);
}

/** Total quantity in the user's cart, for the header badge. One cheap aggregate, no joins. */
export async function cartItemCount(userId: string): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`coalesce(sum(${cartItems.qty}), 0)::int` })
    .from(cartItems)
    .innerJoin(carts, eq(cartItems.cartId, carts.id))
    .where(eq(carts.userId, userId));
  return row?.n ?? 0;
}
