import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getOrderByIdAdmin, ORDER_TRANSITIONS, type OrderStatus } from "@/lib/orders";
import { formatPHP } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { OrderAdminControls } from "@/components/admin/order-admin-controls";

export const metadata = { title: "Order · Admin" };

export default async function AdminOrderDetailPage({
  params,
}: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const order = await getOrderByIdAdmin(id);
  if (!order) notFound();

  const addr = order.shipAddress as Record<string, string>;
  const nextStatuses = ORDER_TRANSITIONS[order.status as OrderStatus] ?? [];

  return (
    <div className="max-w-4xl">
      <Link
        href="/admin/orders"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        ← Orders
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-extrabold md:text-3xl">{order.orderNo}</h1>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <section>
            <h2 className="mb-3 font-bold">Items &amp; print files</h2>
            <div className="space-y-3">
              {order.items.map((it) => (
                <div
                  key={it.id}
                  className="rounded-xl border-2 border-border bg-card p-4"
                >
                  <div className="flex justify-between">
                    <h3 className="font-bold">
                      {it.qty}× {it.name}
                    </h3>
                    <span className="font-extrabold text-primary">
                      {formatPHP(it.unitPriceCents * it.qty)}
                    </span>
                  </div>
                  <ul className="mt-1 text-sm text-muted-foreground">
                    {it.summary.map((s) => (
                      <li key={s.label}>
                        <span className="font-medium">{s.label}:</span> {s.value}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-3 flex items-center gap-3">
                    {it.stlKey ? (
                      <a
                        href={`/admin/orders/${order.id}/stl/${it.id}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        <Download className="size-4" /> Download STL
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No STL attached to this product
                      </span>
                    )}
                    {it.imageUrl && (
                      <a
                        href={it.imageUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm underline"
                      >
                        Customer image
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border-2 border-border bg-card p-4">
            <h2 className="font-bold">Ship to</h2>
            <p className="mt-1 text-sm">
              {addr.recipient} · {addr.phone}
              <br />
              {addr.line1} {addr.line2}
              <br />
              {[addr.barangay, addr.city, addr.province, addr.postalCode]
                .filter(Boolean)
                .join(", ")}
            </p>
          </section>

          {order.latestPayment && (
            <section className="rounded-xl border-2 border-border bg-card p-4 text-sm">
              <h2 className="font-bold">Latest payment</h2>
              <p className="mt-1">
                GCash ref{" "}
                <span className="font-mono">{order.latestPayment.reference}</span>{" "}
                · {formatPHP(order.latestPayment.amountCents)} ·{" "}
                <span className="font-semibold capitalize">
                  {order.latestPayment.status}
                </span>
              </p>
            </section>
          )}
        </div>

        <aside className="h-fit space-y-6">
          <div className="rounded-xl border-2 border-border bg-muted/40 p-4 text-sm">
            <Row label="Subtotal" value={formatPHP(order.subtotalCents)} />
            <Row label="Shipping" value={formatPHP(order.shippingCents)} />
            <div className="mt-2 flex justify-between border-t pt-2 font-extrabold">
              <span>Total</span>
              <span className="text-primary">{formatPHP(order.totalCents)}</span>
            </div>
          </div>

          <OrderAdminControls
            orderId={order.id}
            nextStatuses={nextStatuses}
            shipment={order.shipment}
          />
        </aside>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
