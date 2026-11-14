import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { orders, users } from "@/db/schema";
import { Acknowledgment } from "@/components/acknowledgment";
import { PrintButton } from "@/components/print-button";
import { getOrderByIdAdmin } from "@/lib/orders";

export const metadata = { title: "Order Acknowledgment · Admin" };
export const instant = false;

export default async function AdminAcknowledgmentPage({ params }: PageProps<"/admin/orders/[id]/acknowledgment">) {
  const { id } = await params;
  const order = await getOrderByIdAdmin(id);
  if (!order) notFound();
  const [row] = await db
    .select({ name: users.name, email: users.email })
    .from(orders)
    .innerJoin(users, eq(orders.userId, users.id))
    .where(eq(orders.id, id));
  return (
    <div className="space-y-4">
      <div className="mx-auto flex max-w-2xl items-center justify-between print:hidden">
        <Link href={`/admin/orders/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← Back to order</Link>
        <PrintButton />
      </div>
      <Acknowledgment order={order} buyerName={row?.name ?? "—"} buyerEmail={row?.email ?? "—"} />
    </div>
  );
}
