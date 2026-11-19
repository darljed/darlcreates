"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createSaleAction, updateSaleAction } from "@/app/(admin)/admin/sales/actions";
import { formatPHP } from "@/lib/money";
import { PAYMENT_MODES, PAYMENT_STATUSES, SALE_STATUSES, type PartWithCost, type PaymentStatus, type ProductCosting, type SaleRow, type SaleStatus } from "@/lib/workshop/types";
import { Field, NativeSelect, parseNum } from "./form-bits";

/**
 * Add or edit a manual sale. The product comes from the catalogue (picking one fills the price), extra parts are one-off
 * inventory parts beyond the product's bill of materials. Shows the sale's total, cost and profit as you type.
 * Render it only while open: `sale` (null = new) is read once for the starting values.
 */
type ExtraRow = { key: number; partId: string; qty: string };
/** Today as the Philippine calendar date (the shop's day), not the UTC date, which is a day behind until 8 am. */
const today = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Manila" });

export function SaleDialog({ sale, products, parts, onClose }: { sale: SaleRow | null; products: ProductCosting[]; parts: PartWithCost[]; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [productId, setProductId] = useState(sale?.productId ?? "");
  const [quantity, setQuantity] = useState(String(sale?.quantity ?? 1));
  const [price, setPrice] = useState(sale ? String(sale.pricePerItemCents / 100) : "");
  const [date, setDate] = useState(sale ? sale.saleDate.slice(0, 10) : today());
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(sale?.paymentStatus ?? "Unpaid");
  const [mode, setMode] = useState(sale?.modeOfPayment ?? "");
  const [status, setStatus] = useState<SaleStatus>(sale?.status ?? "For Processing");
  const [delivery, setDelivery] = useState(sale?.deliveryDetails ?? "");
  const [contact, setContact] = useState(sale?.contact ?? "");
  const [details, setDetails] = useState(sale?.details ?? "");
  const [extras, setExtras] = useState<ExtraRow[]>(() => (sale?.extraParts ?? []).map((e, i) => ({ key: i, partId: e.partId, qty: String(e.qty) })));
  const [nextKey, setNextKey] = useState(extras.length);
  const [busy, setBusy] = useState(false);

  const product = products.find((p) => p.id === productId);
  const qtyN = parseNum(quantity) ?? 0;
  const priceN = parseNum(price) ?? 0;
  const partById = (id: string) => parts.find((p) => p.id === id);
  // A saved sale keeps the cost it was made at; new rows use the part's current average cost.
  const extraUnitCost = (partId: string) => sale?.extraParts.find((e) => e.partId === partId)?.unitCostCents ?? partById(partId)?.unitCostCents ?? 0;
  const unitCost = sale && sale.productId === productId ? sale.unitCostCents : product?.unitCostCents ?? 0;
  const cost = Math.round(unitCost * qtyN + extras.reduce((t, e) => t + extraUnitCost(e.partId) * (parseNum(e.qty) ?? 0), 0));
  const total = Math.round(priceN * 100) * qtyN;
  const marginPct = priceN > 0 ? Math.round(((priceN * 100 - unitCost) / (priceN * 100)) * 100) : null;

  function pick(id: string) {
    setProductId(id);
    const p = products.find((x) => x.id === id);
    if (p) setPrice(String(p.basePriceCents / 100));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!productId) return toast.error("Please select a product");
    const q = parseNum(quantity);
    if (q === null || !Number.isInteger(q) || q < 1) return toast.error("Quantity must be a whole number, 1 or more");
    const pr = parseNum(price);
    if (pr === null || pr < 0) return toast.error("Price must be 0 or more");
    const extraParts: { partId: string; qty: number }[] = [];
    for (const r of extras) {
      const n = parseNum(r.qty);
      if (!r.partId) return toast.error("Choose a part for each extra part row (or remove the row)");
      if (n === null || n <= 0) return toast.error("Extra part quantities must be more than 0");
      extraParts.push({ partId: r.partId, qty: n });
    }
    const payload = {
      // keep the saved timestamp when the date was not changed
      saleDate: sale && date === sale.saleDate.slice(0, 10) ? sale.saleDate : date,
      productId, quantity: q, pricePerItemPesos: pr, extraParts, paymentStatus,
      modeOfPayment: mode || undefined, status, deliveryDetails: delivery || undefined, contact: contact || undefined, details: details || undefined,
    };
    setBusy(true);
    const res = sale ? await updateSaleAction(sale.id, payload) : await createSaleAction(payload);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(sale ? "Sale updated" : "Sale added");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{sale ? "Edit sale" : "Add sale"}</DialogTitle>
          <DialogDescription>A sale taken outside the website.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Product" htmlFor={`${uid}-product`}>
            <NativeSelect id={`${uid}-product`} value={productId} onChange={(e) => pick(e.target.value)} required>
              <option value="">Select a product...</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </NativeSelect>
          </Field>
          {product && (
            <p className="text-xs text-muted-foreground">
              Unit cost {formatPHP(unitCost)} · list price {formatPHP(product.basePriceCents)}{marginPct !== null && <> · margin at this price {marginPct}%</>}
            </p>
          )}
          {product && product.bom.length === 0 && (
            <p role="status" className="border border-amber-500/50 bg-amber-500/10 px-2 py-1.5 text-xs">This product has no bill of materials, so no parts are used from inventory when it is packaged or delivered.</p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Field label="Quantity" htmlFor={`${uid}-qty`}>
              <Input id={`${uid}-qty`} type="number" inputMode="numeric" min={1} step={1} value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
            </Field>
            <Field label="Price per item (₱)" htmlFor={`${uid}-price`}>
              <Input id={`${uid}-price`} type="number" inputMode="decimal" min={0} step="any" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </Field>
            <Field label="Date" htmlFor={`${uid}-date`}>
              <Input id={`${uid}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Payment status" htmlFor={`${uid}-pay`}>
              <NativeSelect id={`${uid}-pay`} value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value as PaymentStatus)}>
                {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Mode of payment" htmlFor={`${uid}-mode`}>
              <NativeSelect id={`${uid}-mode`} value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="">Not set</option>
                {PAYMENT_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                {mode && !(PAYMENT_MODES as readonly string[]).includes(mode) && <option value={mode}>{mode}</option>}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Status" htmlFor={`${uid}-status`} hint="Packaged and Delivered use up the product's parts from inventory. Moving the sale back, cancelling it or deleting it gives them back.">
            <NativeSelect id={`${uid}-status`} value={status} onChange={(e) => setStatus(e.target.value as SaleStatus)}>
              {SALE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </NativeSelect>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Delivery details" htmlFor={`${uid}-delivery`}>
              <Input id={`${uid}-delivery`} value={delivery} onChange={(e) => setDelivery(e.target.value)} maxLength={500} />
            </Field>
            <Field label="Contact" htmlFor={`${uid}-contact`}>
              <Input id={`${uid}-contact`} value={contact} onChange={(e) => setContact(e.target.value)} maxLength={160} />
            </Field>
          </div>
          <Field label="Details / notes" htmlFor={`${uid}-details`}>
            <Textarea id={`${uid}-details`} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} rows={2} />
          </Field>

          <fieldset className="grid gap-2 border p-2">
            <legend className="px-1 text-xs font-medium">Extra parts (beyond the product&apos;s parts list)</legend>
            {extras.map((r, i) => {
              const unit = partById(r.partId)?.unit;
              return (
                <div key={r.key} className="flex items-center gap-2">
                  <NativeSelect aria-label={`Extra part ${i + 1}`} value={r.partId} onChange={(e) => setExtras((all) => all.map((x) => (x.key === r.key ? { ...x, partId: e.target.value } : x)))}>
                    <option value="">Select a part...</option>
                    {parts.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </NativeSelect>
                  <Input aria-label={`Extra part ${i + 1} quantity${unit ? ` (${unit})` : ""}`} placeholder={unit ?? "qty"} className="w-24 shrink-0" type="number" inputMode="decimal" min={0} step="any" value={r.qty} onChange={(e) => setExtras((all) => all.map((x) => (x.key === r.key ? { ...x, qty: e.target.value } : x)))} />
                  <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove extra part ${i + 1}`} onClick={() => setExtras((all) => all.filter((x) => x.key !== r.key))}><X /></Button>
                </div>
              );
            })}
            <Button type="button" size="xs" variant="outline" className="w-fit" onClick={() => { setExtras((all) => [...all, { key: nextKey, partId: "", qty: "1" }]); setNextKey((k) => k + 1); }}><Plus /> Add extra part</Button>
          </fieldset>

          <dl className="grid grid-cols-3 gap-2 border bg-muted/40 p-2 text-center text-xs">
            <div><dt className="text-muted-foreground">Total</dt><dd className="font-semibold tabular-nums">{formatPHP(total)}</dd></div>
            <div><dt className="text-muted-foreground">Cost</dt><dd className="font-semibold tabular-nums">{formatPHP(cost)}</dd></div>
            <div><dt className="text-muted-foreground">Profit</dt><dd className={total - cost < 0 ? "font-semibold tabular-nums text-destructive" : "font-semibold tabular-nums"}>{formatPHP(total - cost)}</dd></div>
          </dl>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving..." : sale ? "Save" : "Add sale"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
