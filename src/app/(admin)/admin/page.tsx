import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { DataTable, EmptyState, PageHeader, Panel, Stat, Td, Th, Tr } from "@/components/shell/ui";
import { adminBadgeCounts } from "@/lib/admin-counts";
import { adminDashboard, adminRecentOrders, adminRevenueSeries } from "@/lib/admin";
import { formatPHP } from "@/lib/money";

export const metadata = { title: "Admin Dashboard" };
// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function AdminDashboardPage() {
  const [stats, series, recent, counts] = await Promise.all([
    adminDashboard(), adminRevenueSeries(30), adminRecentOrders(8), adminBadgeCounts(),
  ]);
  const attention = [
    counts.pendingPayments && { href: "/admin/payments", text: `${counts.pendingPayments} payment${counts.pendingPayments > 1 ? "s" : ""} to verify` },
    counts.pendingReviews && { href: "/admin/reviews", text: `${counts.pendingReviews} review${counts.pendingReviews > 1 ? "s" : ""} to approve` },
    stats.paidOrders - stats.inProduction - stats.shipped - stats.delivered > 0 && { href: "/admin/orders?status=paid", text: "Paid orders waiting to start production" },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" description="Verified payments only. Cancelled and refunded orders are excluded." />

      {attention.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-accent bg-accent/30 px-3 py-2 text-sm" role="status">
          <span className="inline-flex items-center gap-1.5 font-semibold"><AlertCircle className="size-4" aria-hidden /> Needs attention</span>
          {attention.map((a) => <Link key={a.href} href={a.href} className="underline underline-offset-2 hover:text-primary">{a.text}</Link>)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Verified revenue" value={formatPHP(stats.revenueCents)} tone="primary" hint="excl. cancelled" />
        <Stat label="Awaiting payment" value={stats.awaitingPayment} href="/admin/orders?status=awaiting_payment" hint="unpaid orders" />
        <Stat label="Paid orders" value={stats.paidOrders} href="/admin/orders?status=paid" hint="incl. shipped" />
        <Stat label="In production" value={stats.inProduction} href="/admin/orders?status=in_production" hint="being printed" />
        <Stat label="Shipped" value={stats.shipped} href="/admin/orders?status=shipped" hint="on the way" />
        <Stat label="Delivered" value={stats.delivered} href="/admin/orders?status=delivered" hint="completed" />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Revenue, last 30 days" className="lg:col-span-2"><RevenueChart points={series} /></Panel>
        <Panel title="Top products" flush>
          {stats.topProducts.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">No orders yet.</p>
          ) : (
            <ul className="divide-y text-[13px]">
              {stats.topProducts.map((p) => (
                <li key={p.name} className="flex justify-between gap-2 px-3 py-1.5"><span className="truncate">{p.name}</span><span className="font-bold">{p.qty}</span></li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Recent orders" actions={<Link href="/admin/orders" className="text-xs font-semibold underline">All orders</Link>} flush>
        {recent.length === 0 ? <EmptyState>No orders yet.</EmptyState> : (
          <DataTable className="border-0">
            <thead><tr><Th>Order</Th><Th>Customer</Th><Th>Placed</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead>
            <tbody>
              {recent.map((o) => (
                <Tr key={o.id}>
                  <Td><Link href={`/admin/orders/${o.id}`} className="font-semibold hover:text-primary">{o.orderNo}</Link></Td>
                  <Td label="Customer" className="text-muted-foreground">{o.customer}</Td>
                  <Td label="Placed" className="text-muted-foreground">{o.placedAt.toLocaleDateString("en-PH")}</Td>
                  <Td label="Total" className="text-right tabular-nums">{formatPHP(o.totalCents)}</Td>
                  <Td label="Status"><OrderStatusBadge status={o.status} size="sm" /></Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>
    </div>
  );
}
