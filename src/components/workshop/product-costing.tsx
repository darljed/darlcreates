"use client";

/**
 * The internal costing of a shop product, on its admin page: what one unit costs to make (the stocked parts it uses plus a
 * "print cost" for machine time, labour and failures), and what that leaves as margin at the product's price. Orders and sales
 * use the parts up through this bill of materials. Never shown to customers.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shell/ui";
import { Field, NativeSelect, fmtQty, parseNum } from "@/components/workshop/form-bits";
import { saveProductCostingAction } from "@/app/(admin)/admin/products/costing-actions";
import { formatPHP } from "@/lib/money";
import type { PartWithCost, ProductCosting } from "@/lib/workshop/types";

type Row = { key: number; partId: string; qty: string };

export function ProductCostingPanel({ costing, parts }: { costing: ProductCosting; parts: PartWithCost[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [printCost, setPrintCost] = useState(String(costing.printCostCents / 100));
  const [rows, setRows] = useState<Row[]>(() => costing.bom.map((b, i) => ({ key: i, partId: b.partId, qty: String(b.qty) })));
  const [next, setNext] = useState(costing.bom.length);
  const byId = useMemo(() => new Map(parts.map((p) => [p.id, p])), [parts]);

  const partsCost = Math.round(rows.reduce((s, r) => s + (byId.get(r.partId)?.unitCostCents ?? 0) * (parseNum(r.qty) ?? 0), 0));
  const unitCost = partsCost + Math.round((parseNum(printCost) ?? 0) * 100);
  const margin = costing.basePriceCents > 0 ? (costing.basePriceCents - unitCost) / costing.basePriceCents : null;
  const used = new Set(rows.map((r) => r.partId));

  const save = () =>
    start(async () => {
      const res = await saveProductCostingAction({
        productId: costing.id,
        printCostPesos: parseNum(printCost) ?? 0,
        bom: rows.filter((r) => r.partId && (parseNum(r.qty) ?? 0) > 0).map((r) => ({ partId: r.partId, qty: parseNum(r.qty) })),
      });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success("Costing saved");
      router.refresh();
    });

  return (
    <Panel title="Costing (internal)" description="What one unit costs to make. Customers never see this. Orders and sales use up these parts from Inventory.">
      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="text-xs font-bold">Parts used per unit</h3>
          {rows.length === 0 && <p className="text-xs text-muted-foreground">No parts yet. Add the filament and parts one unit uses so stock goes down when it is made.</p>}
          {rows.map((r) => {
            const p = byId.get(r.partId);
            return (
              <div key={r.key} className="grid grid-cols-[1fr_6rem_auto] items-end gap-2 sm:grid-cols-[1fr_7rem_6rem_auto]">
                <Field label="Part" htmlFor={`bom-part-${r.key}`}>
                  <NativeSelect id={`bom-part-${r.key}`} value={r.partId} onChange={(e) => setRows((all) => all.map((x) => (x.key === r.key ? { ...x, partId: e.target.value } : x)))}>
                    {parts.map((o) => (
                      <option key={o.id} value={o.id} disabled={used.has(o.id) && o.id !== r.partId}>{o.name} ({o.unit})</option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label={`Qty${p ? ` (${p.unit})` : ""}`} htmlFor={`bom-qty-${r.key}`}>
                  <Input id={`bom-qty-${r.key}`} inputMode="decimal" value={r.qty} onChange={(e) => setRows((all) => all.map((x) => (x.key === r.key ? { ...x, qty: e.target.value } : x)))} />
                </Field>
                <p className="hidden pb-2 text-xs tabular-nums text-muted-foreground sm:block">{p ? `${formatPHP(Math.round(p.unitCostCents * (parseNum(r.qty) ?? 0)))}` : ""}{p ? <span className="block">{fmtQty(p.qtyOnHand)} {p.unit} on hand</span> : null}</p>
                <Button type="button" size="icon" variant="outline" aria-label="Remove part" onClick={() => setRows((all) => all.filter((x) => x.key !== r.key))}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            );
          })}
          <Button type="button" size="sm" variant="outline" disabled={parts.length === 0 || used.size >= parts.length} onClick={() => { setRows((all) => [...all, { key: next, partId: parts.find((p) => !used.has(p.id))?.id ?? "", qty: "1" }]); setNext((n) => n + 1); }}>
            <Plus className="mr-1 size-4" /> Add a part
          </Button>
          {parts.length === 0 && <p className="text-xs text-muted-foreground">Add parts under Inventory first.</p>}
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Print cost per unit (₱)" htmlFor="print-cost" hint="Machine time, labour, failures">
            <Input id="print-cost" inputMode="decimal" value={printCost} onChange={(e) => setPrintCost(e.target.value)} />
          </Field>
          <div className="text-xs"><p className="text-muted-foreground">Parts</p><p className="text-sm font-bold tabular-nums">{formatPHP(partsCost)}</p></div>
          <div className="text-xs"><p className="text-muted-foreground">Cost of one unit</p><p className="text-sm font-bold tabular-nums">{formatPHP(unitCost)}</p></div>
          <div className="text-xs">
            <p className="text-muted-foreground">Margin at {formatPHP(costing.basePriceCents)}</p>
            <p className={`text-sm font-bold tabular-nums ${margin !== null && margin < 0 ? "text-destructive" : ""}`}>{margin === null ? "–" : `${Math.round(margin * 100)}%  (${formatPHP(costing.basePriceCents - unitCost)})`}</p>
          </div>
        </div>
        {costing.buildableQty !== null && <p className="text-xs text-muted-foreground">Stock on hand can build {costing.buildableQty} more.</p>}

        <Button type="button" disabled={pending} onClick={save}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />} Save costing
        </Button>
      </div>
    </Panel>
  );
}
