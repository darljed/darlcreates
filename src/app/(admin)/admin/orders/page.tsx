import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { adminListOrders, adminOrderStatusCounts } from "@/lib/admin";
import { formatPHP } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, PageHeader, Td, Th, Tr } from "@/components/shell/ui";

export const metadata = { title: "Orders · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

const FILTERS = [
  { key: "", label: "All" },
  { key: "awaiting_payment", label: "Awaiting payment" },
  { key: "paid", label: "Paid" },
  { key: "in_production", label: "In production" },
  { key: "ready_to_ship", label: "Ready to ship" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
  { key: "cancelled", label: "Cancelled" },
  { key: "refunded", label: "Refunded" },
];

const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : "");

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const status = one(sp.status);
  const q = one(sp.q).trim();
  const page = Math.max(1, Number.parseInt(one(sp.page), 10) || 1);

  const [{ rows, total, pageSize }, counts] = await Promise.all([
    adminListOrders({ status: status || undefined, q: q || undefined, page }),
    adminOrderStatusCounts(),
  ]);
  const all = Object.values(counts).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  const href = (over: { status?: string; page?: number }) => {
    const p = new URLSearchParams();
    const s = over.status ?? status;
    if (s) p.set("status", s);
    if (q) p.set("q", q);
    if ((over.page ?? 1) > 1) p.set("page", String(over.page));
    const qs = p.toString();
    return qs ? `/admin/orders?${qs}` : "/admin/orders";
  };

  return (
    <div>
      <PageHeader
        title="Orders"
        description={`${all.toLocaleString()} order${all === 1 ? "" : "s"} in total`}
        actions={
          <form action="/admin/orders" role="search" className="relative">
            {status && <input type="hidden" name="status" value={status} />}
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Order no., name or email"
              aria-label="Search orders"
              className="h-8 w-64 rounded-md border bg-background pl-8 pr-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </form>
        }
      />

      <nav aria-label="Filter by status" className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.filter((f) => !f.key || counts[f.key]).map((f) => (
          <Link
            key={f.key}
            href={href({ status: f.key, page: 1 })}
            aria-current={status === f.key ? "page" : undefined}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              status === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"
            }`}
          >
            {f.label}
            <span className={`ml-1.5 tabular-nums ${status === f.key ? "opacity-80" : "text-muted-foreground"}`}>
              {f.key ? counts[f.key] : all}
            </span>
          </Link>
        ))}
      </nav>

      {rows.length === 0 ? (
        <EmptyState
          action={
            (q || status) && (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/orders">Clear filters</Link>
              </Button>
            )
          }
        >
          {q ? `No orders match “${q}”.` : "No orders."}
        </EmptyState>
      ) : (
        <>
          <DataTable>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Customer</Th>
                <Th>Items</Th>
                <Th>Placed</Th>
                <Th className="text-right">Total</Th>
                <Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((o) => (
                <Tr key={o.id}>
                  <Td className="whitespace-nowrap">
                    <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:text-primary">
                      {o.orderNo}
                    </Link>
                  </Td>
                  <Td label="Customer">
                    {o.customer}
                    <span className="block max-w-48 truncate text-xs text-muted-foreground">{o.email}</span>
                  </Td>
                  <Td label="Items" className="max-w-64 truncate text-muted-foreground" title={o.itemsLabel ?? undefined}>
                    {o.itemsLabel}
                  </Td>
                  <Td label="Placed" className="whitespace-nowrap text-muted-foreground">
                    {o.placedAt.toLocaleDateString("en-PH")}
                  </Td>
                  <Td label="Total" className="whitespace-nowrap text-right tabular-nums">
                    {formatPHP(o.totalCents)}
                  </Td>
                  <Td label="Status">
                    <OrderStatusBadge status={o.status} size="sm" />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>

          <nav aria-label="Pagination" className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <p>
              Showing {from}–{to} of {total.toLocaleString()}
            </p>
            {pages > 1 && (
              <div className="flex items-center gap-1.5">
                <Button asChild variant="outline" size="sm" disabled={page <= 1}>
                  <Link href={href({ page: page - 1 })} aria-disabled={page <= 1} aria-label="Previous page" className={page <= 1 ? "pointer-events-none opacity-50" : ""}>
                    <ChevronLeft className="size-4" /> Prev
                  </Link>
                </Button>
                <span className="px-1 tabular-nums">
                  Page {page} of {pages}
                </span>
                <Button asChild variant="outline" size="sm" disabled={page >= pages}>
                  <Link href={href({ page: page + 1 })} aria-disabled={page >= pages} aria-label="Next page" className={page >= pages ? "pointer-events-none opacity-50" : ""}>
                    Next <ChevronRight className="size-4" />
                  </Link>
                </Button>
              </div>
            )}
          </nav>
        </>
      )}
    </div>
  );
}
