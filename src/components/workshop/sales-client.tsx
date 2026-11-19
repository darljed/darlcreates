"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, EmptyState, Panel, Stat, Td, Th, Tr } from "@/components/shell/ui";
import { deleteSaleAction, updateSaleAction } from "@/app/(admin)/admin/sales/actions";
import { formatPHP } from "@/lib/money";
import { PAYMENT_STATUSES, SALE_STATUSES, type PartWithCost, type PaymentStatus, type ProductCosting, type SaleRow, type SaleStatus } from "@/lib/workshop/types";
import { ConfirmDialog } from "./confirm-dialog";
import { NativeSelect } from "./form-bits";
import { SaleDialog } from "./sale-dialog";
import { SaleKanban } from "./sale-kanban";
import { saleCost, salePayload, saleTotals } from "./sale-math";

/**
 * The off-site sales: manual sales taken outside the website, as a table or a kanban board, with filters, a summary strip and
 * add/edit/delete. Status moves are optimistic: the card jumps at once and goes back with a message if the save fails.
 * The rows come from the server-rendered `initialSales`; an optimistic override is dropped as soon as the server's status
 * differs from the one it was made on (i.e. after the refresh, or any other change).
 */
type Override = { status: SaleStatus; base: SaleStatus };
type Dialog = { kind: "edit"; sale: SaleRow | null } | { kind: "delete"; sale: SaleRow };

