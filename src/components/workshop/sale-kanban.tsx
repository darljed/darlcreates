"use client";

import { useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPHP } from "@/lib/money";
import { cn } from "@/lib/utils";
import { SALE_STATUSES, type SaleRow, type SaleStatus } from "@/lib/workshop/types";
import { NativeSelect } from "./form-bits";
import { saleCost } from "./sale-math";

/**
 * Kanban view of the off-site sales: one column per status. Cards can be dragged between columns (native HTML5 drag and drop)
 * or moved with the status dropdown on each card, which also works on touch screens.
 */
interface Props {
  sales: SaleRow[];
  saving: ReadonlySet<string>;
  onMove: (sale: SaleRow, status: SaleStatus) => void;
  onEdit: (sale: SaleRow) => void;
  onDelete: (sale: SaleRow) => void;
}

export function SaleKanban({ sales, saving, onMove, onEdit, onDelete }: Props) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<SaleStatus | null>(null);

  return (
    <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-2 xl:grid-cols-4">
      {SALE_STATUSES.map((status) => {
        const col = sales.filter((s) => s.status === status);
        return (
          <section
            key={status}
            aria-label={`${status} sales`}
            onDragOver={(e) => { if (dragging) { e.preventDefault(); setOver(status); } }}
            onDragLeave={() => setOver((o) => (o === status ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const sale = sales.find((s) => s.id === (dragging ?? e.dataTransfer.getData("text/plain")));
              setDragging(null);
              setOver(null);
              if (sale && sale.status !== status) onMove(sale, status);
            }}
            className={cn("min-h-32 min-w-0 border bg-muted/30", over === status && "border-primary bg-primary/5")}
          >
            <h3 className="flex items-center justify-between border-b bg-muted/60 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {status}<span className="tabular-nums">{col.length}</span>
            </h3>
            <ul className="grid gap-2 p-2">
              {col.map((s) => {
                const busy = saving.has(s.id);
                const profit = s.totalCents - saleCost(s);
                return (
                  <li
                    key={s.id}
                    draggable={!busy}
                    onDragStart={(e) => { e.dataTransfer.setData("text/plain", s.id); e.dataTransfer.effectAllowed = "move"; setDragging(s.id); }}
                    onDragEnd={() => { setDragging(null); setOver(null); }}
                    aria-busy={busy}
                    className={cn("grid cursor-grab gap-1.5 border bg-card p-2 text-sm active:cursor-grabbing", busy && "opacity-60", dragging === s.id && "opacity-40")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 break-words font-medium">{s.quantity} × {s.product}</p>
                      <Badge variant={s.paymentStatus === "Paid" ? "default" : s.paymentStatus === "Unpaid" ? "destructive" : "secondary"}>{s.paymentStatus}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {s.saleDate.slice(0, 10)}{s.contact ? ` · ${s.contact}` : ""}
                    </p>
                    <p className="text-xs tabular-nums">
                      {formatPHP(s.totalCents)} <span className="text-muted-foreground">· profit</span> <span className={profit < 0 ? "text-destructive" : ""}>{formatPHP(profit)}</span>
                    </p>
                    {s.details && <p className="line-clamp-2 text-xs text-muted-foreground">{s.details}</p>}
                    <div className="flex items-center gap-1.5">
                      <NativeSelect aria-label={`Status of ${s.product}`} className="h-7 text-xs md:text-xs" value={s.status} disabled={busy} onChange={(e) => onMove(s, e.target.value as SaleStatus)}>
                        {SALE_STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
                      </NativeSelect>
                      <Button size="icon-xs" variant="ghost" aria-label={`Edit sale of ${s.product}`} onClick={() => onEdit(s)}><Pencil /></Button>
                      <Button size="icon-xs" variant="ghost" aria-label={`Delete sale of ${s.product}`} onClick={() => onDelete(s)}><Trash2 /></Button>
                    </div>
                    {busy && <p className="text-xs text-muted-foreground" role="status">Saving...</p>}
                  </li>
                );
              })}
              {col.length === 0 && <li className="p-3 text-center text-xs text-muted-foreground">Nothing here</li>}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
