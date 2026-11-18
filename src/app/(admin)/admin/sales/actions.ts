"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { pesosToCentavos } from "@/lib/money";
import { productUnitCostCents, getProductCosting } from "@/lib/workshop/costing";
import { unitCostCents as partUnitCost } from "@/lib/workshop/inventory";
import { createSale, deleteSale, getSale, snapshotCosts, updateSale, type SaleInput } from "@/lib/workshop/sales";
import { PAYMENT_STATUSES, SALE_STATUSES } from "@/lib/workshop/types";
import { fail, type ActionResult } from "@/lib/workshop/action-result";

const payload = z.object({
  saleDate: z.string().optional(),
  productId: z.string().uuid("Please select a product"),
  quantity: z.coerce.number().int("Quantity must be a whole number").min(1, "Quantity must be at least 1").max(100_000),
  pricePerItemPesos: z.coerce.number().finite().min(0, "Price must be 0 or more").max(100_000_000),
  extraParts: z.array(z.object({ partId: z.string().uuid(), qty: z.coerce.number().finite().gt(0).max(1_000_000_000) })).max(30).default([]),
  paymentStatus: z.enum(PAYMENT_STATUSES).default("Unpaid"),
  modeOfPayment: z.string().trim().max(40).optional(),
  status: z.enum(SALE_STATUSES).default("For Processing"),
  deliveryDetails: z.string().trim().max(500).optional(),
  contact: z.string().trim().max(160).optional(),
  details: z.string().trim().max(2000).optional(),
});

const touch = () => { revalidatePath("/admin/sales"); revalidatePath("/admin/inventory"); revalidatePath("/admin"); };

/** Product, price, cost snapshot: the product's name comes from the database, never from the browser. */
async function clean(raw: unknown, existingId?: string): Promise<{ ok: true; input: SaleInput } | { ok: false; error: string }> {
  const p = payload.safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid sale" };
  const product = await getProductCosting(p.data.productId);
  if (!product) return { ok: false, error: "Product not found" };
  const saleDate = p.data.saleDate ? new Date(p.data.saleDate) : new Date();
  if (Number.isNaN(saleDate.getTime())) return { ok: false, error: "Invalid date" };
  const existing = existingId ? await getSale(existingId) : null;
  const { unitCostCents, extraParts } = await snapshotCosts(existing, p.data.productId, p.data.extraParts, {
    unitCost: () => productUnitCostCents(p.data.productId),
    partCost: (partId) => partUnitCost(partId),
  });
  return {
    ok: true,
    input: {
      saleDate,
      productId: p.data.productId,
      product: product.name.slice(0, 160),
      quantity: p.data.quantity,
      pricePerItemCents: pesosToCentavos(p.data.pricePerItemPesos),
      unitCostCents,
      extraParts,
      paymentStatus: p.data.paymentStatus,
      modeOfPayment: p.data.modeOfPayment || undefined,
      status: p.data.status,
      deliveryDetails: p.data.deliveryDetails || undefined,
      contact: p.data.contact || undefined,
      details: p.data.details || undefined,
    },
  };
}

export async function createSaleAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  await requireAdmin();
  const c = await clean(raw);
  if (!c.ok) return c;
  try { const id = await createSale(c.input); touch(); return { ok: true, id }; } catch (e) { return fail(e); }
}

export async function updateSaleAction(saleId: string, raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(saleId).success) return { ok: false, error: "Invalid sale" };
  const c = await clean(raw, saleId);
  if (!c.ok) return c;
  try { await updateSale(saleId, c.input); touch(); return { ok: true }; } catch (e) { return fail(e); }
}

export async function deleteSaleAction(saleId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!z.string().uuid().safeParse(saleId).success) return { ok: false, error: "Invalid sale" };
  try { await deleteSale(saleId); touch(); return { ok: true }; } catch (e) { return fail(e); }
}
