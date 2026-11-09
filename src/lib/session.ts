import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "./auth";

/** The signed-in user (or null). Reads the session from request headers. */
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user ?? null;
}

/** Require any authenticated user; redirect to sign-in otherwise. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * Require an admin. Server-side RBAC gate for every /admin route and admin
 * Server Action. A non-admin is sent home — never shown partial admin data.
 */
export async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if ((user as { role?: string }).role !== "admin") redirect("/");
  return user;
}

export function isAdmin(user: { role?: string } | null | undefined) {
  return user?.role === "admin";
}
