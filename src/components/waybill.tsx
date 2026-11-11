/**
 * Internal waybill: a small printable slip (A6) for our own tracking, not a courier label. Shows the order barcode
 * (so a scanner can look the order up), who it ships to, what to pack, and boxes to tick as the parcel moves.
 * Prices and the customer's email are left off on purpose: it travels around the workshop.
 */
import { code128Bars } from "@/lib/code128";
import type { OrderDetail } from "@/lib/orders";

export function Barcode({ text, height = 56 }: { text: string; height?: number }) {
  const { bars, width } = code128Bars(text);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-14 w-full" preserveAspectRatio="none" role="img" aria-label={`Barcode ${text}`} shapeRendering="crispEdges">
      <rect width={width} height={height} fill="white" />
      {bars.map((b) => (
        <rect key={b.x} x={b.x} y={0} width={b.w} height={height} fill="black" />
      ))}
    </svg>
  );
}

const STEPS = ["Printed", "Cleaned", "Packed", "Handed to courier"];

export function Waybill({
  order,
  store,
}: {
  order: OrderDetail;
  store: { name: string; address: string; phone: string };
}) {
  const a = order.shipAddress as Record<string, string>;
  const redacted = a?.redacted === "true" || (a as unknown as { redacted?: boolean })?.redacted === true;
  const paid = order.latestPayment?.status === "verified";
  const pieces = order.items.reduce((n, i) => n + i.qty, 0);
  const placed = order.placedAt.toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric", timeZone: "Asia/Manila" });
  return (
    <article className="waybill mx-auto w-[105mm] border-2 border-black bg-white p-3 text-[11px] leading-snug text-black print:border-0">
      <style>{`@media print { @page { size: A6; margin: 5mm } }`}</style>
      <header className="flex items-start justify-between gap-2 border-b-2 border-black pb-1.5">
        <div>
          <h1 className="text-sm font-extrabold uppercase tracking-wide">Internal waybill</h1>
          <p className="text-[10px]">From: {store.name}{store.address ? `, ${store.address}` : ""}{store.phone ? ` · ${store.phone}` : ""}</p>
        </div>
        <p className="shrink-0 text-right text-[10px]">Ordered<br />{placed}</p>
      </header>

      <section className="py-1.5">
        <Barcode text={order.orderNo} />
        <p className="text-center font-mono text-sm font-bold tracking-wider">{order.orderNo}</p>
      </section>

      <section className="border-y-2 border-black py-1.5">
        <p className="text-[10px] font-bold uppercase">Ship to</p>
        {redacted ? (
          <p>(address removed at the customer&apos;s request)</p>
        ) : (
          <>
            <p className="text-sm font-extrabold">{a.recipient}</p>
            <p className="font-bold">{a.phone}</p>
            <p>{[a.line1, a.line2, a.barangay, a.city, a.province, a.postalCode].filter(Boolean).join(", ")}</p>
          </>
        )}
      </section>

      <section className="py-1.5">
        <p className="text-[10px] font-bold uppercase">Pack ({pieces} piece{pieces === 1 ? "" : "s"})</p>
        <ul className="space-y-0.5">
          {order.items.map((it) => (
            <li key={it.id}>
              <span className="font-bold">{it.qty}× {it.name}</span>
              {it.summary.length > 0 && <span> · {it.summary.map((s) => `${s.label}: ${s.value}`).join(", ")}</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="flex items-center justify-between gap-2 border-t border-black py-1.5">
        <p>
          <span className="font-bold">Payment:</span> {paid ? "Paid and verified" : "NOT VERIFIED: do not ship"}
        </p>
        <p><span className="font-bold">Status:</span> {order.status.replaceAll("_", " ")}</p>
      </section>

      <section className="border-t-2 border-black pt-1.5">
        <p className="text-[10px] font-bold uppercase">Tracking</p>
        <p>Courier: {order.shipment?.carrier || "______________"}</p>
        <p>Tracking no.: {order.shipment?.trackingNo || "______________________"}</p>
        <ul className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5">
          {STEPS.map((s) => (
            <li key={s} className="flex items-center gap-1.5">
              <span className="inline-block size-3 border-2 border-black" aria-hidden /> {s}
            </li>
          ))}
        </ul>
        <p className="mt-1.5">Packed by: ____________ Date: ________</p>
      </section>
    </article>
  );
}
