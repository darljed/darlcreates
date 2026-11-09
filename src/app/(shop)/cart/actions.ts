"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { cartItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getProductById } from "@/lib/catalog";
import { getOrCreateCart } from "@/lib/cart";
import { computeUnitPrice, configSelectionSchema } from "@/lib/pricing";

type ActionResult = { ok: true } | { ok: false; error: string };

const addSchema = z.object({
  productId: z.string().uuid(),
  selection: configSelectionSchema,
  qty: z.number().int().min(1).max(99),
});

/**
 * Add a configured item to the cart. The price is recomputed server-side from
 * the product's real option schema — the client value is never trusted.
 */
export async function addToCartAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { productId, selection, qty } = parsed.data;

  const product = await getProductById(productId);
  if (!product || product.status !== "published") {
    return { ok: false, error: "Product not available" };
  }

  const { unitPriceCents, errors } = computeUnitPrice(
    product.basePriceCents,
    product.options,
    selection,
  );
  if (errors.length) return { ok: false, error: errors[0] };

  const cartId = await getOrCreateCart(user.id);
  await db.insert(cartItems).values({
    cartId,
    productId,
    qty,
    config: selection,
    unitPriceCents,
  });

  revalidatePath("/cart");
  return { ok: true };
}

const qtySchema = z.object({
  itemId: z.string().uuid(),
  qty: z.number().int().min(1).max(99),
});

export async function updateQtyAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = qtySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const cartId = await getOrCreateCart(user.id);
  await db
    .update(cartItems)
    .set({ qty: parsed.data.qty })
    .where(
      and(eq(cartItems.id, parsed.data.itemId), eq(cartItems.cartId, cartId)),
    );
  revalidatePath("/cart");
  return { ok: true };
}

const removeSchema = z.object({ itemId: z.string().uuid() });

export async function removeItemAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = removeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const cartId = await getOrCreateCart(user.id);
  await db
    .delete(cartItems)
    .where(
      and(eq(cartItems.id, parsed.data.itemId), eq(cartItems.cartId, cartId)),
    );
  revalidatePath("/cart");
  return { ok: true };
}
