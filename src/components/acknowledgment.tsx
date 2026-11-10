import { BUSINESS } from "@/lib/business";
import { formatPHP } from "@/lib/money";
import type { OrderDetail } from "@/lib/orders";

/**
 * Order Acknowledgment: a plain sales record for the customer. The business is not BIR-registered,
 * so this is deliberately NOT an Official Receipt or tax invoice and says so. VAT is shown as 0.
 */
export function Acknowledgment({ order, buyerName, buyerEmail }: { order: OrderDetail; buyerName: string; buyerEmail: string }) {
  const a = order.shipAddress as Record<string, string>;
  const redacted = a?.redacted === "true" || (a as unknown as { redacted?: boolean })?.redacted === true;
  const paid = order.latestPayment?.status === "verified";
  const money = (n: number) => formatPHP(n);
  return (
    <article className="mx-auto max-w-2xl rounded-xl border-2 border-border bg-white p-8 text-black print:max-w-none print:border-0 print:p-0">
      <header className="flex items-start justify-between gap-4 border-b-2 border-black pb-4">
        <div>
          <p className="text-2xl font-extrabold">{BUSINESS.name}</p>
          <p className="text-sm">{BUSINESS.tagline} · {BUSINESS.location}</p>
          <p className="text-sm">{BUSINESS.contactEmail}</p>
        </div>
        <div className="text-right">
          <h1 className="text-lg font-extrabold uppercase tracking-wide">Order Acknowledgment</h1>
          <p className="text-sm">No. {order.orderNo}</p>
          <p className="text-sm">Date: {order.placedAt.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })}</p>
        </div>
      </header>

      <section className="grid gap-4 py-4 text-sm sm:grid-cols-2">
        <div>
          <p className="font-bold">Customer</p>
          <p>{buyerName}</p>
          <p>{buyerEmail}</p>
        </div>
        <div>
          <p className="font-bold">Deliver to</p>
          {redacted ? <p>(address removed at the customer&apos;s request)</p> : (
            <>
              <p>{a.recipient} · {a.phone}</p>
              <p>{[a.line1, a.line2, a.barangay, a.city, a.province, a.postalCode].filter(Boolean).join(", ")}</p>
            </>
          )}
        </div>
      </section>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-y-2 border-black text-left">
            <th className="py-2">Item</th><th className="py-2 text-right">Qty</th><th className="py-2 text-right">Unit price</th><th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {order.items.map((it) => (
            <tr key={it.id} className="border-b align-top">
              <td className="py-2">
                <p className="font-semibold">{it.name}</p>
                {it.summary.map((s) => <p key={s.label} className="text-xs">{s.label}: {s.value}</p>)}
              </td>
              <td className="py-2 text-right">{it.qty}</td>
              <td className="py-2 text-right">{money(it.unitPriceCents)}</td>
              <td className="py-2 text-right">{money(it.unitPriceCents * it.qty)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="text-sm">
          <tr><td colSpan={3} className="pt-3 text-right">Subtotal</td><td className="pt-3 text-right">{money(order.subtotalCents)}</td></tr>
          <tr><td colSpan={3} className="text-right">Shipping</td><td className="text-right">{money(order.shippingCents)}</td></tr>
          <tr><td colSpan={3} className="text-right">VAT</td><td className="text-right">{money(0)}</td></tr>
          <tr className="font-extrabold"><td colSpan={3} className="border-t-2 border-black pt-2 text-right">Total</td><td className="border-t-2 border-black pt-2 text-right">{money(order.totalCents)}</td></tr>
        </tfoot>
      </table>

      <section className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="font-bold">Payment</p>
          <p>Method: GCash (manual verification)</p>
          <p>Status: <strong>{paid ? "Paid and verified" : order.status === "awaiting_payment" ? "Awaiting payment" : order.status.replaceAll("_", " ")}</strong></p>
          {order.latestPayment && <p>Reference: {order.latestPayment.reference}</p>}
          {paid && order.latestPayment?.verifiedAt && <p>Verified: {order.latestPayment.verifiedAt.toLocaleDateString("en-PH")}</p>}
        </div>
        <div>
          <p className="font-bold">Order status</p>
          <p className="capitalize">{order.status.replaceAll("_", " ")}</p>
        </div>
      </section>

      <footer className="mt-6 border-t pt-3 text-xs">
        <p>
          This Order Acknowledgment confirms that we received your order and is a sales record only. It is not an
          official receipt or a tax invoice, and no VAT has been charged. Items are made to order.
        </p>
        <p className="mt-1">Questions? {BUSINESS.contactEmail}</p>
      </footer>
    </article>
  );
}
