"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { recordPurchaseAction } from "@/app/(admin)/admin/inventory/actions";
import type { PartWithCost } from "@/lib/workshop/types";
import { Field, parseNum } from "./form-bits";

/** Record a purchase (restock) of one part: quantity, total cost in pesos, supplier and date. Render only while open. */
export function RestockDialog({ part, onClose }: { part: PartWithCost; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [date, setDate] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const q = parseNum(qty), c = parseNum(cost);
    if (q === null || q <= 0) return toast.error("Quantity must be more than 0");
    if (c === null || c < 0) return toast.error("Total cost must be 0 or more");
    setBusy(true);
    const res = await recordPurchaseAction({ partId: part.id, qty: q, totalCostPesos: c, supplier: supplier || undefined, purchasedAt: date || undefined });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Stock added");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Restock {part.name}</DialogTitle>
          <DialogDescription>The average cost is recalculated from all purchases.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Quantity (${part.unit})`} htmlFor={`${uid}-q`}>
              <Input id={`${uid}-q`} type="number" inputMode="decimal" min={0} step="any" value={qty} onChange={(e) => setQty(e.target.value)} required />
            </Field>
            <Field label="Total cost (₱)" htmlFor={`${uid}-c`}>
              <Input id={`${uid}-c`} type="number" inputMode="decimal" min={0} step="any" value={cost} onChange={(e) => setCost(e.target.value)} required />
            </Field>
          </div>
          <Field label="Supplier" htmlFor={`${uid}-s`}>
            <Input id={`${uid}-s`} value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={120} />
          </Field>
          <Field label="Date bought (blank = today)" htmlFor={`${uid}-d`}>
            <Input id={`${uid}-d`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Add stock"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
