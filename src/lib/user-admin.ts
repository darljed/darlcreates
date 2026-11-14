import { randomUUID } from "node:crypto";
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adminAudit, addresses, orders, sessions, users } from "@/db/schema";
import { likeTerm } from "./like";
import { addressSchema, type Result } from "./order-service";
import { deleteAccount } from "./privacy";

/**
 * Admin control over customer accounts: find, block/unblock, end sessions, require re-consent, fix profile and
 * addresses, delete. Framework-free (no next/*), so scripts can test the real code; Server Actions do auth + Zod
 * + revalidation and pass the acting admin in.
 *
 * Sign-in is Google only, so there are no passwords to reset. The equivalent controls are: end every session
 * (forces a fresh Google sign-in), block the account, and require the privacy policy to be accepted again.
 * Every change is written to the append-only `admin_audit` table, in the same transaction as the change.
 */

export type UserState = "active" | "blocked" | "deleted";
export const userStateOf = (u: { blockedAt: Date | null; deletedAt: Date | null }): UserState =>
  u.deletedAt ? "deleted" : u.blockedAt ? "blocked" : "active";

type Db = Pick<typeof db, "insert">;
async function audit(tx: Db, actorId: string, targetUserId: string, action: string, detail: Record<string, unknown> = {}) {
  await tx.insert(adminAudit).values({ id: randomUUID(), actorId, targetUserId, action, detail });
}

// ---------------------------------------------------------------------------
// List + detail
// ---------------------------------------------------------------------------

export type UserFilter = "all" | "active" | "blocked" | "deleted" | "admins";

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "customer" | "admin";
  createdAt: Date;
  blockedAt: Date | null;
  deletedAt: Date | null;
  orders: number;
  /** Verified payments on orders that were not cancelled or refunded. */
  spentCents: number;
  lastOrderAt: Date | null;
};

function filterWhere(filter: UserFilter, q?: string) {
  const term = q?.trim().slice(0, 80);
  return and(
    filter === "active" ? and(isNull(users.blockedAt), isNull(users.deletedAt)) : undefined,
    filter === "blocked" ? and(isNotNull(users.blockedAt), isNull(users.deletedAt)) : undefined,
    filter === "deleted" ? isNotNull(users.deletedAt) : undefined,
    filter === "admins" ? eq(users.role, "admin") : undefined,
    term ? or(ilike(users.name, likeTerm(term)), ilike(users.email, likeTerm(term))) : undefined,
  );
}

export async function listUsers(opts: { filter?: UserFilter; q?: string; page?: number; pageSize?: number } = {}) {
  const pageSize = opts.pageSize ?? 25;
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const where = filterWhere(opts.filter ?? "all", opts.q);

  const rows = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: users.role,
      createdAt: users.createdAt,
      blockedAt: users.blockedAt,
      deletedAt: users.deletedAt,
      // explicit aliases: inside a sub-select Drizzle would print the outer `id` unqualified, binding it to the wrong table
      orders: sql<number>`(select count(*)::int from orders o where o.user_id = users.id)`,
      spentCents: sql<number>`(select coalesce(sum(p.amount_cents), 0)::bigint from payments p join orders o on o.id = p.order_id where o.user_id = users.id and p.status = 'verified' and o.status not in ('cancelled', 'refunded'))`,
      lastOrderAt: sql<Date | null>`(select max(o.placed_at) from orders o where o.user_id = users.id)`,
    })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  const [{ total }] = await db.select({ total: count() }).from(users).where(where);
  return {
    rows: rows.map((r) => ({ ...r, orders: Number(r.orders), spentCents: Number(r.spentCents), lastOrderAt: r.lastOrderAt ? new Date(r.lastOrderAt) : null })) as UserRow[],
    total: Number(total),
    page,
    pageSize,
  };
}

export async function userCounts(): Promise<Record<UserFilter, number>> {
  const [r] = await db
    .select({
      all: count(),
      active: sql<number>`count(*) filter (where ${users.blockedAt} is null and ${users.deletedAt} is null)::int`,
      blocked: sql<number>`count(*) filter (where ${users.blockedAt} is not null and ${users.deletedAt} is null)::int`,
      deleted: sql<number>`count(*) filter (where ${users.deletedAt} is not null)::int`,
      admins: sql<number>`count(*) filter (where ${users.role} = 'admin')::int`,
    })
    .from(users);
  return { all: Number(r.all), active: Number(r.active), blocked: Number(r.blocked), deleted: Number(r.deleted), admins: Number(r.admins) };
}

