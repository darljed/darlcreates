"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { pesosToCentavos } from "@/lib/money";
import { createProductFromEstimate, productFromEstimate, saveProductCosting } from "@/lib/workshop/costing";
import { deleteEstimate, listEstimates, listEstimateTags, saveEstimate, updateEstimate, type EstimateData } from "@/lib/workshop/estimates";
import { fail, type ActionResult } from "@/lib/workshop/action-result";
import type { EstimateInput, SavedEstimate, SavedTier } from "@/lib/workshop/types";

const id = z.string().uuid();
const pesos = z.coerce.number().finite().min(0).max(1_000_000_000);

const estimateSchema = z.object({
  title: z.string().trim().max(120).optional(),
  comment: z.string().trim().max(2000).optional(),
  /** The estimator's own snapshot (job, settings, components, fees, margins, chosen tier): stored as-is so it reloads. */
  input: z.object({}).passthrough(),
  tiers: z.array(z.object({ marginPct: z.number(), price: z.number(), rounded: z.number(), profit: z.number(), pricePerUnit: z.number(), profitPerUnit: z.number() })).length(3),
  totalCostPesos: pesos,
  pricePesos: pesos,
  quantity: z.coerce.number().int().min(1).max(100_000),
  tags: z.array(z.string()).max(30).default([]),
});

const data = (p: z.infer<typeof estimateSchema>): EstimateData => ({
  title: p.title,
  comment: p.comment,
  input: p.input as unknown as EstimateInput,
  tiers: p.tiers as SavedTier[],
  totalCostCents: pesosToCentavos(p.totalCostPesos),
  priceCents: pesosToCentavos(p.pricePesos),
  quantity: p.quantity,
  tags: p.tags,
});

const touch = () => revalidatePath("/admin/estimator");

export async function saveEstimateAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const p = estimateSchema.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid estimate" };
  try { const estimateId = await saveEstimate(data(p.data)); touch(); return { ok: true, id: estimateId }; } catch (e) { return fail(e); }
}

export async function updateEstimateAction(estimateId: string, raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const i = id.safeParse(estimateId), p = estimateSchema.safeParse(raw);
  if (!i.success || !p.success) return { ok: false, error: p.success ? "Invalid estimate" : (p.error.issues[0]?.message ?? "Invalid estimate") };
  try {
    if (!(await updateEstimate(i.data, data(p.data)))) return { ok: false, error: "Estimate not found" };
    touch();
    return { ok: true };
  } catch (e) { return fail(e); }
}

export async function deleteEstimateAction(estimateId: string): Promise<ActionResult> {
  await requireAdmin();
  const i = id.safeParse(estimateId);
  if (!i.success) return { ok: false, error: "Invalid estimate" };
  try { await deleteEstimate(i.data); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

/** The saved estimates (newest first), optionally only those with every given tag, and the tags in use. */
export async function listEstimatesAction(tags: string[] = []): Promise<ActionResult<{ estimates: SavedEstimate[]; tags: string[] }>> {
  await requireAdmin();
  try { return { ok: true, estimates: await listEstimates(tags.slice(0, 12)), tags: await listEstimateTags() }; } catch (e) { return fail(e); }
}

/**
 * One piece's costing from an estimate: components linked to a part become the bill of materials and the remainder of the
 * unit cost is the print cost.
 */
const costingSchema = z.object({
  /** What one piece costs to make, in pesos (the estimator's per-piece cost). */
  unitCostPesos: pesos,
  components: z.array(z.object({ partId: z.string().uuid().nullish(), qty: z.coerce.number().finite().min(0).max(1_000_000_000), unitPricePesos: pesos })).max(60),
});

/** Create a DRAFT shop product from an estimate (costing saved, the chosen tier is the price). Photos and publishing are done on its page. */
export async function createProductFromEstimateAction(raw: unknown): Promise<ActionResult<{ id: string; slug: string }>> {
  await requireAdmin();
  const p = costingSchema.extend({ name: z.string().trim().min(1, "Product name is required").max(120), pricePesos: pesos }).safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid product" };
  try {
    const costing = productFromEstimate({ totalCostCents: pesosToCentavos(p.data.unitCostPesos), components: p.data.components.map((c) => ({ partId: c.partId, qty: c.qty, unitPriceCents: pesosToCentavos(c.unitPricePesos) })) });
    const row = await createProductFromEstimate({ name: p.data.name, priceCents: pesosToCentavos(p.data.pricePesos), ...costing });
    revalidatePath("/admin/products");
    return { ok: true, ...row };
  } catch (e) { return fail(e); }
}

/** Put an estimate's costing on an EXISTING product (its price is left alone). */
export async function applyEstimateToProductAction(raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const p = costingSchema.extend({ productId: id }).safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid product" };
  try {
    const costing = productFromEstimate({ totalCostCents: pesosToCentavos(p.data.unitCostPesos), components: p.data.components.map((c) => ({ partId: c.partId, qty: c.qty, unitPriceCents: pesosToCentavos(c.unitPricePesos) })) });
    await saveProductCosting(p.data.productId, costing);
    revalidatePath(`/admin/products/${p.data.productId}`);
    return { ok: true };
  } catch (e) { return fail(e); }
}
