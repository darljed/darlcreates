"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { History, Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, EmptyState, Panel, Td, Th, Tr } from "@/components/shell/ui";
import { deletePartAction } from "@/app/(admin)/admin/inventory/actions";
import { formatPHP } from "@/lib/money";
import type { PartWithCost } from "@/lib/workshop/types";
import { AdjustDialog } from "./adjust-dialog";
import { ConfirmDialog } from "./confirm-dialog";
import { fmtQty } from "./form-bits";
import { PartDialog } from "./part-dialog";
import { PartHistoryDialog } from "./part-history-dialog";
import { RestockDialog } from "./restock-dialog";

/**
 * The inventory screen: parts with stock, average cost and value, search and low-stock filter, and the part dialogs
 * (add/edit, restock, adjust, history, delete). The list is derived from the server-rendered `initialParts`, which is
 * replaced when `router.refresh()` re-renders the page after a change.
 */
type Dialog =
  | { kind: "edit"; part: PartWithCost | null }
  | { kind: "restock" | "adjust" | "history" | "delete"; part: PartWithCost };

export function InventoryClient({ initialParts }: { initialParts: PartWithCost[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return initialParts.filter((p) => (!lowOnly || p.lowStock) && (!q || `${p.name} ${p.category ?? ""}`.toLowerCase().includes(q)));
  }, [initialParts, query, lowOnly]);
  const totalValue = shown.reduce((s, p) => s + p.stockValueCents, 0);
  const lowCount = initialParts.filter((p) => p.lowStock).length;
  const close = () => setDialog(null);

  async function confirmDelete(part: PartWithCost) {
    setBusy(true);
    const res = await deletePartAction(part.id);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Part deleted");
    router.refresh();
    close();
  }

  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search parts" placeholder="Search parts..." value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 max-w-xs" />
        <Button size="sm" variant={lowOnly ? "default" : "outline"} aria-pressed={lowOnly} onClick={() => setLowOnly((v) => !v)}>
          Low stock{lowCount > 0 ? ` (${lowCount})` : ""}
        </Button>
        <Button size="sm" className="ml-auto" onClick={() => setDialog({ kind: "edit", part: null })}><Plus /> Add part</Button>
      </div>

      <p className="text-xs text-muted-foreground">
        {shown.length} {shown.length === 1 ? "part" : "parts"} · stock value <span className="font-semibold text-foreground">{formatPHP(totalValue)}</span>
      </p>

      {shown.length === 0 ? (
        <EmptyState>{initialParts.length === 0 ? "No parts yet. Add your first part." : "No parts match."}</EmptyState>
      ) : (
        <Panel flush>
          <DataTable className="border-0">
            <thead>
              <tr>
                <Th>Part</Th><Th>Category</Th><Th className="text-right">On hand</Th><Th className="text-right">Avg unit cost</Th><Th className="text-right">Stock value</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((p) => (
                <Tr key={p.id}>
                  <Td label="Part">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{p.name}</span>
                      {p.lowStock && <Badge variant="destructive">Low stock</Badge>}
                    </div>
                    {p.notes && <p className="max-w-xs truncate text-xs text-muted-foreground">{p.notes}</p>}
                  </Td>
                  <Td label="Category" className="text-muted-foreground">{p.category ?? "-"}</Td>
                  <Td label="On hand" className="text-right tabular-nums">{fmtQty(p.qtyOnHand)} {p.unit}</Td>
                  <Td label="Avg unit cost" className="text-right tabular-nums">{formatPHP(p.unitCostCents)}</Td>
                  <Td label="Stock value" className="text-right tabular-nums">{formatPHP(p.stockValueCents)}</Td>
                  <Td>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "restock", part: p })}>Restock</Button>
                      <Button size="xs" variant="outline" onClick={() => setDialog({ kind: "adjust", part: p })}>Adjust</Button>
                      <Button size="icon-xs" variant="ghost" aria-label={`History of ${p.name}`} title="History" onClick={() => setDialog({ kind: "history", part: p })}><History /></Button>
                      <Button size="icon-xs" variant="ghost" aria-label={`Edit ${p.name}`} title="Edit" onClick={() => setDialog({ kind: "edit", part: p })}><Pencil /></Button>
                      <Button size="icon-xs" variant="ghost" aria-label={`Delete ${p.name}`} title="Delete" onClick={() => setDialog({ kind: "delete", part: p })}><Trash2 /></Button>
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </DataTable>
        </Panel>
      )}

      {dialog?.kind === "edit" && <PartDialog key={dialog.part?.id ?? "new"} part={dialog.part} onClose={close} />}
      {dialog?.kind === "restock" && <RestockDialog key={dialog.part.id} part={dialog.part} onClose={close} />}
      {dialog?.kind === "adjust" && <AdjustDialog key={dialog.part.id} part={dialog.part} onClose={close} />}
      {dialog?.kind === "history" && <PartHistoryDialog key={dialog.part.id} part={liveOf(initialParts, dialog.part)} onClose={close} />}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title={`Delete ${dialog.part.name}?`}
          description="This removes the part with all its purchase lots and stock history, and takes it out of every product's bill of materials. This cannot be undone."
          confirmLabel="Delete part"
          busy={busy}
          onConfirm={() => confirmDelete(dialog.part)}
          onCancel={close}
        />
      )}
    </div>
  );
}

/** The freshest copy of a part (after a refresh), falling back to the one the dialog opened with. */
function liveOf(parts: PartWithCost[], part: PartWithCost): PartWithCost {
  return parts.find((p) => p.id === part.id) ?? part;
}
