/**
 * Small display bits for users: status badge (active / blocked / deleted), admin role badge and the initials
 * avatar.
 */
import { cn } from "@/lib/utils";
import type { UserState } from "@/lib/user-admin";

const STATE: Record<UserState, { label: string; cls: string }> = {
  active: { label: "Active", cls: "bg-green-100 text-green-800" },
  blocked: { label: "Blocked", cls: "bg-destructive/15 text-destructive" },
  deleted: { label: "Deleted", cls: "bg-muted text-muted-foreground" },
};

export function UserStatusBadge({ state, size = "sm" }: { state: UserState; size?: "sm" | "md" }) {
  const s = STATE[state];
  return <span className={cn("inline-flex whitespace-nowrap rounded-full font-bold", size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-sm", s.cls)}>{s.label}</span>;
}

export function RoleBadge({ role }: { role: "customer" | "admin" }) {
  if (role !== "admin") return null;
  return <span className="inline-flex whitespace-nowrap rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">Admin</span>;
}

/** Initials in a circle, for lists. */
export function Initials({ name, className }: { name: string; className?: string }) {
  const t = name.split(" ").filter(Boolean).map((n) => n[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <span aria-hidden className={cn("flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-bold text-accent-foreground", className)}>
      {t}
    </span>
  );
}
