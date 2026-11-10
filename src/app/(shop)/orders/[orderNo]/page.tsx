import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { getOrderForUser } from "@/lib/orders";
import { formatPHP } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { OrderTimeline } from "@/components/order-timeline";
import { GcashPaymentPanel } from "@/components/gcash-payment-panel";

// Per-user, uncacheable order page — render at request time (no prerender).
export const instant = false;

export async function generateMetadata({
  params,
}: PageProps<"/orders/[orderNo]">) {
  const { orderNo } = await params;
  return { title: `Order ${orderNo}` };
}

export default async function OrderPage({
  params,
}: PageProps<"/orders/[orderNo]">) {
  const { orderNo } = await params;
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <Suspense fallback={<p className="text-muted-foreground">Loading order…</p>}>
          <OrderContents orderNo={orderNo} />
        </Suspense>
      </div>
    </main>
  );
}

async function OrderContents({ orderNo }: { orderNo: string }) {
  const user = await getCurrentUser();
  if (!user) redirect(`/sign-in?redirect=/orders/${orderNo}`);

  const order = await getOrderForUser(orderNo, user.id);
  if (!order) notFound();

  const gcashName = process.env.NEXT_PUBLIC_GCASH_NAME ?? "Darl Creates";
  const gcashNumber = process.env.NEXT_PUBLIC_GCASH_NUMBER ?? "";

  return (
    <>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold md:text-3xl">
            Order {order.orderNo}
          </h1>
          <p className="text-sm text-muted-foreground">
            Placed {order.placedAt.toLocaleDateString("en-PH")}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      {order.status === "awaiting_payment" && (
        <GcashPaymentPanel
          orderNo={order.orderNo}
          totalCents={order.totalCents}
          gcashName={gcashName}
          gcashNumber={gcashNumber}
          latestPayment={order.latestPayment}
        />
      )}

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_280px]">
        <div>
          <h2 className="mb-3 font-bold">Items</h2>
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
          </div>

          {order.shipment?.trackingNo && (
            <div className="mt-6 rounded-xl border-2 border-border bg-card p-4">
              <h2 className="font-bold">Shipping</h2>
              <p className="mt-1 text-sm">
                {order.shipment.carrier} · Tracking:{" "}
                <span className="font-mono">{order.shipment.trackingNo}</span>
              </p>
            </div>
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

          <div>
            <h2 className="mb-2 font-bold">Progress</h2>
            <OrderTimeline history={order.history} current={order.status} />
          </div>
        </aside>
      </div>
    </>
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
