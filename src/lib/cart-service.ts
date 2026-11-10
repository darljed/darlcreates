import { z } from "zod";
import { db } from "@/db";
import { cartItems } from "@/db/schema";
import { getProductById } from "./catalog";
import { getOrCreateCart } from "./cart";
import { verifyCustomerImage } from "./customer-images";
import {
  computeUnitPrice,
  configSelectionSchema,
  firstImageKey,
  normalizeSelection,
} from "./pricing";
import { isOwnCustomerKey } from "./uploads";

/** Framework-free so it can be tested with the real DB/S3. The action wrapper does auth + revalidation. */
export const addToCartSchema = z.object({
  productId: z.string().uuid(),
  selection: configSelectionSchema,
  qty: z.number().int().min(1).max(99),
});

export async function addToCart(
  userId: string,
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = addToCartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { productId, selection: rawSelection, qty } = parsed.data;

  const product = await getProductById(productId);
  if (!product || product.status !== "published") {
    return { ok: false, error: "Product not available" };
  }

  // Keep only what the product's schema allows; drop foreign image keys.
  const { config, errors: shapeErrors } = normalizeSelection(
    product.options,
    rawSelection,
    (key) => isOwnCustomerKey(userId, key),
  );
  if (shapeErrors.length) return { ok: false, error: shapeErrors[0] };

  const { unitPriceCents, errors } = computeUnitPrice(product.basePriceCents, product.options, config);
  if (errors.length) return { ok: false, error: errors[0] };

  // The file must really exist and really be an image.
  for (const sel of Object.values(config)) {
    if (!sel.imageKey) continue;
    const check = await verifyCustomerImage(userId, sel.imageKey);
    if (!check.ok) return check;
  }

  const cartId = await getOrCreateCart(userId);
  await db.insert(cartItems).values({
    cartId,
    productId,
    qty,
    config,
    imageKey: firstImageKey(config),
    unitPriceCents,
  });
  return { ok: true };
}