export function SalesClient({ initialSales, products, parts }: { initialSales: SaleRow[]; products: ProductCosting[]; parts: PartWithCost[] }) {
  const router = useRouter();
  const [view, setView] = useState<"table" | "kanban">("table");
  const [query, setQuery] = useState("");
  const [payment, setPayment] = useState<"" | PaymentStatus>("");
  const [status, setStatus] = useState<"" | SaleStatus>("");
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [overrides, setOverrides] = useState<Record<string, Override>>({});
  const [saving, setSaving] = useState<ReadonlySet<string>>(new Set());

  const sales = useMemo(
    () => initialSales.map((s) => { const o = overrides[s.id]; return o && o.base === s.status ? { ...s, status: o.status } : s; }),
    [initialSales, overrides],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sales.filter((s) =>
      (!payment || s.paymentStatus === payment) && (!status || s.status === status) &&
      (!q || `${s.product} ${s.contact ?? ""} ${s.details ?? ""}`.toLowerCase().includes(q)));
  }, [sales, query, payment, status]);
  const totals = saleTotals(shown);
  const close = () => setDialog(null);

  async function move(sale: SaleRow, next: SaleStatus) {
    if (sale.status === next || saving.has(sale.id)) return;
    const base = initialSales.find((s) => s.id === sale.id)?.status ?? sale.status;
    setOverrides((o) => ({ ...o, [sale.id]: { status: next, base } }));
    setSaving((s) => new Set(s).add(sale.id));
    const res = await updateSaleAction(sale.id, salePayload({ ...sale, status: base }, next));
    setSaving((s) => { const n = new Set(s); n.delete(sale.id); return n; });
    if (!res.ok) {
      setOverrides((o) => Object.fromEntries(Object.entries(o).filter(([id]) => id !== sale.id)));
      return toast.error(res.error);
    }
    router.refresh();
  }

  async function confirmDelete(sale: SaleRow) {
    setBusy(true);
    const res = await deleteSaleAction(sale.id);
    setBusy(false);
    if (!res.ok) return toast.error(res.error);
    toast.success("Sale deleted");
    router.refresh();
    close();
  }

  const onEdit = (s: SaleRow) => setDialog({ kind: "edit", sale: s });
  const onDelete = (s: SaleRow) => setDialog({ kind: "delete", sale: s });

  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Paid revenue" value={formatPHP(totals.revenue)} />
        <Stat label="Cost" value={formatPHP(totals.cost)} />
        <Stat label="Profit" value={formatPHP(totals.profit)} tone={totals.profit < 0 ? "warn" : "default"} hint="Paid and free sales" />
        <Stat label="Unpaid (owed)" value={formatPHP(totals.owed)} tone={totals.owed > 0 ? "warn" : "default"} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input aria-label="Search sales" placeholder="Search product, contact, details..." value={query} onChange={(e) => setQuery(e.target.value)} className="h-8 max-w-xs" />
        <NativeSelect aria-label="Filter by payment status" className="h-8 w-auto" value={payment} onChange={(e) => setPayment(e.target.value as "" | PaymentStatus)}>
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Filter by status" className="h-8 w-auto" value={status} onChange={(e) => setStatus(e.target.value as "" | SaleStatus)}>
          <option value="">All statuses</option>
          {SALE_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </NativeSelect>
        <div role="group" aria-label="View" className="flex">
          <Button size="sm" variant={view === "table" ? "default" : "outline"} aria-pressed={view === "table"} className="rounded-r-none" onClick={() => setView("table")}>Table</Button>
          <Button size="sm" variant={view === "kanban" ? "default" : "outline"} aria-pressed={view === "kanban"} className="rounded-l-none" onClick={() => setView("kanban")}>Kanban</Button>
        </div>
        <Button size="sm" className="ml-auto" onClick={() => setDialog({ kind: "edit", sale: null })}><Plus /> Add sale</Button>
      </div>

      <p className="text-xs text-muted-foreground">{shown.length} {shown.length === 1 ? "sale" : "sales"} shown. Cancelled sales are left out of the totals.</p>

      {shown.length === 0 ? (
        <EmptyState>{initialSales.length === 0 ? "No off-site salesged yet." : "No sales match."}</EmptyState>
      ) : view === "kanban" ? (
        <SaleKanban sales={shown} saving={saving} onMove={move} onEdit={onEdit} onDelete={onDelete} />
      ) : (
        <Panel flush>
          <DataTable className="border-0">
            <thead>
              <tr>
                <Th>Date</Th><Th>Product</Th><Th className="text-right">Qty</Th><Th className="text-right">Total</Th><Th className="text-right">Cost</Th><Th className="text-right">Profit</Th><Th>Payment</Th><Th>Status</Th><Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((s) => {
                const cost = saleCost(s);
                const profit = s.totalCents - cost;
                return (
                  <Tr key={s.id} aria-busy={saving.has(s.id)} className={saving.has(s.id) ? "opacity-60" : undefined}>
                    <Td label="Date" className="whitespace-nowrap">{s.saleDate.slice(0, 10)}</Td>
                    <Td label="Product">
                      <p className="font-medium">{s.product}</p>
                      {(s.contact || s.details) && <p className="max-w-xs truncate text-xs text-muted-foreground">{[s.contact, s.details].filter(Boolean).join(" · ")}</p>}
                    </Td>
                    <Td label="Qty" className="text-right tabular-nums">{s.quantity}</Td>
                    <Td label="Total" className="text-right tabular-nums">{formatPHP(s.totalCents)}</Td>
                    <Td label="Cost" className="text-right tabular-nums">{formatPHP(cost)}</Td>
                    <Td label="Profit" className={profit < 0 ? "text-right tabular-nums text-destructive" : "text-right tabular-nums"}>{formatPHP(profit)}</Td>
                    <Td label="Payment">
                      <Badge variant={s.paymentStatus === "Paid" ? "default" : s.paymentStatus === "Unpaid" ? "destructive" : "secondary"}>{s.paymentStatus}</Badge>
                      {s.modeOfPayment && <span className="ml-1.5 text-xs text-muted-foreground">{s.modeOfPayment}</span>}
                    </Td>
                    <Td label="Status">
                      <NativeSelect aria-label={`Status of ${s.product}`} className="h-7 w-auto text-xs md:text-xs" value={s.status} disabled={saving.has(s.id)} onChange={(e) => move(s, e.target.value as SaleStatus)}>
                        {SALE_STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
                      </NativeSelect>
                    </Td>
                    <Td>
                      <div className="flex items-center gap-1.5">
                        <Button size="icon-xs" variant="ghost" aria-label={`Edit sale of ${s.product}`} title="Edit" onClick={() => onEdit(s)}><Pencil /></Button>
                        <Button size="icon-xs" variant="ghost" aria-label={`Delete sale of ${s.product}`} title="Delete" onClick={() => onDelete(s)}><Trash2 /></Button>
                      </div>
                    </Td>
                  </Tr>
                );
              })}
            </tbody>
          </DataTable>
        </Panel>
      )}

      {dialog?.kind === "edit" && <SaleDialog key={dialog.sale?.id ?? "new"} sale={dialog.sale} products={products} parts={parts} onClose={close} />}
      {dialog?.kind === "delete" && (
        <ConfirmDialog
          title="Delete this sale?"
          description={`Deletes the sale of ${dialog.sale.product}. If its parts were used from inventory (Packaged or Delivered), they are given back.`}
          confirmLabel="Delete sale"
          busy={busy}
          onConfirm={() => confirmDelete(dialog.sale)}
          onCancel={close}
        />
      )}
    </div>
  );
}
