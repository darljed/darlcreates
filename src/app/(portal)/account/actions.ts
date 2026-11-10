"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/session";
import { deleteAddress, setDefaultAddress } from "@/lib/addresses";
import { deleteAccount } from "@/lib/privacy";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

type Result = { ok: true } | { ok: false; error: string };
const idSchema = z.object({ id: z.string().uuid() });

export async function deleteAddressAction(input: unknown): Promise<Result> {
  const user = await requireUser("/account");
  const p = idSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const ok = await deleteAddress(user.id, p.data.id);
  revalidatePath("/account");
  return ok ? { ok: true } : { ok: false, error: "Address not found" };
}

export async function setDefaultAddressAction(input: unknown): Promise<Result> {
  const user = await requireUser("/account");
  const p = idSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const ok = await setDefaultAddress(user.id, p.data.id);
  revalidatePath("/account");
  return ok ? { ok: true } : { ok: false, error: "Address not found" };
}

/** Requires the user to type DELETE. On success the session is revoked and the user is sent home. */
export async function deleteAccountAction(input: unknown): Promise<Result> {
  const user = await requireUser("/account");
  const p = z.object({ confirm: z.literal("DELETE") }).safeParse(input);
  if (!p.success) return { ok: false, error: "Type DELETE to confirm." };
  const res = await deleteAccount(user.id);
  if (!res.ok) return res;
  try {
    await auth.api.signOut({ headers: await headers() });
  } catch {
    /* sessions were already deleted in the DB; nothing more to revoke */
  }
  redirect("/?deleted=1");
}
