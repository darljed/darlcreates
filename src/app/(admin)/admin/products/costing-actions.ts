"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { pesosToCentavos } from "@/lib/money";
import { saveProductCosting } from "@/lib/workshop/costing";
import { fail, type ActionResult } from "@/lib/workshop/action-result";

/** Set a product's internal costing: the print cost per unit and its bill of materials (parts per unit). Never shown to customers. */
export async function saveProductCostingAction(raw: unknown): Promise<ActionResult> {
  await requireAdmin();
  const p = z.object({
    productId: z.string().uuid(),
    printCostPesos: z.coerce.number().finite().min(0).max(100_000_000),
    bom: z.array(z.object({ partId: z.string().uuid(), qty: z.coerce.number().finite().gt(0).max(1_000_000_000) })).max(60),
  }).safeParse(raw);
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message ?? "Invalid costing" };
  try {
    await saveProductCosting(p.data.productId, { printCostCents: pesosToCentavos(p.data.printCostPesos), bom: p.data.bom });
    revalidatePath(`/admin/products/${p.data.productId}`);
    revalidatePath("/admin/sales");
    return { ok: true };
  } catch (e) { return fail(e); }
}
