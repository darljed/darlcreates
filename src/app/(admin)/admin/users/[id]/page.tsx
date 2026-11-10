import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/session";
import { describeAgent, describeAudit, getUserDetail, userStateOf } from "@/lib/user-admin";
import { formatPHP } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { Initials, RoleBadge, UserStatusBadge } from "@/components/admin/user-badges";
import { UserProfileForm } from "@/components/admin/user-profile-form";
import { UserControls } from "@/components/admin/user-controls";
import { UserSessions } from "@/components/admin/user-sessions";
import { UserAddresses } from "@/components/admin/user-addresses";
import { PageHeader, Panel } from "@/components/shell/ui";

export const metadata = { title: "User · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

const when = (d: Date) => d.toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

export default async function AdminUserPage({ params }: PageProps<"/admin/users/[id]">) {
  const { id } = await params;
  const admin = await requireAdmin();
  const d = await getUserDetail(id);
  if (!d) notFound();

  const { user } = d;
  const state = userStateOf(user);
  const isSelf = admin.id === user.id;
  const deleted = state === "deleted";

  return (
    <div className="max-w-6xl">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Initials name={user.name} className="size-10 text-sm" />
            <span className="min-w-0">
              <span className="block truncate">{user.name}</span>
              <span className="block truncate text-sm font-normal text-muted-foreground">{user.email}</span>
            </span>
          </span>
        }
        actions={
          <>
            <RoleBadge role={user.role} />
            <UserStatusBadge state={state} size="md" />
          </>
        }
      />

      {state === "blocked" && (
        <div role="status" className="mb-4 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <p className="font-semibold text-destructive">Blocked {user.blockedAt && when(user.blockedAt)}</p>
          {user.blockedReason && <p className="mt-0.5 text-muted-foreground">Reason (private): {user.blockedReason}</p>}
        </div>
      )}
      {deleted && (
        <div role="status" className="mb-4 rounded-md border bg-muted p-3 text-sm">
          <p className="font-semibold">Account deleted {user.deletedAt && when(user.deletedAt)}</p>
          <p className="mt-0.5 text-muted-foreground">Personal data was removed. Their orders and payments remain without any personal details.</p>
        </div>
      )}

      <dl className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          ["Orders", String(d.orderCount)],
          ["Spent", d.spentCents ? formatPHP(d.spentCents) : "-"],
          ["Joined", user.createdAt.toLocaleDateString("en-PH")],
          ["Privacy consent", user.consentAt ? user.consentAt.toLocaleDateString("en-PH") : "Not given"],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border bg-card p-3">
            <dt className="text-xs text-muted-foreground">{k}</dt>
            <dd className="mt-0.5 text-lg font-extrabold leading-tight">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <div className="space-y-4">
          <Panel title="Profile" description="What we have on file for them.">
            <UserProfileForm userId={user.id} initial={{ name: user.name, email: user.email, adminNote: user.adminNote }} locked={deleted} />
          </Panel>

          <Panel title="Saved addresses">
            <UserAddresses
              userId={user.id}
              locked={deleted}
              addresses={d.addresses.map((a) => ({
                id: a.id, label: a.label, recipient: a.recipient, phone: a.phone, line1: a.line1, line2: a.line2,
                barangay: a.barangay, city: a.city, province: a.province, postalCode: a.postalCode, isDefault: a.isDefault === 1,
              }))}
            />
          </Panel>

          <Panel title="Recent orders" actions={d.orderCount > d.orders.length ? <Link href={`/admin/orders?q=${encodeURIComponent(user.email)}`} className="text-xs font-semibold underline">All {d.orderCount}</Link> : undefined} flush>
            {d.orders.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              <ul className="divide-y">
                {d.orders.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <div>
                      <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:text-primary">
                        {o.orderNo}
                      </Link>
                      <span className="ml-2 text-xs text-muted-foreground">{o.placedAt.toLocaleDateString("en-PH")}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums">{formatPHP(o.totalCents)}</span>
                      <OrderStatusBadge status={o.status} size="sm" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Account controls">
            <UserControls userId={user.id} name={user.name} blocked={state === "blocked"} deleted={deleted} protectedAccount={user.role === "admin"} isSelf={isSelf} />
          </Panel>

          <Panel title="Signed in on" description="Devices with an active session.">
            <UserSessions
              userId={user.id}
              canEnd={!deleted && !isSelf}
              sessions={d.sessions.map((s) => ({
                id: s.id,
                device: describeAgent(s.userAgent),
                ip: s.ipAddress,
                createdAt: s.createdAt.toISOString(),
                expiresAt: s.expiresAt.toISOString(),
              }))}
            />
          </Panel>

          <Panel title="Activity log" description="What admins did to this account." flush>
            {d.audit.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">Nothing yet.</p>
            ) : (
              <ol className="divide-y">
                {d.audit.map((a) => (
                  <li key={a.id} className="px-4 py-2.5 text-sm">
                    <p>{describeAudit(a.action, a.detail as Record<string, unknown>)}</p>
                    <p className="text-xs text-muted-foreground">
                      {a.actorName ?? "An admin"} · {when(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
