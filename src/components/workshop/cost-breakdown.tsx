import { Panel } from "@/components/shell/ui";
import type { CostBreakdown as Cost } from "@/lib/workshop/pricing";
import { peso } from "./estimator-helpers";

/**
 * The cost build-up of the job: material (per line when there are several), waste, parts, machine time (with the hourly rate),
 * labour, subtotal, failure buffer, the true cost per unit, and the whole-job fees with the margin base they lead to.
 */

function Row({ text, value, sub }: { text: string; value: string; sub?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="text-sm">
        {text}
        {sub && <span className="ml-1.5 text-xs text-muted-foreground">{sub}</span>}
      </span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );
}

export function CostBreakdown({ cost, quantity, mode }: { cost: Cost; quantity: number; mode: "per-unit" | "batch" }) {
  const batch = mode === "batch" && quantity > 1;
  const hasFees = cost.marginLineItems > 0 || cost.passThroughLineItems > 0;
  return (
    <Panel title="Cost breakdown" description={batch ? `Whole print → ${quantity} pieces` : "Per unit"}>
      <div className="divide-y">
        {cost.materialLines.length > 1 ? (
          cost.materialLines.map((l, i) => <Row key={i} text={l.name || `Material ${i + 1}`} value={peso(l.cost)} sub={`${l.grams.toFixed(1)} g${batch ? " · whole plate" : ""}`} />)
        ) : (
          <Row text="Material" value={peso(cost.material)} sub={batch ? "whole plate" : "filament"} />
        )}
        {cost.materialWaste > 0 && <Row text="Waste allowance" value={peso(cost.materialWaste)} sub={`${cost.totalGrams.toFixed(1)} g total`} />}
        {cost.components > 0 && <Row text="Parts" value={peso(cost.components)} sub={batch ? "per piece" : "attached"} />}
        <Row text="Machine time" value={peso(cost.machine)} sub={`@ ${peso(cost.machineHourRate)}/hr${batch ? " · whole plate" : ""}`} />
        <Row text="Labour" value={peso(cost.labor)} sub={batch ? "per piece" : undefined} />
        <Row text="Subtotal" value={peso(cost.subtotal)} />
        <Row text="Failure buffer" value={peso(cost.failure)} />
      </div>
      <div className="mt-2 flex items-baseline justify-between border-t pt-2">
        <span className="text-sm font-semibold">{batch ? "Cost / piece" : "True cost / unit"}</span>
        <span className="font-mono text-base font-bold tabular-nums">{peso(cost.unitCost)}</span>
      </div>
      {quantity > 1 && (
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-sm font-semibold">{batch ? `Whole print ×${quantity}` : `Total cost ×${quantity}`}</span>
          <span className="font-mono text-base font-bold tabular-nums">{peso(cost.unitCost * quantity)}</span>
        </div>
      )}
      {hasFees && (
        <div className="mt-2 space-y-1 border-t pt-2 text-xs">
          {cost.marginLineItems > 0 && (
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">+ Fees (margin applies)</span>
              <span className="font-mono tabular-nums">{peso(cost.marginLineItems)}</span>
            </div>
          )}
          {cost.passThroughLineItems > 0 && (
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground">+ Fees (relayed at cost, after margin)</span>
              <span className="font-mono tabular-nums">{peso(cost.passThroughLineItems)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between pt-1 text-sm">
            <span className="font-semibold">Margin base</span>
            <span className="font-mono font-bold tabular-nums">{peso(cost.totalCost)}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
