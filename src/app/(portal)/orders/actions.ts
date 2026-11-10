"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { cancelOwnOrder, reorderToCart } from "@/lib/order-service";

const orderNoSchema = z.object({ orderNo: z.string().min(3).max(40) });

/** Thin wrapper: auth -> service -> revalidate. The service enforces ownership and the unpaid-only rule. */
export async function cancelOrderAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = orderNoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const res = await cancelOwnOrder(user.id, parsed.data.orderNo);
  if (!res.ok) return res;
  revalidatePath("/orders");
  revalidatePath(`/orders/${res.orderNo}`);
  revalidatePath("/admin/orders");
  return { ok: true };
}

export async function reorderAction(
  input: unknown,
): Promise<{ ok: true; added: number; skipped: string[] } | { ok: false; error: string }> {
  const user = await requireUser();
  const parsed = orderNoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const res = await reorderToCart(user.id, parsed.data.orderNo);
  if (!res.ok) return res;
  revalidatePath("/cart");
  return { ok: true, added: res.added, skipped: res.skipped.map((s) => `${s.name}: ${s.reason}`) };
}
