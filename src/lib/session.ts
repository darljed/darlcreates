import { headers } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { auth } from "./auth";
import { getConsent, hasCurrentConsent } from "./privacy";
import { getPrivacyVersion } from "./site-content";
import { safeRedirect } from "./safe-redirect";

/**
 * The signed-in user (or null). Reads the session from request headers.
 * Session validation compares the expiry to the current time, which Next 16
 * (Cache Components) refuses to do during prerender — so mark this as
 * request-time first. Callers must be inside <Suspense> or a dynamic route.
 */
export async function getCurrentUser() {
  await connection();
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/**
 * Require any authenticated user; redirect to sign-in otherwise. Users who haven't accepted
 * the current privacy policy are sent to /consent first (RA 10173), and a deleted account
 * is never allowed back in. Pass `where` so they return to the page they wanted.
 */
export async function requireUser(where = "/") {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirect=${encodeURIComponent(safeRedirect(where))}`);
  const c = await getConsent(user.id);
  if (c?.deletedAt) redirect("/sign-in");
  if (c?.blockedAt) redirect("/sign-in?error=blocked");
  if (!hasCurrentConsent(c, await getPrivacyVersion())) redirect(`/consent?redirect=${encodeURIComponent(safeRedirect(where))}`);
  return user;
}

/** Why a signed-in/out visitor may not proceed yet. "ok" carries the user. */
export type Access =
  | { state: "ok"; user: NonNullable<Awaited<ReturnType<typeof getCurrentUser>>> }
  | { state: "signed_out" | "consent" | "blocked" | "deleted" };

/**
 * Non-redirecting twin of requireUser() for Server Actions called from client code, which can then keep the
 * customer's work (e.g. a customized product) and send them through sign-in or consent themselves, instead of the
 * action redirecting away and losing it. Same checks, same order as requireUser().
 */
export async function getAccess(): Promise<Access> {
  const user = await getCurrentUser();
  if (!user) return { state: "signed_out" };
  const c = await getConsent(user.id);
  if (c?.deletedAt) return { state: "deleted" };
  if (c?.blockedAt) return { state: "blocked" };
  if (!hasCurrentConsent(c, await getPrivacyVersion())) return { state: "consent" };
  return { state: "ok", user };
}

/**
 * Require an admin. Server-side RBAC gate for every /admin route and admin
 * Server Action. A non-admin is sent home — never shown partial admin data.
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if ((user as { role?: string | null }).role !== "admin") redirect("/");
  return user;
}

export function isAdmin(user: { role?: string | null } | null | undefined) {
  return user?.role === "admin";
}
