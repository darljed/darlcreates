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
  type ConfigSelection,
} from "./pricing";
import { isOwnCustomerKey } from "./uploads";
import { slotOf, withFont } from "./name-mesh";
import { nameProblem } from "./name-3mf";

/** Framework-free so it can be tested with the real DB/S3. The action wrapper does auth + revalidation. */
export const addToCartSchema = z.object({
  productId: z.string().uuid(),
  selection: configSelectionSchema,
  qty: z.number().int().min(1).max(99),
});

type Line = { config: ConfigSelection; unitPriceCents: number; qty: number };
type Product = NonNullable<Awaited<ReturnType<typeof getProductById>>>;

/** Validate one selection against the product's schema and price it. Shared by single and multi-name adds. */
async function prepareLine(userId: string, product: Product, rawSelection: ConfigSelection, qty: number): Promise<{ ok: true; line: Line } | { ok: false; error: string }> {
  // Keep only what the product's schema allows; drop foreign image keys.
  const { config, errors: shapeErrors } = normalizeSelection(product.options, rawSelection, (key) => isOwnCustomerKey(userId, key));
  if (shapeErrors.length) return { ok: false, error: shapeErrors[0] };

  const { unitPriceCents, errors } = computeUnitPrice(product.basePriceCents, product.options, config);
  if (errors.length) return { ok: false, error: errors[0] };

  // A name that goes on the 3D model must be printable at its slot (checked here, with the server's own font,
  // so an order never reaches the workshop with a name that cannot be made).
  for (const opt of product.options) {
    const base = opt.type === "text" ? slotOf(opt.constraints) : null;
    const text = config[opt.id]?.text?.trim();
    if (!base || !text) continue;
    const problem = await nameProblem(withFont(base, config[opt.id]?.font), text); // check with the font they chose
    if (problem) return { ok: false, error: `${opt.label}: ${problem}` };
  }

  // The file must really exist and really be an image.
  for (const sel of Object.values(config)) {
    if (!sel.imageKey) continue;
    const check = await verifyCustomerImage(userId, sel.imageKey);
    if (!check.ok) return check;
  }
  return { ok: true, line: { config, unitPriceCents, qty } };
}

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
  const prepared = await prepareLine(userId, product, rawSelection, qty);
  if (!prepared.ok) return prepared;

  const cartId = await getOrCreateCart(userId);
  await db.insert(cartItems).values({
    cartId,
    productId,
    qty,
    config: prepared.line.config,
    imageKey: firstImageKey(prepared.line.config),
    unitPriceCents: prepared.line.unitPriceCents,
  });
  return { ok: true };
}

/** Most names one "add all" may carry. */
export const MAX_NAMES_PER_ADD = 20;

export const addManyToCartSchema = z.object({
  productId: z.string().uuid(),
  /** One entry per name: its own selection (text, font, name colour, part colours, shared options) and quantity. */
  rows: z.array(z.object({ selection: configSelectionSchema, qty: z.number().int().min(1).max(99) })).min(1).max(MAX_NAMES_PER_ADD),
});

/**
 * Add several personalized items at once (a bulk order of different names). Every row is validated first and nothing is
 * added unless all of them are valid, so the customer never ends up with half of a list in the cart. The rows go into
 * the cart in ONE insert, each as its own line with its own snapshot, so they price, ship and print separately.
 */
export async function addManyToCart(userId: string, input: unknown): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const parsed = addManyToCartSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { productId, rows } = parsed.data;

  const product = await getProductById(productId);
  if (!product || product.status !== "published") return { ok: false, error: "Product not available" };

  const lines: Line[] = [];
  for (let i = 0; i < rows.length; i++) {
    const prepared = await prepareLine(userId, product, rows[i].selection, rows[i].qty);
    if (!prepared.ok) return { ok: false, error: rows.length > 1 ? `Name ${i + 1}: ${prepared.error}` : prepared.error };
    lines.push(prepared.line);
  }

  const cartId = await getOrCreateCart(userId);
  await db.insert(cartItems).values(
    lines.map((l) => ({ cartId, productId, qty: l.qty, config: l.config, imageKey: firstImageKey(l.config), unitPriceCents: l.unitPriceCents })),
  );
  return { ok: true, added: lines.length };
}
