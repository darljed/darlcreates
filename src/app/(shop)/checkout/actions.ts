"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { placeOrder, submitGcashReference } from "@/lib/order-service";
import { sendEmail, orderEmails } from "@/lib/email";
import { formatPHP } from "@/lib/money";

export type PlaceOrderState = { error: string | null };

/** Thin wrapper: auth -> service -> revalidate/email -> redirect. Logic lives in order-service. */
export async function placeOrderAction(
  _prev: PlaceOrderState,
  formData: FormData,
): Promise<PlaceOrderState> {
  const user = await requireUser();

  const res = await placeOrder(
    user.id,
    {
      recipient: formData.get("recipient"),
      phone: formData.get("phone"),
      line1: formData.get("line1"),
      line2: formData.get("line2") ?? "",
      barangay: formData.get("barangay") ?? "",
      city: formData.get("city"),
      province: formData.get("province"),
      postalCode: formData.get("postalCode") ?? "",
    },
    { saveAddress: formData.get("saveAddress") === "on" },
  );
  if (!res.ok) return { error: res.error };

  revalidatePath("/cart");
  revalidatePath("/orders");
  revalidatePath("/account");

  const placed = orderEmails.placed(res.orderNo, formatPHP(res.totalCents));
  await sendEmail(user.email, placed.subject, placed.text);

  redirect(`/orders/${res.orderNo}`);
}

const paymentSchema = z.object({
  orderNo: z.string().min(3).max(40),
  reference: z.string().min(1).max(64),
});

type Result = { ok: true } | { ok: false; error: string };

/** Customer submits a GCash reference. The amount is taken from the order, never from the client. */
export async function submitPaymentAction(input: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = paymentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid payment details" };

  const res = await submitGcashReference(user.id, parsed.data.orderNo, parsed.data.reference);
  if (!res.ok) return res;
  revalidatePath(`/orders/${res.orderNo}`);
  revalidatePath("/admin/payments");
  return { ok: true };
}
