import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { CopyTextButton } from "@/components/copy-text-button";
import { JobSheetView } from "@/components/job-sheet-view";
import { getOrderByIdAdmin } from "@/lib/orders";
import { sheetText } from "@/lib/job-sheet";

export const metadata = { title: "Print job sheet · Admin" };
export const instant = false;

/** What to print and in which colours for every line of an order, to check a downloaded 3MF against. */
export default async function AdminJobSheetPage({ params }: PageProps<"/admin/orders/[id]/job-sheet">) {
  const { id } = await params;
  const order = await getOrderByIdAdmin(id);
  if (!order) notFound();
  const placed = order.placedAt.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" });
  const all = order.items.map((it) => (it.sheet ? sheetText(it.name, it.qty, it.sheet) : `${it.qty}× ${it.name}`)).join("\n\n");
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/admin/orders/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← Back to order</Link>
        <div className="flex gap-2"><CopyTextButton text={`Order ${order.orderNo}\n\n${all}`} /><PrintButton /></div>
      </div>
      <article className="space-y-4 bg-white p-4 text-black print:p-0">
        <header className="border-b-2 border-black pb-2">
          <h1 className="text-lg font-extrabold">Print job sheet · {order.orderNo}</h1>
          <p className="text-xs">Placed {placed} · status {order.status.replace(/_/g, " ")} · {order.items.reduce((n, i) => n + i.qty, 0)} piece(s)</p>
        </header>
        {order.items.map((it, i) => (
          <section key={it.id} className="break-inside-avoid border-b pb-3">
            <h2 className="font-bold">{i + 1}. {it.qty}× {it.name}</h2>
            {it.sheet ? <JobSheetView sheet={it.sheet} /> : <p className="text-sm text-muted-foreground">This product is no longer in the catalog, so no details were kept for this older order.</p>}
          </section>
        ))}
      </article>
    </div>
  );
}
