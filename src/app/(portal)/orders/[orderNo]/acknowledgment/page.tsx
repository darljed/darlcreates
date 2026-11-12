import { Suspense } from "react";
import { AcknowledgmentSkeleton } from "@/components/skeletons";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Acknowledgment } from "@/components/acknowledgment";
import { PrintButton } from "@/components/print-button";
import { getOrderForUser } from "@/lib/orders";
import { requireUser } from "@/lib/session";

export const metadata = { title: "Order Acknowledgment" };
// Per-user, uncacheable page that reads params outside a Suspense boundary.
export const instant = false;

export default async function AcknowledgmentPage({ params }: PageProps<"/orders/[orderNo]/acknowledgment">) {
  const { orderNo } = await params;
  return (
    <Suspense fallback={<AcknowledgmentSkeleton />}>
      <Doc orderNo={orderNo} />
    </Suspense>
  );
}

async function Doc({ orderNo }: { orderNo: string }) {
  const user = await requireUser(`/orders/${orderNo}/acknowledgment`);
  const order = await getOrderForUser(orderNo, user.id); // scoped to the owner
  if (!order) notFound();
  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-2xl items-center justify-between print:hidden">
        <Link href={`/orders/${orderNo}`} className="text-sm text-muted-foreground hover:text-foreground">← Back to order</Link>
        <PrintButton />
      </div>
      <Acknowledgment order={order} buyerName={user.name} buyerEmail={user.email} />
    </div>
  );
}
