"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { pesosToCentavos } from "@/lib/money";
import { adjustStock, createPart, deletePart, editPurchase, listMovements, listPurchases, recordPurchase, updatePart, voidPurchase } from "@/lib/workshop/inventory";
import { PART_UNITS } from "@/lib/workshop/presets";
import { fail, type ActionResult } from "@/lib/workshop/action-result";
import type { PurchaseRow } from "@/lib/workshop/types";

const id = z.string().uuid();
const peso = z.coerce.number().finite().min(0).max(100_000_000);
const qty = z.coerce.number().finite().gt(0).max(1_000_000_000);

const partSchema = z.object({
  name: z.string().trim().min(1, "Part name is required").max(120),
  category: z.string().trim().max(60).optional(),
  unit: z.enum(PART_UNITS).default("piece"),
  reorderLevel: z.coerce.number().finite().min(0).max(1_000_000_000).default(0),
  notes: z.string().trim().max(2000).optional(),
});

const touch = () => { revalidatePath("/admin/inventory"); revalidatePath("/admin"); };
const bad = (e: z.ZodError) => ({ ok: false as const, error: e.issues[0]?.message ?? "Invalid input" });

/** A part, optionally with its first stock (one purchase lot that sets the opening average cost). */
export async function createPartAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const p = partSchema.extend({ initialQty: z.coerce.number().finite().min(0).max(1_000_000_000).optional(), initialTotalCostPesos: peso.optional() }).safeParse(raw);
  if (!p.success) return bad(p.error);
  try {
    const { initialQty, initialTotalCostPesos, ...part } = p.data;
    const partId = await createPart(part);
    if (initialQty && initialQty > 0) await recordPurchase({ partId, qty: initialQty, totalCostCents: pesosToCentavos(initialTotalCostPesos ?? 0) });
    touch();
    return { ok: true, id: partId };
  } catch (e) { return fail(e); }
}

export async function updatePartAction(partId: string, raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const i = id.safeParse(partId), p = partSchema.safeParse(raw);
  if (!i.success || !p.success) return { ok: false, error: p.success ? "Invalid part" : bad(p.error).error };
  try { await updatePart(i.data, p.data); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

/** Removes the part, its purchase lots and its history, and takes it out of every product's bill of materials. */
export async function deletePartAction(partId: string): Promise<ActionResult> {
  await requireAdmin();
  const i = id.safeParse(partId);
  if (!i.success) return { ok: false, error: "Invalid part" };
  try { await deletePart(i.data); touch(); revalidatePath("/admin/products", "layout"); return { ok: true }; } catch (e) { return fail(e); }
}

export async function recordPurchaseAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const p = z.object({ partId: id, qty, totalCostPesos: peso, supplier: z.string().trim().max(120).optional(), purchasedAt: z.string().optional() }).safeParse(raw);
  if (!p.success) return bad(p.error);
  const at = p.data.purchasedAt ? new Date(p.data.purchasedAt) : undefined;
  if (at && Number.isNaN(at.getTime())) return { ok: false, error: "Invalid date" };
  try {
    const lot = await recordPurchase({ partId: p.data.partId, qty: p.data.qty, totalCostCents: pesosToCentavos(p.data.totalCostPesos), supplier: p.data.supplier, purchasedAt: at });
    touch();
    return { ok: true, id: lot };
  } catch (e) { return fail(e); }
}

export async function editPurchaseAction(purchaseId: string, raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const i = id.safeParse(purchaseId);
  const p = z.object({ qty, totalCostPesos: peso, supplier: z.string().trim().max(120).optional() }).safeParse(raw);
  if (!i.success || !p.success) return { ok: false, error: p.success ? "Invalid purchase" : bad(p.error).error };
  try { await editPurchase(i.data, { qty: p.data.qty, totalCostCents: pesosToCentavos(p.data.totalCostPesos), supplier: p.data.supplier }); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function voidPurchaseAction(purchaseId: string): Promise<ActionResult> {
  await requireAdmin();
  const i = id.safeParse(purchaseId);
  if (!i.success) return { ok: false, error: "Invalid purchase" };
  try { await voidPurchase(i.data); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

/** A manual correction: give a +/- change, or the real count (`setTo`). */
export async function adjustStockAction(raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const p = z.object({
    partId: id,
    delta: z.coerce.number().finite().optional(),
    setTo: z.coerce.number().finite().min(-1_000_000_000).max(1_000_000_000).optional(),
    reason: z.string().trim().max(200).default("manual adjustment"),
  }).safeParse(raw);
  if (!p.success) return bad(p.error);
  if (p.data.delta === undefined && p.data.setTo === undefined) return { ok: false, error: "Give a new count or a + / - change" };
  try { await adjustStock({ partId: p.data.partId, delta: p.data.delta, setTo: p.data.setTo, reason: p.data.reason || "manual adjustment" }); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function listPurchasesAction(partId: string): Promise<ActionResult<{ purchases: PurchaseRow[] }>> {
  await requireAdmin();
  const i = id.safeParse(partId);
  if (!i.success) return { ok: false, error: "Invalid part" };
  try { return { ok: true, purchases: await listPurchases(i.data) }; } catch (e) { return fail(e); }
}

export async function listMovementsAction(partId: string): Promise<ActionResult<{ movements: { id: string; delta: number; reason: string; note: string | null; createdAt: string }[] }>> {
  await requireAdmin();
  const i = id.safeParse(partId);
  if (!i.success) return { ok: false, error: "Invalid part" };
  try { return { ok: true, movements: await listMovements(i.data) }; } catch (e) { return fail(e); }
}
