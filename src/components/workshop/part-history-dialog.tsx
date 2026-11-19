"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { editPurchaseAction, listMovementsAction, listPurchasesAction, voidPurchaseAction } from "@/app/(admin)/admin/inventory/actions";
import { formatPHP } from "@/lib/money";
import type { PartWithCost, PurchaseRow } from "@/lib/workshop/types";
import { fmtQty, parseNum } from "./form-bits";

/** Purchase lots (edit / void) and recent stock movements for one part, in a dialog. Render only while open. */
type Movement = { id: string; delta: number; reason: string; note: string | null; createdAt: string };
type Loaded = { version: number; purchases: PurchaseRow[]; movements: Movement[] } | { version: number; error: string };

const REASONS: Record<string, string> = {
  purchase: "Purchase",
  "purchase-void": "Purchase voided",
  adjustment: "Adjustment",
  sale: "Used in sale",
  "sale-restock": "Sale undone",
  order: "Website order",
  "order-restock": "Order undone",
};
const day = (iso: string) => iso.slice(0, 10);

export function PartHistoryDialog({ part, onClose }: { part: PartWithCost; onClose: () => void }) {
  const router = useRouter();
  const uid = useId();
  const [version, setVersion] = useState(0);
  const [data, setData] = useState<Loaded | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [qty, setQty] = useState("");
  const [cost, setCost] = useState("");
  const [supplier, setSupplier] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([listPurchasesAction(part.id), listMovementsAction(part.id)]).then(([p, m]) => {
      if (cancelled) return;
      if (!p.ok) return setData({ version, error: p.error });
      if (!m.ok) return setData({ version, error: m.error });
      setData({ version, purchases: p.purchases, movements: m.movements });
    });
    return () => { cancelled = true; };
  }, [part.id, version]);

  const loaded = data && data.version === version ? data : null;

  function startEdit(p: PurchaseRow) {
    setEditId(p.id);
    setQty(String(p.qty));
    setCost(String(p.totalCostCents / 100));
    setSupplier(p.supplier ?? "");
  }

  async function changed(message: string) {
    toast.success(message);
    setEditId(null);
    setVersion((v) => v + 1);
    router.refresh();
  }

  async function saveEdit(id: string) {
    const q = parseNum(qty), c = parseNum(cost);
    if (q === null || q <= 0) return toast.error("Quantity must be more than 0");
    if (c === null || c < 0) return toast.error("Total cost must be 0 or more");
    setBusy(true);
    const res = await editPurchaseAction(id, { qty: q, totalCostPesos: c, supplier: supplier || undefined });
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    await changed("Purchase updated");
  }

  async function voidLot(id: string) {
    if (!window.confirm("Void this purchase? Its quantity is taken out of stock.")) return;
    setBusy(true);
    const res = await voidPurchaseAction(id);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    await changed("Purchase voided");
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>History: {part.name}</DialogTitle>
          <DialogDescription>On hand: {fmtQty(part.qtyOnHand)} {part.unit}.</DialogDescription>
        </DialogHeader>
        {!loaded && <p className="text-sm text-muted-foreground">Fetching history…</p>}
        {loaded && "error" in loaded && <p className="text-sm text-destructive">{loaded.error}</p>}
        {loaded && !("error" in loaded) && (
          <div className="grid gap-5">
            <section aria-label="Purchases">
              <h3 className="mb-1 text-sm font-semibold">Purchases</h3>
              {loaded.purchases.length === 0 ? <p className="text-xs text-muted-foreground">No purchases yet.</p> : (
                <ul className="divide-y border text-sm">
                  {loaded.purchases.map((p) => (
                    <li key={p.id} className="p-2">
                      {editId === p.id ? (
                        <div className="grid gap-2 sm:grid-cols-4">
                          <Input aria-label="Quantity" type="number" inputMode="decimal" step="any" min={0} value={qty} onChange={(e) => setQty(e.target.value)} />
                          <Input aria-label="Total cost in pesos" type="number" inputMode="decimal" step="any" min={0} value={cost} onChange={(e) => setCost(e.target.value)} />
                          <Input id={`${uid}-sup`} aria-label="Supplier" placeholder="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} maxLength={120} />
                          <div className="flex gap-2">
                            <Button size="sm" onClick={() => saveEdit(p.id)} disabled={busy}>Save</Button>
                            <Button size="sm" variant="outline" onClick={() => setEditId(null)} disabled={busy}>Cancel</Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="font-medium">{fmtQty(p.qty)} {part.unit} for {formatPHP(p.totalCostCents)}</p>
                            <p className="text-xs text-muted-foreground">{day(p.purchasedAt)}{p.supplier ? ` · ${p.supplier}` : ""}</p>
                          </div>
                          <div className="flex gap-2">
                            <Button size="xs" variant="outline" onClick={() => startEdit(p)} disabled={busy}>Edit</Button>
                            <Button size="xs" variant="outline" onClick={() => voidLot(p.id)} disabled={busy}>Void</Button>
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-label="Stock movements">
              <h3 className="mb-1 text-sm font-semibold">Recent stock movements</h3>
              {loaded.movements.length === 0 ? <p className="text-xs text-muted-foreground">No movements yet.</p> : (
                <ul className="divide-y border text-sm">
                  {loaded.movements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-3 p-2">
                      <div className="min-w-0">
                        <p>{REASONS[m.reason] ?? m.reason}</p>
                        <p className="truncate text-xs text-muted-foreground">{day(m.createdAt)}{m.note ? ` · ${m.note}` : ""}</p>
                      </div>
                      <span className={m.delta < 0 ? "font-semibold tabular-nums text-destructive" : "font-semibold tabular-nums"}>{m.delta > 0 ? "+" : ""}{fmtQty(m.delta)} {part.unit}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
