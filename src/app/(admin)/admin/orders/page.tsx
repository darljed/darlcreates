import Link from "next/link";
import { adminListOrders } from "@/lib/admin";
import { formatPHP } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status-badge";

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

export default async function AdminOrdersPage({
  searchParams,
}: PageProps<"/admin/orders">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" ? sp.status : "";
  const orders = await adminListOrders(status || undefined);

  return (
    <div>
      <h1 className="mb-6 text-3xl font-extrabold">Orders</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/admin/orders?status=${f.key}` : "/admin/orders"}
            className={`rounded-full border-2 px-3 py-1 text-sm font-medium ${
              status === f.key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-primary"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {orders.length === 0 ? (
        <p className="text-muted-foreground">No orders.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border-2 border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="p-3 font-semibold">Order</th>
                <th className="p-3 font-semibold">Placed</th>
                <th className="p-3 font-semibold">Total</th>
                <th className="p-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t">
                  <td className="p-3">
                    <Link
                      href={`/admin/orders/${o.id}`}
                      className="font-semibold hover:text-primary"
                    >
                      {o.orderNo}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">
                    {o.placedAt.toLocaleDateString("en-PH")}
                  </td>
                  <td className="p-3">{formatPHP(o.totalCents)}</td>
                  <td className="p-3">
                    <OrderStatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
