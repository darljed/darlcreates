"use server";

import { revalidatePath, updateTag } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { shippingConfigSchema } from "@/lib/shipping";
import { SHIPPING_TAG } from "@/lib/site-content";
import { resetContent, saveShippingConfig, SHIPPING_KEY } from "@/lib/site-content-store";

type Result = { ok: true } | { ok: false; error: string };

/** The shipping page, the checkout and the cart all read the rate table: a change expires it everywhere. */
function invalidate() {
  updateTag(SHIPPING_TAG);
  revalidatePath("/shipping");
  revalidatePath("/checkout");
  revalidatePath("/admin/shipping");
}

/** Save the rate table (zones x weight tiers, packaging, default weight, free-shipping threshold, province overrides). Zod-validated. */
export async function saveShippingConfigAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = shippingConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid shipping settings" };
  await saveShippingConfig(parsed.data, admin.id);
  invalidate();
  return { ok: true };
}

/** Forget the saved table: the built-in starting rates apply again. */
export async function resetShippingConfigAction(): Promise<Result> {
  await requireAdmin();
  await resetContent(SHIPPING_KEY);
  invalidate();
  return { ok: true };
}