export async function getUserDetail(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;
  const [addrs, sess, theirOrders, trail] = await Promise.all([
    db.select().from(addresses).where(eq(addresses.userId, id)).orderBy(desc(addresses.isDefault)),
    db.select().from(sessions).where(eq(sessions.userId, id)).orderBy(desc(sessions.createdAt)),
    db
      .select({ id: orders.id, orderNo: orders.orderNo, status: orders.status, totalCents: orders.totalCents, placedAt: orders.placedAt })
      .from(orders)
      .where(eq(orders.userId, id))
      .orderBy(desc(orders.placedAt))
      .limit(10),
    db
      .select({ id: adminAudit.id, action: adminAudit.action, detail: adminAudit.detail, createdAt: adminAudit.createdAt, actorName: users.name })
      .from(adminAudit)
      .leftJoin(users, eq(users.id, adminAudit.actorId))
      .where(eq(adminAudit.targetUserId, id))
      .orderBy(desc(adminAudit.createdAt))
      .limit(50),
  ]);
  const [stats] = await db
    .select({
      orders: sql<number>`count(*)::int`,
      spent: sql<number>`(select coalesce(sum(p.amount_cents), 0)::bigint from payments p join orders o on o.id = p.order_id where o.user_id = ${id} and p.status = 'verified' and o.status not in ('cancelled', 'refunded'))`,
    })
    .from(orders)
    .where(eq(orders.userId, id));
  return { user, addresses: addrs, sessions: sess, orders: theirOrders, audit: trail, orderCount: Number(stats?.orders ?? 0), spentCents: Number(stats?.spent ?? 0) };
}

// ---------------------------------------------------------------------------
// Account controls
// ---------------------------------------------------------------------------

type Target = { user: typeof users.$inferSelect } | { error: string };

async function loadTarget(actorId: string, userId: string, opts: { allowAdmin?: boolean; allowSelf?: boolean; allowDeleted?: boolean } = {}): Promise<Target> {
  const [u] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!u) return { error: "User not found" };
  if (u.id === actorId && !opts.allowSelf) return { error: "You can't do this to your own account." };
  if (u.role === "admin" && !opts.allowAdmin) return { error: "Admin accounts can't be changed from here." };
  if (u.deletedAt && !opts.allowDeleted) return { error: "This account was deleted." };
  return { user: u };
}

const reasonSchema = z.string().trim().min(3, "Add a short reason (for your own records)").max(300);

/** Block sign-in and end every session at once. The reason is internal and never shown to the user. */
export async function blockUser(actorId: string, userId: string, reason: string): Promise<Result<{ endedSessions: number }>> {
  const why = reasonSchema.safeParse(reason);
  if (!why.success) return { ok: false, error: why.error.issues[0].message };
  const t = await loadTarget(actorId, userId);
  if ("error" in t) return { ok: false, error: t.error };
  if (t.user.blockedAt) return { ok: false, error: "This account is already blocked." };

  return db.transaction(async (tx) => {
    await tx.update(users).set({ blockedAt: new Date(), blockedReason: why.data, updatedAt: new Date() }).where(eq(users.id, userId));
    const ended = await tx.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id });
    await audit(tx, actorId, userId, "user.block", { reason: why.data, endedSessions: ended.length });
    return { ok: true as const, endedSessions: ended.length };
  });
}

export async function unblockUser(actorId: string, userId: string): Promise<Result> {
  const t = await loadTarget(actorId, userId, { allowSelf: true });
  if ("error" in t) return { ok: false, error: t.error };
  if (!t.user.blockedAt) return { ok: false, error: "This account isn't blocked." };
  await db.transaction(async (tx) => {
    await tx.update(users).set({ blockedAt: null, blockedReason: null, updatedAt: new Date() }).where(eq(users.id, userId));
    await audit(tx, actorId, userId, "user.unblock", { previousReason: t.user.blockedReason });
  });
  return { ok: true };
}

/** "Reset": end every session so the user must sign in with Google again. */
export async function endAllSessions(actorId: string, userId: string): Promise<Result<{ ended: number }>> {
  const t = await loadTarget(actorId, userId, { allowAdmin: true });
  if ("error" in t) return { ok: false, error: t.error };
  return db.transaction(async (tx) => {
    const ended = await tx.delete(sessions).where(eq(sessions.userId, userId)).returning({ id: sessions.id });
    await audit(tx, actorId, userId, "user.sessions_ended", { ended: ended.length });
    return { ok: true as const, ended: ended.length };
  });
}

export async function endSession(actorId: string, userId: string, sessionId: string): Promise<Result> {
  const t = await loadTarget(actorId, userId, { allowAdmin: true });
  if ("error" in t) return { ok: false, error: t.error };
  return db.transaction(async (tx) => {
    const gone = await tx.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId))).returning({ id: sessions.id });
    if (!gone.length) return { ok: false as const, error: "That session no longer exists." };
    await audit(tx, actorId, userId, "user.session_ended", {});
    return { ok: true as const };
  });
}

/** The user is sent to the consent screen on their next visit and must accept the policy again. */
export async function requireReconsent(actorId: string, userId: string): Promise<Result> {
  const t = await loadTarget(actorId, userId);
  if ("error" in t) return { ok: false, error: t.error };
  await db.transaction(async (tx) => {
    await tx.update(users).set({ consentAt: null, consentVersion: null, updatedAt: new Date() }).where(eq(users.id, userId));
    await audit(tx, actorId, userId, "user.reconsent_required", {});
  });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Fix their data
// ---------------------------------------------------------------------------

export const profileEditSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(200),
  adminNote: z.string().trim().max(1000).default(""),
});

