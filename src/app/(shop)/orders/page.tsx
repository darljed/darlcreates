import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { listUserOrders } from "@/lib/orders";
import { formatPHP } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { Button } from "@/components/ui/button";

export const metadata = { title: "My Orders" };

export default function OrdersPage() {
  return (
    <main className="flex-1">
      <div className="mx-auto max-w-4xl px-6 py-10">
        <h1 className="mb-8 text-3xl font-extrabold">My Orders</h1>
        <Suspense fallback={<p className="text-muted-foreground">Loading…</p>}>
          <OrdersList />
        </Suspense>
      </div>
    </main>
  );
}

async function OrdersList() {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in?redirect=/orders");

  const orders = await listUserOrders(user.id);
  if (orders.length === 0) {
    return (
      <div className="rounded-xl border-2 border-dashed p-10 text-center">
        <p className="text-muted-foreground">No orders yet.</p>
        <Button asChild className="mt-4 bg-primary text-primary-foreground">
          <Link href="/products">Start shopping</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {orders.map((o) => (
        <Link
          key={o.id}
          href={`/orders/${o.orderNo}`}
          className="flex items-center justify-between rounded-xl border-2 border-border bg-card p-4 transition-colors hover:border-primary"
        >
          <div>
            <p className="font-bold">{o.orderNo}</p>
            <p className="text-sm text-muted-foreground">
              {o.placedAt.toLocaleDateString("en-PH")} ·{" "}
              {formatPHP(o.totalCents)}
            </p>
          </div>
          <OrderStatusBadge status={o.status} />
        </Link>
      ))}
    </div>
  );
}
