"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { cartItems } from "@/db/schema";
import { getAccess, requireUser } from "@/lib/session";
import { getOrCreateCart } from "@/lib/cart";
import { addManyToCart, addToCart } from "@/lib/cart-service";

type ActionResult = { ok: true } | { ok: false; error: string };

/** `needs` tells the browser what to do first; it keeps the customer's choices and retries after. */
type AddResult = ActionResult | { ok: false; error: string; needs: "sign_in" | "consent" };

/**
 * Thin wrapper: access check -> service (validation, price, image checks) -> revalidate.
 * Unlike the other actions this does NOT redirect when sign-in or privacy consent is missing: a redirect from here
 * would throw away a customized product. It returns `needs` instead and the product page resumes the add afterwards.
 */
export async function addToCartAction(input: unknown): Promise<AddResult> {
  const access = await getAccess();
  if (access.state === "signed_out") return { ok: false, error: "Please sign in to add to cart.", needs: "sign_in" };
  if (access.state === "consent") return { ok: false, error: "Please accept the privacy policy to continue.", needs: "consent" };
  if (access.state !== "ok") return { ok: false, error: "This account can't place orders." };
  const res = await addToCart(access.user.id, input);
  if (res.ok) revalidatePath("/cart");
  return res;
}

/** Several names at once (bulk order). All rows are checked first; nothing is added unless every row is valid. */
export async function addManyToCartAction(input: unknown): Promise<AddResult | { ok: true; added: number }> {
  const access = await getAccess();
  if (access.state === "signed_out") return { ok: false, error: "Please sign in to add to cart.", needs: "sign_in" };
  if (access.state === "consent") return { ok: false, error: "Please accept the privacy policy to continue.", needs: "consent" };
  if (access.state !== "ok") return { ok: false, error: "This account can't place orders." };
  const res = await addManyToCart(access.user.id, input);
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
