"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { cartItems } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { getOrCreateCart } from "@/lib/cart";
import { addToCart } from "@/lib/cart-service";

type ActionResult = { ok: true } | { ok: false; error: string };

/** Thin wrapper: auth -> service (validation, price, image checks) -> revalidate. */
export async function addToCartAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const res = await addToCart(user.id, input);
  if (res.ok) revalidatePath("/cart");
  return res;
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
