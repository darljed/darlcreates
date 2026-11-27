"use server";

import { revalidatePath, updateTag } from "next/cache";
import { and, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { productPresets, products } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { getProductById } from "@/lib/catalog";
import { DESIGN_MODES, MAX_PRESETS_PER_PRODUCT, coloursFromChoices, presetNameSchema } from "@/lib/presets";

type Result = { ok: true; id?: string } | { ok: false; error: string };

/** Same as the product actions: expire the shop's cached product reads and refresh the admin pages. */
async function invalidate(productId: string) {
  const [p] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId)).limit(1);
  updateTag("products");
  if (p) updateTag(`product:${p.slug}`);
  revalidatePath("/products");
  revalidatePath(`/admin/products/${productId}`);
}

const saveSchema = z.object({
  productId: z.string().uuid(),
  /** Present = edit this preset. */
  id: z.string().uuid().optional(),
  name: presetNameSchema,
  /** For every colour option of the product: the id of the colour chosen (what the admin picked in the editor). */
  choices: z.record(z.string(), z.string()),
  active: z.boolean().default(true),
});

/** Create or edit a design preset. The colours are stored by what each option is and the hex, so they survive "detect from 3MF". */
export async function savePresetAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const p = saveSchema.safeParse(input);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.path[0] === "name" ? "Give the design a name (up to 40 characters)." : "Invalid design." };
  // raw: every colour the product has, even ones the shop's colour list hides right now
  const product = await getProductById(p.data.productId, { raw: true });
  if (!product) return { ok: false, error: "Product not found" };
  const colours = coloursFromChoices(product.options, p.data.choices);
  if (!colours) return { ok: false, error: "Pick a colour for every part." };

  const others = await db.select({ id: productPresets.id, name: productPresets.name, sort: productPresets.sort }).from(productPresets).where(p.data.id ? and(eq(productPresets.productId, p.data.productId), ne(productPresets.id, p.data.id)) : eq(productPresets.productId, p.data.productId));
  if (others.some((o) => o.name.toLowerCase() === p.data.name.toLowerCase())) return { ok: false, error: "Another design already has that name." };
  if (!p.data.id && others.length >= MAX_PRESETS_PER_PRODUCT) return { ok: false, error: `A product can have up to ${MAX_PRESETS_PER_PRODUCT} designs.` };

  if (p.data.id) {
    const done = await db.update(productPresets).set({ name: p.data.name, colours, active: p.data.active }).where(and(eq(productPresets.id, p.data.id), eq(productPresets.productId, p.data.productId))).returning({ id: productPresets.id });
    if (!done.length) return { ok: false, error: "Design not found" };
    await invalidate(p.data.productId);
    return { ok: true, id: done[0].id };
  }
  const [row] = await db.insert(productPresets).values({ productId: p.data.productId, name: p.data.name, colours, active: p.data.active, sort: others.reduce((m, o) => Math.max(m, o.sort + 1), 0) }).returning({ id: productPresets.id });
  await invalidate(p.data.productId);
  return { ok: true, id: row.id };
}

export async function deletePresetAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const p = z.object({ presetId: z.string().uuid() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const [row] = await db.delete(productPresets).where(eq(productPresets.id, p.data.presetId)).returning({ productId: productPresets.productId });
  if (!row) return { ok: false, error: "Design not found" };
  await invalidate(row.productId);
  return { ok: true };
}

/** Hide a design from customers without deleting it (for example while it is out of stock), or show it again. */
export async function setPresetActiveAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const p = z.object({ presetId: z.string().uuid(), active: z.boolean() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const [row] = await db.update(productPresets).set({ active: p.data.active }).where(eq(productPresets.id, p.data.presetId)).returning({ productId: productPresets.productId });
  if (!row) return { ok: false, error: "Design not found" };
  await invalidate(row.productId);
  return { ok: true };
}

/** How customers choose colours on this product: their own, a ready-made design only, or either. */
export async function saveDesignModeAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const p = z.object({ productId: z.string().uuid(), mode: z.enum(DESIGN_MODES) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  if (p.data.mode !== "custom") {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(productPresets).where(and(eq(productPresets.productId, p.data.productId), eq(productPresets.active, true)));
    if (!n) return { ok: false, error: "Add at least one design first." };
  }
  const done = await db.update(products).set({ designMode: p.data.mode, updatedAt: new Date() }).where(eq(products.id, p.data.productId)).returning({ id: products.id });
  if (!done.length) return { ok: false, error: "Product not found" };
  await invalidate(p.data.productId);
  return { ok: true };
}
