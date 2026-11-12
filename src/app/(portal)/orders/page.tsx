import { NOINDEX } from "@/lib/seo";
import { Suspense } from "react";
import { TableSkeleton } from "@/components/skeletons";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listUserOrders } from "@/lib/orders";
import { formatPHP } from "@/lib/money";
import { OrderStatusBadge } from "@/components/order-status-badge";
import { ReorderButton } from "@/components/order-actions";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, PageHeader, Td, Th, Tr } from "@/components/shell/ui";

export const metadata = { title: "My Orders", ...NOINDEX };
export const instant = false;

export default function OrdersPage() {
  return (
    <div>
      <PageHeader title="My orders" description="Track an order, pay for it, or order the same thing again." />
      <Suspense fallback={<TableSkeleton headers={["Order", "Items", "Total", "Status", "Actions"]} right={[4]} rows={5} />}>
        <OrdersList />
      </Suspense>
    </div>
  );
}

async function OrdersList() {
  const user = await requireUser("/orders");
  const orders = await listUserOrders(user.id);

  if (orders.length === 0) {
    return (
      <EmptyState
        action={
          <Button asChild className="bg-primary text-primary-foreground">
            <Link href="/products">Start shopping</Link>
          </Button>
        }
      >
        You haven&apos;t placed an order yet.
      </EmptyState>
    );
  }

  return (
    <DataTable>
      <thead>
        <tr>
          <Th>Order</Th>
          <Th>Items</Th>
          <Th>Total</Th>
          <Th>Status</Th>
          <Th className="text-right">Actions</Th>
        </tr>
      </thead>
      <tbody>
        {orders.map((o) => {
          const needsPayment = o.status === "awaiting_payment" && !o.paymentPending;
          return (
            <Tr key={o.id}>
              <Td className="whitespace-nowrap">
                <Link href={`/orders/${o.orderNo}`} className="font-semibold hover:text-primary">
                  {o.orderNo}
                </Link>
                <span className="block text-xs text-muted-foreground">{o.placedAt.toLocaleDateString("en-PH")}</span>
              </Td>
              <Td label="Items" className="max-w-xs truncate text-muted-foreground" title={o.itemsLabel}>
                {o.itemsLabel}
              </Td>
              <Td label="Total" className="whitespace-nowrap">{formatPHP(o.totalCents)}</Td>
              <Td label="Status">
                <OrderStatusBadge status={o.status} size="sm" />
                {o.status === "awaiting_payment" && o.paymentPending && (
                  <span className="mt-1 block text-xs text-muted-foreground">We&apos;re verifying your payment</span>
                )}
              </Td>
              <Td className="text-right">
                <div className="flex flex-wrap justify-end gap-2 lg:flex-nowrap">
                  {needsPayment && (
                    <Button asChild size="sm" className="bg-primary text-primary-foreground">
                      <Link href={`/orders/${o.orderNo}#pay`}>Pay now</Link>
                    </Button>
                  )}
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/orders/${o.orderNo}`}>Track</Link>
                  </Button>
                  <ReorderButton orderNo={o.orderNo} />
                </div>
              </Td>
            </Tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
