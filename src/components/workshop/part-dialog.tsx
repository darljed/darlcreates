"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPartAction, updatePartAction } from "@/app/(admin)/admin/inventory/actions";
import { PART_UNITS } from "@/lib/workshop/presets";
import type { PartWithCost } from "@/lib/workshop/types";
import { Field, NativeSelect, parseNum } from "./form-bits";

/**
 * Add or edit an inventory part. Adding can also record the first stock (quantity + total cost) in one step.
 * Render it only while open: it reads `part` once for its starting values.
 */
export function PartDialog({ part, onClose }: { part: PartWithCost | null; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [name, setName] = useState(part?.name ?? "");
  const [category, setCategory] = useState(part?.category ?? "");
  const [unit, setUnit] = useState(part?.unit ?? "piece");
  const [reorder, setReorder] = useState(part ? String(part.reorderLevel) : "0");
  const [notes, setNotes] = useState(part?.notes ?? "");
  const [initQty, setInitQty] = useState("");
  const [initCost, setInitCost] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return toast.error("Part name is required");
    const reorderLevel = parseNum(reorder) ?? 0;
    if (reorderLevel < 0) return toast.error("Reorder level cannot be negative");
    const base = { name, category: category || undefined, unit, reorderLevel, notes: notes || undefined };
    const qty = parseNum(initQty);
    if (!part && initQty.trim() !== "" && (qty === null || qty < 0)) return toast.error("Starting quantity must be 0 or more");
    setBusy(true);
    const res = part
      ? await updatePartAction(part.id, base)
      : await createPartAction({ ...base, initialQty: qty ?? undefined, initialTotalCostPesos: parseNum(initCost) ?? 0 });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success(part ? "Part updated" : "Part added");
    router.refresh();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{part ? "Edit part" : "Add part"}</DialogTitle>
          <DialogDescription>{part ? "Stock and cost change through restocks and adjustments." : "Optionally enter the first stock you bought; it sets the starting average cost."}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-3">
          <Field label="Name" htmlFor={`${uid}-name`}>
            <Input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" htmlFor={`${uid}-cat`}>
              <Input id={`${uid}-cat`} value={category} onChange={(e) => setCategory(e.target.value)} maxLength={60} placeholder="e.g. Filament" />
            </Field>
            <Field label="Unit" htmlFor={`${uid}-unit`}>
              <NativeSelect id={`${uid}-unit`} value={unit} onChange={(e) => setUnit(e.target.value)}>
                {PART_UNITS.map((u) => <option key={u} value={u}>{u}</option>)}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Reorder level" htmlFor={`${uid}-reorder`} hint="Shows a low-stock badge at or below this amount.">
            <Input id={`${uid}-reorder`} type="number" inputMode="decimal" min={0} step="any" value={reorder} onChange={(e) => setReorder(e.target.value)} />
          </Field>
          {!part && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Starting quantity (optional)" htmlFor={`${uid}-iq`}>
                <Input id={`${uid}-iq`} type="number" inputMode="decimal" min={0} step="any" value={initQty} onChange={(e) => setInitQty(e.target.value)} />
              </Field>
              <Field label="Total cost paid (₱)" htmlFor={`${uid}-ic`}>
                <Input id={`${uid}-ic`} type="number" inputMode="decimal" min={0} step="any" value={initCost} onChange={(e) => setInitCost(e.target.value)} />
              </Field>
            </div>
          )}
          <Field label="Notes" htmlFor={`${uid}-notes`}>
            <Textarea id={`${uid}-notes`} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2} />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button type="submit" disabled={busy}>{busy ? "Saving..." : part ? "Save" : "Add part"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
