import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { Waybill } from "@/components/waybill";
import { getOrderByIdAdmin } from "@/lib/orders";
import { getSiteInfo } from "@/lib/site-content";

export const metadata = { title: "Waybill · Admin" };
export const instant = false;

export default async function AdminWaybillPage({ params }: PageProps<"/admin/orders/[id]/waybill">) {
  const { id } = await params;
  const order = await getOrderByIdAdmin(id);
  if (!order) notFound();
  const { store } = await getSiteInfo();
  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-md items-center justify-between print:hidden">
        <Link href={`/admin/orders/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← Back to order</Link>
        <PrintButton />
      </div>
      <Waybill order={order} store={{ name: store.name, address: store.address, phone: store.phone }} />
    </div>
  );
}
