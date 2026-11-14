"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import {
  blockUser,
  deleteUserAccount,
  deleteUserAddress,
  endAllSessions,
  endSession,
  requireReconsent,
  unblockUser,
  updateUserAddress,
  updateUserProfile,
} from "@/lib/user-admin";

/**
 * Thin wrappers: requireAdmin -> Zod -> service (which enforces the rules: no self-service on yourself,
 * admins untouchable, deleted accounts frozen) -> revalidate. The acting admin comes from the session, never from input.
 */
type Result = { ok: true; message?: string } | { ok: false; error: string };

const id = z.string().min(1).max(100);
const userOnly = z.object({ userId: id });

function done(userId: string) {
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
}

export async function blockUserAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = z.object({ userId: id, reason: z.string().max(300) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const r = await blockUser(admin.id, p.data.userId, p.data.reason);
  if (!r.ok) return r;
  done(p.data.userId);
  return { ok: true, message: `Blocked. ${r.endedSessions} active session(s) ended.` };
}

export async function unblockUserAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = userOnly.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const r = await unblockUser(admin.id, p.data.userId);
  if (!r.ok) return r;
  done(p.data.userId);
  return { ok: true, message: "Unblocked. They can sign in again." };
}

export async function endAllSessionsAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = userOnly.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const r = await endAllSessions(admin.id, p.data.userId);
  if (!r.ok) return r;
  done(p.data.userId);
  return { ok: true, message: `Signed out of ${r.ended} device(s). They'll sign in with Google again.` };
}

export async function endSessionAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = z.object({ userId: id, sessionId: id }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const r = await endSession(admin.id, p.data.userId, p.data.sessionId);
  if (!r.ok) return r;
  done(p.data.userId);
  return { ok: true };
}

export async function requireReconsentAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = userOnly.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const r = await requireReconsent(admin.id, p.data.userId);
  if (!r.ok) return r;
  done(p.data.userId);
  return { ok: true, message: "They'll be asked to accept the privacy policy on their next visit." };
}

export async function updateUserProfileAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = z.object({ userId: id, name: z.string(), email: z.string(), adminNote: z.string().optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const { userId, ...fields } = p.data;
  const r = await updateUserProfile(admin.id, userId, fields);
  if (!r.ok) return r;
  done(userId);
  return { ok: true, message: "Saved" };
}

export async function updateUserAddressAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = z.object({ userId: id, addressId: id, address: z.unknown() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const r = await updateUserAddress(admin.id, p.data.userId, p.data.addressId, p.data.address);
  if (!r.ok) return r;
  done(p.data.userId);
  return { ok: true, message: "Address saved" };
}

export async function deleteUserAddressAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = z.object({ userId: id, addressId: id }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  const r = await deleteUserAddress(admin.id, p.data.userId, p.data.addressId);
  if (!r.ok) return r;
  done(p.data.userId);
  return { ok: true };
}

export async function deleteUserAccountAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = z.object({ userId: id, confirm: z.string() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request" };
  if (p.data.confirm !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  const r = await deleteUserAccount(admin.id, p.data.userId);
  if (!r.ok) return r;
  done(p.data.userId);
  return { ok: true, message: "Account deleted and personal data removed." };
}
