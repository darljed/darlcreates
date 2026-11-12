import { db } from "@/db";
import { carts, cartItems } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { getProductsByIds } from "./catalog";
import { designOf } from "./clicker/of-product";
import { designSvgDataUri } from "./clicker/server";
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
  /** A picture of the clicker design (a data: URL of an SVG), for a clicker designer line. */
  designUri: string | null;
};

export { summarizeConfig } from "./config-summary";
import { summarizeConfig } from "./config-summary";

export async function getCartLines(userId: string): Promise<CartLine[]> {
  // ONE round: the lines and every product they use (as a subquery), so the page waits for a single database trip
  const mine = db
    .select({ id: cartItems.productId })
    .from(cartItems)
    .innerJoin(carts, eq(cartItems.cartId, carts.id))
    .where(eq(carts.userId, userId));
  const [items, productsById] = await Promise.all([
    db.select({ item: cartItems }).from(cartItems).innerJoin(carts, eq(cartItems.cartId, carts.id)).where(eq(carts.userId, userId)),
    getProductsByIds(mine),
  ]);
  const rows = items.map((r) => r.item);

  return Promise.all(
    rows.flatMap((it) => {
      const product = productsById.get(it.productId);
      if (!product) return []; // product removed — skip stale line
      const config = (it.config ?? {}) as ConfigSelection;
      return [
        Promise.all([readUrl(it.imageKey), designPicture(product.options, config)]).then(
          ([uploadUrl, designUri]): CartLine => ({
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
            uploadUrl,
            designUri,
          }),
        ),
      ];
    }),
  );
}

/** The small picture of a clicker design, or null for any other line. */
export async function designPicture(options: Parameters<typeof designOf>[0], config: ConfigSelection): Promise<string | null> {
  const d = designOf(options, config);
  return d ? designSvgDataUri(d.spec) : null;
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