function isUniqueViolation(err: unknown): boolean {
  let e: unknown = err;
  for (let i = 0; i < 4 && e; i++) {
    if ((e as { code?: string }).code === "23505") return true;
    e = (e as { cause?: unknown }).cause;
  }
  return false;
}

/**
 * Fix a customer's name / email / private note. This changes what WE hold; they still sign in with their Google
 * account. The audit entry records exactly which fields changed, from and to.
 */
export async function updateUserProfile(actorId: string, userId: string, input: unknown): Promise<Result> {
  const parsed = profileEditSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const t = await loadTarget(actorId, userId, { allowAdmin: true, allowSelf: true });
  if ("error" in t) return { ok: false, error: t.error };
  const before = t.user;
  const next = parsed.data;

  const changes: Record<string, { from: string; to: string }> = {};
  if (before.name !== next.name) changes.name = { from: before.name, to: next.name };
  if (before.email !== next.email) changes.email = { from: before.email, to: next.email };
  if (before.adminNote !== next.adminNote) changes.adminNote = { from: before.adminNote, to: next.adminNote };
  if (!Object.keys(changes).length) return { ok: true };

  try {
    await db.transaction(async (tx) => {
      await tx.update(users).set({ name: next.name, email: next.email, adminNote: next.adminNote, updatedAt: new Date() }).where(eq(users.id, userId));
      await audit(tx, actorId, userId, "user.profile_updated", changes);
    });
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: "That email already belongs to another account." };
    throw err;
  }
  return { ok: true };
}

export async function updateUserAddress(actorId: string, userId: string, addressId: string, input: unknown): Promise<Result> {
  const parsed = addressSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  const t = await loadTarget(actorId, userId, { allowAdmin: true, allowSelf: true });
  if ("error" in t) return { ok: false, error: t.error };
  return db.transaction(async (tx) => {
    const done = await tx.update(addresses).set(parsed.data).where(and(eq(addresses.id, addressId), eq(addresses.userId, userId))).returning({ id: addresses.id });
    if (!done.length) return { ok: false as const, error: "Address not found" };
    await audit(tx, actorId, userId, "user.address_updated", { addressId });
    return { ok: true as const };
  });
}

export async function deleteUserAddress(actorId: string, userId: string, addressId: string): Promise<Result> {
  const t = await loadTarget(actorId, userId, { allowAdmin: true, allowSelf: true });
  if ("error" in t) return { ok: false, error: t.error };
  return db.transaction(async (tx) => {
    const done = await tx.delete(addresses).where(and(eq(addresses.id, addressId), eq(addresses.userId, userId))).returning({ id: addresses.id });
    if (!done.length) return { ok: false as const, error: "Address not found" };
    await audit(tx, actorId, userId, "user.address_deleted", { addressId });
    return { ok: true as const };
  });
}

/** Same rules as the customer's own "delete my account": refused while any order is still in progress. */
export async function deleteUserAccount(actorId: string, userId: string): Promise<Result> {
  const t = await loadTarget(actorId, userId);
  if ("error" in t) return { ok: false, error: t.error };
  const res = await deleteAccount(userId);
  if (!res.ok) return res;
  await audit(db, actorId, userId, "user.deleted", { removedUploads: res.removedUploads, hadEmail: t.user.email });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

/** "Chrome on macOS" from a User-Agent string (best effort; falls back to the raw start of it). */
export function describeAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\/|CriOS\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad|iOS/.test(ua) ? "iOS" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? ua.slice(0, 40);
}

/** Plain-English line for an audit entry. */
export function describeAudit(action: string, detail: Record<string, unknown>): string {
  switch (action) {
    case "user.block": return `Blocked${detail.reason ? `: ${String(detail.reason)}` : ""}`;
    case "user.unblock": return "Unblocked";
    case "user.sessions_ended": return `Signed out of all devices (${Number(detail.ended ?? 0)})`;
    case "user.session_ended": return "Signed out one device";
    case "user.reconsent_required": return "Required to accept the privacy policy again";
    case "user.profile_updated": return `Edited ${Object.keys(detail).filter((k) => k !== "adminNote").join(", ") || "private note"}`;
    case "user.address_updated": return "Edited a saved address";
    case "user.address_deleted": return "Deleted a saved address";
    case "user.deleted": return "Deleted the account";
    default: return action;
  }
}

/** Every session belonging to `userIds` (used by tests). */
export async function countSessions(userIds: string[]): Promise<number> {
  if (!userIds.length) return 0;
  const [r] = await db.select({ n: count() }).from(sessions).where(inArray(sessions.userId, userIds));
  return Number(r.n);
}
