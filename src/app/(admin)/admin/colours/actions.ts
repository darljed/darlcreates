"use server";

import { revalidatePath, updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { productOptions, productOptionValues } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { colourInventorySchema, inStock, type ColourInventory } from "@/lib/colour-inventory-schema";
import { COLOURS_TAG } from "@/lib/site-content";
import { COLOURS_KEY, resetContent, saveColourInventory } from "@/lib/site-content-store";

type Result = { ok: true; hidden: number } | { ok: false; error: string };

/** Everything that shows colours reads products, so a change expires the product cache too. */
function invalidate() {
  updateTag(COLOURS_TAG);
  updateTag("products");
  revalidatePath("/products", "layout");
  revalidatePath("/clicker");
  revalidatePath("/keychain");
  revalidatePath("/admin/colours");
  revalidatePath("/admin/products", "layout");
}

/** How many colour choices already on products are not in this inventory (they stop being offered). */
async function hiddenCount(inv: ColourInventory | null): Promise<number> {
  const rows = await db
    .select({ value: productOptionValues.value })
    .from(productOptionValues)
    .innerJoin(productOptions, eq(productOptionValues.optionId, productOptions.id))
    .where(eq(productOptions.type, "color"));
  return rows.filter((r) => !inStock(inv, r.value)).length;
}

/**
 * Save the colours in stock. From now on these are the only colours customers can pick anywhere: the clicker designer,
 * colour options and name colours. Colour choices on products that are not in the list stop being offered (they are
 * kept, so adding the colour back brings them back); the number hidden is returned so the owner can see the effect.
 */
export async function saveColourInventoryAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = colourInventorySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid colours" };
  const saved = await saveColourInventory(parsed.data, admin.id);
  invalidate();
  return { ok: true, hidden: await hiddenCount(saved) };
}

/** Forget the inventory: every colour is allowed again (the way products worked before). */
export async function resetColourInventoryAction(): Promise<Result> {
  await requireAdmin();
  await resetContent(COLOURS_KEY);
  invalidate();
  return { ok: true, hidden: 0 };
}
