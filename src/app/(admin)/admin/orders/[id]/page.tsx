import Link from "next/link";
import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { getOrderByIdAdmin, ORDER_TRANSITIONS, type OrderStatus } from "@/lib/orders";
import { formatPHP } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { OrderAdminControls } from "@/components/admin/order-admin-controls";
import { PageHeader, Panel } from "@/components/shell/ui";
import { db } from "@/db";
import { users } from "@/db/schema";
import { eq } from "drizzle-orm";

export const metadata = { title: "Order · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

export default async function AdminOrderDetailPage({
  params,
}: PageProps<"/admin/orders/[id]">) {
  const { id } = await params;
  const order = await getOrderByIdAdmin(id);
  if (!order) notFound();

  const [customer] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, order.userId)).limit(1);
  const addr = order.shipAddress as Record<string, string>;
  const nextStatuses = ORDER_TRANSITIONS[order.status as OrderStatus] ?? [];

  return (
    <div className="max-w-5xl">
      <PageHeader
        title={order.orderNo}
        actions={
          <>
            <Link href={`/admin/orders/${order.id}/waybill`} className="text-xs font-semibold underline">
              Print waybill
            </Link>
            <Link href={`/admin/orders/${order.id}/acknowledgment`} className="text-xs font-semibold underline">
              Order Acknowledgment
            </Link>
            <OrderStatusBadge status={order.status} />
          </>
        }
      />

      <div className="grid gap-4 md:grid-cols-[1fr_300px]">
        <div className="space-y-4">
          <Panel title="Items &amp; print files" bodyClassName="space-y-2">
            <div className="space-y-2">
              {order.items.map((it) => (
                <div
                  key={it.id}
                  className="rounded-md border p-3"
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
                    {it.clicker ? (
                      <>
                        <a
                          href={`/admin/orders/${order.id}/stl/${it.id}`}
                          className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                        >
                          <Download className="size-4" /> Download 3MF (clicker design)
                        </a>
                        {it.designUri && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.designUri} alt="The customer's clicker design" className="size-20 rounded-md border bg-muted/40 object-contain" />
                        )}
                      </>
                    ) : it.stlKey ? (
                      <a
                        href={`/admin/orders/${order.id}/stl/${it.id}`}
                        className="inline-flex items-center gap-1 rounded-md bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground hover:bg-primary/90"
                      >
                        <Download className="size-4" /> {it.nameText ? `Download 3MF with the name “${it.nameText}”` : "Download STL"}
                      </a>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No STL attached to this product
                      </span>
                    )}
                    {it.imageUrl && (
                      <a href={it.imageUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-sm font-semibold underline">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={it.imageUrl} alt="Customer's uploaded image" className="size-14 rounded-md border object-cover" />
                        Open customer image
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          <Panel title="Customer">
            <p className="text-sm">
              <Link href={`/admin/users/${order.userId}`} className="font-semibold hover:text-primary hover:underline">
                {customer?.name ?? "Unknown customer"}
              </Link>
              {customer && <span className="text-muted-foreground"> · {customer.email}</span>}
            </p>
          </Panel>

          <Panel title="Ship to">
            <p className="text-sm">
              {addr.recipient} · {addr.phone}
              <br />
              {addr.line1} {addr.line2}
              <br />
              {[addr.barangay, addr.city, addr.province, addr.postalCode]
                .filter(Boolean)
                .join(", ")}
            </p>
          </Panel>

          {order.latestPayment && (
            <Panel title="Latest payment">
              <p className="text-sm">
                GCash ref{" "}
                <span className="font-mono">{order.latestPayment.reference}</span>{" "}
                · {formatPHP(order.latestPayment.amountCents)} ·{" "}
                <span className="font-semibold capitalize">
                  {order.latestPayment.status}
                </span>
              </p>
            </Panel>
          )}
        </div>

        <aside className="h-fit space-y-4">
          <div className="rounded-lg border bg-muted/40 p-3 text-sm">
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
