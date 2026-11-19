import Link from "next/link";
import { connection } from "next/server";
import { AlertCircle } from "lucide-react";
import { RevenueChart } from "@/components/admin/revenue-chart";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { DataTable, EmptyState, PageHeader, Panel, Stat, Td, Th, Tr } from "@/components/shell/ui";
import { adminBadgeCounts } from "@/lib/admin-counts";
import { adminDashboard, adminRecentOrders } from "@/lib/admin";
import { formatPHP } from "@/lib/money";
import { revenueSeriesBySource, topProductsBySource, workshopSummary } from "@/lib/workshop/summary";

export const metadata = { title: "Admin Dashboard" };
// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function AdminDashboardPage() {
  await connection(); // the workshop windows use the current time, which Cache Components forbids during prerender
  const [stats, series, recent, counts, shop, top] = await Promise.all([
    adminDashboard(), revenueSeriesBySource(30), adminRecentOrders(8), adminBadgeCounts(), workshopSummary(), topProductsBySource(5),
  ]);
  const onlineAll = stats.revenueCents;
  const offsiteAll = shop.allTime.offsite.revenueCents;
  const totalAll = onlineAll + offsiteAll;
  const share = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}% of total` : "no revenue yet");
  const month = shop.windows[2];
  const monthTotal = month.online.revenueCents + month.manual.revenueCents;
  const onlineShare = monthTotal > 0 ? (month.online.revenueCents / monthTotal) * 100 : 0;
  /** Profit is only known for online orders that were costed; say so rather than show a made-up number. */
  const onlineProfit = (w: (typeof shop.windows)[number]) => (w.online.cogsCents > 0 ? formatPHP(w.online.costedRevenueCents - w.online.cogsCents) : "–");
  const attention = [
    counts.pendingPayments && { href: "/admin/payments", text: `${counts.pendingPayments} payment${counts.pendingPayments > 1 ? "s" : ""} to verify` },
    counts.pendingReviews && { href: "/admin/reviews", text: `${counts.pendingReviews} review${counts.pendingReviews > 1 ? "s" : ""} to approve` },
    stats.paidOrders - stats.inProduction - stats.shipped - stats.delivered > 0 && { href: "/admin/orders?status=paid", text: "Paid orders waiting to start production" },
  ].filter(Boolean) as { href: string; text: string }[];

  return (
    <div className="space-y-4">
      <PageHeader title="Dashboard" description="Online = website orders with a verified payment. Off-site = sales you logged by hand (Messenger, in person) and marked Paid. Cancelled and refunded are excluded." />

      {attention.length > 0 && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-accent bg-accent/30 px-3 py-2 text-sm" role="status">
          <span className="inline-flex items-center gap-1.5 font-semibold"><AlertCircle className="size-4" aria-hidden /> Needs attention</span>
          {attention.map((a) => <Link key={a.href} href={a.href} className="underline underline-offset-2 hover:text-primary">{a.text}</Link>)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Total revenue" value={formatPHP(totalAll)} tone="primary" hint="online + off-site, all time" />
        <Stat label="Online" value={formatPHP(onlineAll)} href="/admin/orders" hint={share(onlineAll, totalAll)} />
        <Stat label="Off-site" value={formatPHP(offsiteAll)} href="/admin/sales" hint={share(offsiteAll, totalAll)} />
        <Stat label="Owed to you" value={formatPHP(shop.allTime.offsite.pendingCents)} href="/admin/sales" hint="unpaid off-site sales" tone={shop.allTime.offsite.pendingCents > 0 ? "warn" : "default"} />
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Panel title="Revenue, last 30 days" description="Each bar is a day: online at the bottom, off-site on top." className="lg:col-span-2"><RevenueChart points={series} /></Panel>
        <Panel title="Top products" description="Units sold, by where they sold" flush>
          {top.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">Nothing sold yet.</p>
          ) : (
            <ul className="divide-y text-[13px]">
              {top.map((p) => (
                <li key={p.name} className="flex items-center justify-between gap-2 px-3 py-1.5">
                  <span className="truncate">{p.name}</span>
                  <span className="shrink-0 text-xs text-muted-foreground"><span className="font-bold text-foreground">{p.online + p.offsite}</span> · {p.online} online · {p.offsite} off-site</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel title="Revenue and profit by source" description="Profit needs a cost: off-site sales save the product's cost; online profit counts only orders whose products have costing set up." flush>
        <div className="space-y-1 border-b bg-card px-3 py-2.5">
          <p className="text-xs text-muted-foreground">This month: {formatPHP(monthTotal)}</p>
          <div className="flex h-3 overflow-hidden bg-muted" role="img" aria-label={`This month ${Math.round(onlineShare)}% online, ${monthTotal > 0 ? 100 - Math.round(onlineShare) : 0}% off-site`}>
            {monthTotal > 0 && <div className="bg-primary" style={{ width: `${onlineShare}%` }} />}
            {monthTotal > 0 && <div className="bg-accent" style={{ width: `${100 - onlineShare}%` }} />}
          </div>
          <p className="flex flex-wrap gap-x-4 text-xs">
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 bg-primary" aria-hidden /> Online {formatPHP(month.online.revenueCents)}</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2.5 bg-accent" aria-hidden /> Off-site {formatPHP(month.manual.revenueCents)}</span>
          </p>
        </div>
        <DataTable className="border-0">
          <thead>
            <tr><Th rowSpan={2}>Period</Th><Th colSpan={3} className="border-l text-center">Revenue</Th><Th colSpan={2} className="border-l text-center">Profit</Th></tr>
            <tr><Th className="border-l text-right">Online</Th><Th className="text-right">Off-site</Th><Th className="text-right">Total</Th><Th className="border-l text-right">Online (costed)</Th><Th className="text-right">Off-site</Th></tr>
          </thead>
          <tbody>
            {shop.windows.map((w) => (
              <Tr key={w.label}>
                <Td className="font-semibold">{w.label}</Td>
                <Td label="Online revenue" className="border-l text-right tabular-nums">{formatPHP(w.online.revenueCents)}</Td>
                <Td label="Off-site revenue" className="text-right tabular-nums">{formatPHP(w.manual.revenueCents)}</Td>
                <Td label="Total revenue" className="text-right font-bold tabular-nums">{formatPHP(w.online.revenueCents + w.manual.revenueCents)}</Td>
                <Td label="Online profit (costed)" className="border-l text-right tabular-nums">{onlineProfit(w)}</Td>
                <Td label="Off-site profit" className="text-right tabular-nums">{formatPHP(w.manual.profitCents)}</Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      </Panel>

      <div>
        <h2 className="mb-2 text-sm font-bold">Online orders <span className="font-normal text-muted-foreground">(website)</span></h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat label="Awaiting payment" value={stats.awaitingPayment} href="/admin/orders?status=awaiting_payment" hint="unpaid orders" />
          <Stat label="Paid orders" value={stats.paidOrders} href="/admin/orders?status=paid" hint="incl. shipped" />
          <Stat label="In production" value={stats.inProduction} href="/admin/orders?status=in_production" hint="being printed" />
          <Stat label="Shipped" value={stats.shipped} href="/admin/orders?status=shipped" hint="on the way" />
          <Stat label="Delivered" value={stats.delivered} href="/admin/orders?status=delivered" hint="completed" />
        </div>
      </div>

      <Panel title="Stock" actions={<Link href="/admin/inventory" className="text-xs font-semibold underline">Inventory</Link>} flush>
        <div className="grid gap-px bg-border md:grid-cols-3">
          <div className="space-y-1 bg-card p-3 text-sm">
            <p className="text-xs text-muted-foreground">Stock value</p>
            <p className="text-lg font-extrabold tabular-nums">{formatPHP(shop.inventoryValueCents)}</p>
            <p className="text-xs text-muted-foreground">{shop.partsCount} part{shop.partsCount === 1 ? "" : "s"}</p>
          </div>
          <div className="space-y-1 bg-card p-3 text-sm md:col-span-2">
            <p className="text-xs text-muted-foreground">Running low ({shop.lowStock.length})</p>
            {shop.lowStock.length === 0 ? <p className="text-xs text-muted-foreground">Nothing is at or below its reorder level.</p> : (
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {shop.lowStock.slice(0, 8).map((p) => (
                  <li key={p.id}><Link href="/admin/inventory" className="font-semibold hover:text-primary">{p.name}</Link> <span className="text-muted-foreground">{Math.round(p.qtyOnHand * 100) / 100} {p.unit} left</span></li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </Panel>

      <Panel title="Recent orders" description="Online orders" actions={<Link href="/admin/orders" className="text-xs font-semibold underline">All orders</Link>} flush>
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
