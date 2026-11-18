"use client";

import { useId } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MATERIAL_PRESETS } from "@/lib/workshop/presets";
import type { JobFormState } from "@/lib/workshop/types";
import { cn } from "@/lib/utils";
import { emptyMaterialRow, selectClass, type FilamentOption, type MaterialRow } from "./estimator-helpers";

/**
 * The job inputs of the estimator: one filament row per colour or material (a tracked inventory filament, priced by its
 * weighted-average cost, or a preset or custom price), the waste allowance, print time, labour, quantity and what the
 * quantity means (separate prints or one batch).
 */

const PART = "part:";
const PRESET = "preset:";

const seg = (on: boolean) => cn("flex-1 px-2 py-1.5 text-xs transition-colors", on ? "bg-primary text-primary-foreground" : "hover:bg-muted");

export function JobForm({ job, onChange, filaments }: { job: JobFormState; onChange: (next: JobFormState) => void; filaments: FilamentOption[] }) {
  const uid = useId();
  const set = (patch: Partial<JobFormState>) => onChange({ ...job, ...patch });
  const setRow = (i: number, patch: Partial<MaterialRow>) => set({ materials: job.materials.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) });
  const addRow = () => set({ materials: [...job.materials, emptyMaterialRow()] });
  // Always keep one row so the form is never empty.
  const removeRow = (i: number) => set({ materials: job.materials.length > 1 ? job.materials.filter((_, idx) => idx !== i) : [emptyMaterialRow()] });

  const rowValue = (r: MaterialRow) => (r.partId != null ? `${PART}${r.partId}` : `${PRESET}${r.name}`);

  const onPick = (i: number, value: string) => {
    if (value.startsWith(PART)) {
      const part = filaments.find((p) => p.id === value.slice(PART.length));
      if (part) setRow(i, { partId: part.id, name: part.name, pricePerKg: part.pricePerKg.toFixed(2) });
      return;
    }
    const name = value.slice(PRESET.length);
    const preset = MATERIAL_PRESETS.find((p) => p.name === name);
    // "Custom" keeps whatever price was typed; the other presets bring their own.
    setRow(i, { partId: null, name, pricePerKg: preset && preset.name !== "Custom" ? String(preset.pricePerKg) : job.materials[i].pricePerKg });
  };

  const baseGrams = job.materials.reduce((s, r) => s + (Number(r.grams) || 0), 0);
  const waste = Math.max(0, Number(job.wastePct) || 0);
  const consumed = baseGrams * (1 + waste / 100);
  const batch = job.quantityMode === "batch";
  const qty = Math.max(1, Math.floor(Number(job.quantity) || 1));

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium">
            Filament used <span className="font-normal text-muted-foreground">({batch ? "whole plate" : "per piece"})</span>
          </p>
          <Button type="button" size="sm" variant="outline" onClick={addRow}>
            <Plus /> Add colour / material
          </Button>
        </div>

        <div className="space-y-2">
          {job.materials.map((r, i) => {
            const tracked = r.partId != null;
            // A tracked row whose part is not in the list any more still has to show its own name.
            const orphan = tracked && !filaments.some((p) => p.id === r.partId);
            return (
              <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2 sm:grid-cols-[1fr_5.5rem_6rem_auto]">
                <select
                  aria-label={`Material ${i + 1}`}
                  className={cn(selectClass, "col-span-3 sm:col-span-1")}
                  value={rowValue(r)}
                  onChange={(e) => onPick(i, e.target.value)}
                >
                  {(filaments.length > 0 || orphan) && (
                    <optgroup label="From inventory (tracked)">
                      {orphan && <option value={rowValue(r)}>{r.name}</option>}
                      {filaments.map((p) => (
                        <option key={p.id} value={`${PART}${p.id}`}>
                          {p.name} · {peso0kg(p.pricePerKg)}/kg
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Presets (price only, not tracked)">
                    {MATERIAL_PRESETS.map((p) => (
                      <option key={p.name} value={`${PRESET}${p.name}`}>
                        {p.name}
                      </option>
                    ))}
                  </optgroup>
                </select>
                <Input
                  aria-label={`Material ${i + 1} grams`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={r.grams}
                  onChange={(e) => setRow(i, { grams: e.target.value })}
                  placeholder="grams"
                />
                <Input
                  aria-label={`Material ${i + 1} price per kg`}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={r.pricePerKg}
                  onChange={(e) => setRow(i, { pricePerKg: e.target.value })}
                  placeholder="₱/kg"
                  disabled={tracked}
                  title={tracked ? "Locked to the filament's weighted-average cost. Pick a preset to type a price." : "₱ per kg"}
                />
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove material ${i + 1}`} onClick={() => removeRow(i)}>
                  <X />
                </Button>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">Grams and ₱/kg per row. Tracked filament is deducted from stock when a sale is packaged; presets only set a price.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-waste`}>Waste allowance (%)</Label>
          <Input id={`${uid}-waste`} type="number" inputMode="decimal" min={0} step="0.5" value={job.wastePct} onChange={(e) => set({ wastePct: e.target.value })} placeholder="0" />
          <span className="text-xs text-muted-foreground">Purge, tower, supports.</span>
        </div>
        <div className="grid content-end gap-0.5 text-xs text-muted-foreground">
          <span>
            Total filament: <strong className="tabular-nums text-foreground">{consumed.toFixed(1)} g</strong>
          </span>
          {waste > 0 && (
            <span className="tabular-nums">
              {baseGrams.toFixed(1)} g + {waste}% waste
            </span>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <Label htmlFor={`${uid}-h`}>Print time{batch ? " (whole plate)" : ""}</Label>
        <div className="flex items-center gap-2">
          <Input id={`${uid}-h`} aria-label="Print hours" type="number" inputMode="numeric" min={0} value={job.printH} onChange={(e) => set({ printH: e.target.value })} placeholder="3" />
          <span className="text-sm text-muted-foreground">h</span>
          <Input aria-label="Print minutes" type="number" inputMode="numeric" min={0} max={59} value={job.printM} onChange={(e) => set({ printM: e.target.value })} placeholder="37" />
          <span className="text-sm text-muted-foreground">m</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-labor`}>Labour (minutes{batch ? " / piece" : ""})</Label>
          <Input id={`${uid}-labor`} type="number" inputMode="decimal" min={0} value={job.laborMinutes} onChange={(e) => set({ laborMinutes: e.target.value })} placeholder="20" />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor={`${uid}-qty`}>Quantity</Label>
          <Input id={`${uid}-qty`} type="number" inputMode="numeric" min={1} value={job.quantity} onChange={(e) => set({ quantity: e.target.value })} placeholder="1" />
        </div>
      </div>

      <div className="grid gap-1.5">
        <span className="text-xs text-muted-foreground" id={`${uid}-mode`}>
          Quantity means…
        </span>
        <div role="group" aria-labelledby={`${uid}-mode`} className="flex overflow-hidden rounded-md border">
          <button type="button" className={seg(!batch)} aria-pressed={!batch} onClick={() => set({ quantityMode: "per-unit" })}>
            Separate prints (per unit)
          </button>
          <button type="button" className={cn(seg(batch), "border-l")} aria-pressed={batch} onClick={() => set({ quantityMode: "batch" })}>
            One print, N pieces (batch)
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          {batch ? (
            <>
              Filament and print time are for the <strong>whole plate</strong>. They are shared across the {qty} pieces, so the price per piece drops. Parts and labour are per piece.
            </>
          ) : (
            <>
              Filament and print time are for <strong>one piece</strong>. Everything scales ×{qty}, so the price per piece stays the same.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

const peso0kg = (n: number) => "₱" + Math.round(n).toLocaleString("en-PH");
