"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { Tier } from "@/lib/workshop/pricing";
import { TIER_LABELS } from "@/lib/workshop/presets";
import { cn } from "@/lib/utils";
import { peso, peso0 } from "./estimator-helpers";

/**
 * The three price tiers (Economy, Standard, Premium). Clicking a card selects it as the selling price and opens its detail:
 * price and profit per item, the exact whole-print price, and a margin slider that overrides the tier's margin for this
 * session only. "Reset margins" puts the settings' margins back.
 */
export function PriceTiers({
  tiers,
  quantity,
  margins,
  defaultMargins,
  selectedIndex,
  onSelect,
  onMarginChange,
  onResetMargins,
}: {
  tiers: Tier[];
  quantity: number;
  margins: [number, number, number];
  defaultMargins: [number, number, number];
  selectedIndex: number;
  onSelect: (index: number) => void;
  /** One tier's margin as a fraction (0 to 0.9). */
  onMarginChange: (index: number, margin: number) => void;
  onResetMargins: () => void;
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(selectedIndex);
  const adjusted = margins.some((m, i) => Math.abs(m - defaultMargins[i]) > 1e-9);

  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">
          Prices <span className="font-normal text-muted-foreground">· tap one to select the selling price</span>
        </h2>
        {adjusted && (
          <button type="button" className="text-xs text-primary underline-offset-2 hover:underline" onClick={onResetMargins}>
            Reset margins
          </button>
        )}
      </div>
      <div className="@container">
        <div className="grid grid-cols-1 gap-2 @md:grid-cols-3">
          {tiers.map((t, i) => {
            const selected = i === selectedIndex;
            const open = openIndex === i;
            return (
              <div key={i} className={cn("relative rounded-lg border bg-card p-3 transition-colors", selected ? "border-primary ring-2 ring-primary/40" : "hover:border-primary/50")}>
                {selected && <span className="absolute -top-2 left-3 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">Selected</span>}
                <button
                  type="button"
                  className="w-full text-left"
                  aria-expanded={open}
                  aria-pressed={selected}
                  aria-controls={`tier-detail-${i}`}
                  onClick={() => {
                    onSelect(i);
                    setOpenIndex(open && selected ? null : i);
                  }}
                >
                  <span className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {TIER_LABELS[i]}
                    {open ? <ChevronUp className="size-3.5" aria-hidden /> : <ChevronDown className="size-3.5" aria-hidden />}
                  </span>
                  <span className="mt-1 block font-mono text-xl font-bold tabular-nums">
                    {peso0(quantity > 1 ? t.pricePerUnit : t.rounded)}
                    <span className="ml-1 text-[11px] font-normal text-muted-foreground">{quantity > 1 ? "/ item" : "total"}</span>
                  </span>
                  {quantity > 1 && (
                    <span className="mt-0.5 block font-mono text-sm tabular-nums text-muted-foreground">
                      {peso0(t.rounded)}
                      <span className="ml-1 text-[11px]">/ print (×{quantity})</span>
                    </span>
                  )}
                  <span className="mt-2 block space-y-0.5 text-xs text-muted-foreground">
                    <span className="block">{Math.round(t.marginPct * 100)}% margin</span>
                    <span className="block">Profit {peso(t.profit)}</span>
                  </span>
                </button>

                {open && (
                  <div id={`tier-detail-${i}`} className="mt-3 space-y-2 border-t pt-3 text-xs">
                    <div className="flex items-baseline justify-between">
                      <span className="text-muted-foreground">Price / item</span>
                      <span className="font-mono text-sm font-semibold tabular-nums">{peso(t.pricePerUnit)}</span>
                    </div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-muted-foreground">Profit / item</span>
                      <span className="font-mono tabular-nums">{peso(t.profitPerUnit)}</span>
                    </div>
                    {quantity > 1 && (
                      <div className="flex items-baseline justify-between">
                        <span className="text-muted-foreground">Whole print ×{quantity}</span>
                        <span className="font-mono tabular-nums">{peso(t.price)} exact</span>
                      </div>
                    )}
                    <label className="block pt-1 font-medium text-muted-foreground" htmlFor={`tier-margin-${i}`}>
                      Adjust margin: {Math.round(t.marginPct * 100)}%
                    </label>
                    <input id={`tier-margin-${i}`} type="range" min={0} max={90} step={1} value={Math.round(t.marginPct * 100)} onChange={(e) => onMarginChange(i, Number(e.target.value) / 100)} className="w-full accent-primary" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
