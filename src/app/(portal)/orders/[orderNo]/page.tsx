import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getOrderForUser } from "@/lib/orders";
import { formatPHP } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { OrderTimeline } from "@/components/order-timeline";
import { OrderProgress } from "@/components/order-progress";
import { CancelOrderButton, ReorderButton } from "@/components/order-actions";
import { GcashPaymentPanel } from "@/components/gcash-payment-panel";
import { PageHeader, Panel } from "@/components/shell/ui";

// Per-user, uncacheable order page — render at request time (no prerender).
export const instant = false;

export async function generateMetadata({ params }: PageProps<"/orders/[orderNo]">) {
  const { orderNo } = await params;
  return { title: `Order ${orderNo}` };
}

export default async function OrderPage({ params }: PageProps<"/orders/[orderNo]">) {
  const { orderNo } = await params;
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading order…</p>}>
      <OrderContents orderNo={orderNo} />
    </Suspense>
  );
}

async function OrderContents({ orderNo }: { orderNo: string }) {
  const user = await requireUser(`/orders/${orderNo}`);

  const order = await getOrderForUser(orderNo, user.id);
  if (!order) notFound();

  const gcashName = process.env.NEXT_PUBLIC_GCASH_NAME ?? "Darl Creates";
  const gcashNumber = process.env.NEXT_PUBLIC_GCASH_NUMBER ?? "";
  const canCancel = order.status === "awaiting_payment" && order.latestPayment?.status !== "pending";
  const reviewable = order.status === "delivered" ? order.items.filter((i) => i.slug) : [];

  return (
    <div className="max-w-5xl space-y-5">
      <PageHeader
        title={`Order ${order.orderNo}`}
        description={`Placed ${order.placedAt.toLocaleDateString("en-PH")}`}
        actions={
          <>
            <Link href={`/orders/${order.orderNo}/acknowledgment`} className="text-sm font-semibold underline">
              Order Acknowledgment
            </Link>
            <OrderStatusBadge status={order.status} />
          </>
        }
      />

      <OrderProgress status={order.status} />

      {order.status === "awaiting_payment" && (
        <GcashPaymentPanel
          orderNo={order.orderNo}
          totalCents={order.totalCents}
          gcashName={gcashName}
          gcashNumber={gcashNumber}
          latestPayment={order.latestPayment}
        />
      )}

      {reviewable.length > 0 && (
        <Panel title="How did it turn out?" description="Your review helps other customers.">
          <ul className="flex flex-wrap gap-2">
            {reviewable.map((it) => (
              <li key={it.id}>
                <Link
                  href={`/products/${it.slug}#reviews`}
                  className="inline-block rounded-md border px-3 py-1.5 text-sm font-semibold hover:border-primary hover:text-primary"
                >
                  Review {it.name}
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <div className="grid gap-5 md:grid-cols-[1fr_280px]">
        <div className="space-y-5">
          <Panel title="Items" bodyClassName="space-y-3">
            {order.items.map((it) => (
              <div key={it.id} className="rounded-md border p-3">
                <div className="flex justify-between gap-3">
                  <h3 className="font-bold">
                    {it.qty}× {it.name}
                  </h3>
                  <span className="font-extrabold text-primary">{formatPHP(it.unitPriceCents * it.qty)}</span>
                </div>
                {it.imageUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.imageUrl} alt="Your uploaded image" className="mt-2 size-14 rounded-md border object-cover" />
                )}
                <ul className="mt-1 text-sm text-muted-foreground">
                  {it.summary.map((s) => (
                    <li key={s.label}>
                      <span className="font-medium">{s.label}:</span> {s.value}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Panel>

          {order.shipment?.trackingNo && (
            <Panel title="Shipping">
              <p className="text-sm">
                {order.shipment.carrier} · Tracking: <span className="font-mono">{order.shipment.trackingNo}</span>
              </p>
            </Panel>
          )}
        </div>

        <aside className="h-fit space-y-5">
          <div className="rounded-lg border bg-muted/40 p-4 text-sm">
            <Row label="Subtotal" value={formatPHP(order.subtotalCents)} />
            <Row label="Shipping" value={formatPHP(order.shippingCents)} />
            <div className="mt-2 flex justify-between border-t pt-2 font-extrabold">
              <span>Total</span>
              <span className="text-primary">{formatPHP(order.totalCents)}</span>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <ReorderButton orderNo={order.orderNo} />
            {canCancel && <CancelOrderButton orderNo={order.orderNo} />}
          </div>

          <Panel title="Activity">
            <OrderTimeline history={order.history} />
          </Panel>
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
