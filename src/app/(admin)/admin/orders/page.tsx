import Link from "next/link";
import { adminListOrders } from "@/lib/admin";
import { formatPHP } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status-badge";
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
];

export default async function AdminOrdersPage({ searchParams }: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const orders = await adminListOrders(status || undefined);

  return (
    <div>
      <PageHeader title="Orders" />

      <nav aria-label="Filter by status" className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/admin/orders?status=${f.key}` : "/admin/orders"}
            aria-current={status === f.key ? "page" : undefined}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${
              status === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card hover:border-primary"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </nav>

      {orders.length === 0 ? (
        <EmptyState>No orders.</EmptyState>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Order</Th>
              <Th>Placed</Th>
              <Th>Total</Th>
              <Th>Status</Th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <Tr key={o.id}>
                <Td>
                  <Link href={`/admin/orders/${o.id}`} className="font-semibold hover:text-primary">
                    {o.orderNo}
                  </Link>
                </Td>
                <Td className="text-muted-foreground">{o.placedAt.toLocaleDateString("en-PH")}</Td>
                <Td>{formatPHP(o.totalCents)}</Td>
                <Td>
                  <OrderStatusBadge status={o.status} size="sm" />
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
