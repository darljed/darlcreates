"use client";

import { useId } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { componentsCost, type Component } from "@/lib/workshop/pricing";
import { isPartUnit, peso, selectClass } from "./estimator-helpers";
import type { EstimatorPart } from "./estimator-client";

/**
 * The inventory parts attached to the job (keychain ring, magnet, wire…), priced per produced unit. Name, unit and price are
 * the part's weighted-average cost; only the quantity is edited. The parts become the product's bill of materials.
 */
export function ComponentsList({ components, onChange, parts }: { components: Component[]; onChange: (next: Component[]) => void; parts: EstimatorPart[] }) {
  const uid = useId();
  const update = (i: number, patch: Partial<Component>) => onChange(components.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));
  const remove = (i: number) => onChange(components.filter((_, idx) => idx !== i));

  const add = (id: string) => {
    const part = parts.find((p) => p.id === id);
    if (!part) return;
    onChange([...components, { name: part.name, unit: isPartUnit(part.unit) ? part.unit : "piece", unitPrice: part.unitPricePesos, qty: 1, partId: part.id }]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`${uid}-add`} className="text-sm font-medium">
          Attached parts <span className="font-normal text-muted-foreground">(per unit)</span>
        </label>
        {parts.length > 0 ? (
          // Always controlled to "" so it reads "+ Add part" and picking the same part twice still fires.
          <select id={`${uid}-add`} className={`${selectClass} sm:max-w-64`} value="" onChange={(e) => add(e.target.value)}>
            <option value="">+ Add part from inventory…</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({peso(p.unitPricePesos)}/{p.unit})
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs text-muted-foreground">No inventory parts yet. Add some in Inventory first.</span>
        )}
      </div>

      {components.length === 0 ? (
        <p className="text-xs text-muted-foreground">None attached. Parts from inventory are costed in and kept in the bill of materials when this becomes a product.</p>
      ) : (
        <div className="space-y-2">
          {components.map((c, i) => (
            <div key={i} className="grid grid-cols-[1fr_auto_5rem_auto] items-center gap-2">
              <span className="min-w-0 truncate text-sm" title={c.name}>
                {c.name || "(unnamed part)"}
              </span>
              <span className="text-right text-xs tabular-nums text-muted-foreground">
                {peso(c.unitPrice)}/{c.unit}
              </span>
              <Input aria-label={`Part ${i + 1} quantity`} type="number" inputMode="decimal" min={0} step="0.01" value={c.qty} onChange={(e) => update(i, { qty: Number(e.target.value) || 0 })} placeholder="qty" />
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove part ${i + 1}`} onClick={() => remove(i)}>
                <X />
              </Button>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t pt-2 text-sm">
            <span className="text-muted-foreground">Parts / unit</span>
            <span className="font-mono tabular-nums">{peso(componentsCost(components))}</span>
          </div>
        </div>
      )}
    </div>
  );
}
