"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { adjustStockAction } from "@/app/(admin)/admin/inventory/actions";
import type { PartWithCost } from "@/lib/workshop/types";
import { Field, fmtQty, parseNum } from "./form-bits";

/** Manual stock correction: set the stock to a real count, or add/remove an amount, with a reason. Render only while open. */
export function AdjustDialog({ part, onClose }: { part: PartWithCost; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [mode, setMode] = useState<"set" | "change">("set");
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = parseNum(value);
    if (n === null) return toast.error(mode === "set" ? "Enter the real count" : "Enter a + or - change");
    setBusy(true);
    const res = await adjustStockAction({ partId: part.id, ...(mode === "set" ? { setTo: n } : { delta: n }), reason: reason || "manual adjustment" });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Stock adjusted");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock: {part.name}</DialogTitle>
          <DialogDescription>On hand now: {fmtQty(part.qtyOnHand)} {part.unit}.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <div role="group" aria-label="Adjustment type" className="grid grid-cols-2 gap-2">
            <Button type="button" size="sm" variant={mode === "set" ? "default" : "outline"} aria-pressed={mode === "set"} onClick={() => setMode("set")}>Set to real count</Button>
            <Button type="button" size="sm" variant={mode === "change" ? "default" : "outline"} aria-pressed={mode === "change"} onClick={() => setMode("change")}>Add / remove</Button>
          </div>
          <Field label={mode === "set" ? `New count (${part.unit})` : `Change (${part.unit}), e.g. -5 or 10`} htmlFor={`${uid}-v`}>
            <Input id={`${uid}-v`} type="number" inputMode="decimal" step="any" value={value} onChange={(e) => setValue(e.target.value)} required />
          </Field>
          <Field label="Reason" htmlFor={`${uid}-r`}>
            <Input id={`${uid}-r`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={200} placeholder="e.g. stock count, spoiled, lost" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving..." : "Apply"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
