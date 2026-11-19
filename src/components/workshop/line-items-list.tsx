"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lineItemsSplit, type LineItem } from "@/lib/workshop/pricing";
import { cn } from "@/lib/utils";
import { peso } from "./estimator-helpers";

/**
 * Ad-hoc fees on the job (design, delivery, rush). Each is for the whole job and is either "Margin" (folded into the cost, so
 * the failure buffer and the pricing margin apply) or "Relay" (added to the price after the margin, at cost, zero profit).
 */

const seg = (on: boolean) => cn("px-2 py-1 text-xs transition-colors", on ? "bg-primary text-primary-foreground" : "hover:bg-muted");

export function LineItemsList({ items, onChange }: { items: LineItem[]; onChange: (next: LineItem[]) => void }) {
  const update = (i: number, patch: Partial<LineItem>) => onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const { marginLineItems, passThroughLineItems } = lineItemsSplit(items);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          Extra fees <span className="font-normal text-muted-foreground">(design, delivery, rush…)</span>
        </p>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange([...items, { label: "", amount: 0, applyMargin: false }])}>
          <Plus /> Add fee
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">None. Add a design fee (margin applies) or a courier fee (relayed at cost).</p>
      ) : (
        <div className="space-y-2">
          {items.map((it, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_auto] items-center gap-2 sm:grid-cols-[1fr_6rem_auto_auto]">
              <Input aria-label={`Fee ${i + 1} label`} value={it.label} onChange={(e) => update(i, { label: e.target.value })} placeholder="e.g. Design fee" />
              <Input aria-label={`Fee ${i + 1} amount`} type="number" inputMode="decimal" min={0} step="0.01" value={it.amount} onChange={(e) => update(i, { amount: Number(e.target.value) || 0 })} placeholder="₱" />
              <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove fee ${i + 1}`} className="sm:order-last" onClick={() => remove(i)}>
                <X />
              </Button>
              <div role="group" aria-label={`Fee ${i + 1} treatment`} className="col-span-3 flex w-fit overflow-hidden rounded-md border sm:col-span-1">
                <button type="button" className={seg(it.applyMargin)} aria-pressed={it.applyMargin} title="The margin applies on top of this fee" onClick={() => update(i, { applyMargin: true })}>
                  Margin
                </button>
                <button type="button" className={cn(seg(!it.applyMargin), "border-l")} aria-pressed={!it.applyMargin} title="Relayed at cost: no margin, zero profit" onClick={() => update(i, { applyMargin: false })}>
                  Relay
                </button>
              </div>
            </div>
          ))}
          <p className="border-t pt-2 text-xs text-muted-foreground">
            Margin fees {peso(marginLineItems)} · Relayed {peso(passThroughLineItems)}
          </p>
        </div>
      )}
    </div>
  );
}
