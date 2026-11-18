"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Panel } from "@/components/shell/ui";
import { formatPHP } from "@/lib/money";
import { TIER_LABELS } from "@/lib/workshop/presets";
import type { SavedEstimate } from "@/lib/workshop/types";
import { cn } from "@/lib/utils";
import { peso, peso0, restoreEstimate } from "./estimator-helpers";

/**
 * The saved estimates, newest first, with a tag filter (the parent re-queries the server when it changes). Each row expands to
 * show the filament, parts, fees and the three prices; its actions are Edit (reload into the estimator), Create product, and
 * Delete (behind a confirm dialog).
 */

const date = (iso: string) => new Date(iso).toLocaleDateString("en-PH", { year: "numeric", month: "short", day: "numeric" });

function Details({ estimate }: { estimate: SavedEstimate }) {
  const r = restoreEstimate(estimate.input);
  const used = r.job.materials.filter((m) => Number(m.grams) > 0);
  const batch = r.job.quantityMode === "batch";
  return (
    <div className="space-y-3 bg-muted/40 px-3 py-3 text-xs">
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
        <span>Quantity: {estimate.quantity}</span>
        <span>{batch ? "One print, N pieces" : "Separate prints"}</span>
        <span>
          Print: {r.job.printH || 0}h {r.job.printM || 0}m
        </span>
        <span>Labour: {r.job.laborMinutes || 0} min</span>
        <span>Waste: {r.job.wastePct || 0}%</span>
        <span>True cost: {formatPHP(estimate.totalCostCents)}</span>
        <span>Selected: {TIER_LABELS[r.selectedTier]}</span>
        <span>Price: {formatPHP(estimate.priceCents)}</span>
      </div>

      {used.length > 0 && (
        <div>
          <p className="mb-1 font-medium">Filament ({batch ? "whole plate" : "per piece"})</p>
          <ul className="space-y-0.5">
            {used.map((m, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {m.name || "Material"}: {m.grams} g @ ₱{m.pricePerKg}/kg{m.partId != null && <span className="text-muted-foreground"> · tracked</span>}
                </span>
                <span className="font-mono tabular-nums">{peso((Number(m.grams) / 1000) * Number(m.pricePerKg))}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.components.length > 0 && (
        <div>
          <p className="mb-1 font-medium">Parts</p>
          <ul className="space-y-0.5">
            {r.components.map((c, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {c.name || "Unnamed"}: {c.qty} {c.unit} @ {peso(c.unitPrice)}
                </span>
                <span className="font-mono tabular-nums">{peso(c.unitPrice * c.qty)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {r.lineItems.length > 0 && (
        <div>
          <p className="mb-1 font-medium">Fees</p>
          <ul className="space-y-0.5">
            {r.lineItems.map((l, i) => (
              <li key={i} className="flex justify-between gap-3">
                <span>
                  {l.label || "Fee"} <span className="text-muted-foreground">· {l.applyMargin ? "margin applies" : "relayed"}</span>
                </span>
                <span className="font-mono tabular-nums">{peso(l.amount)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {estimate.tiers.length === 3 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {estimate.tiers.map((t, i) => (
            <span key={i}>
              {TIER_LABELS[i]}: <strong>{peso0(t.rounded)}</strong>
              {estimate.quantity > 1 && <span className="text-muted-foreground"> ({peso0(t.pricePerUnit)}/unit)</span>}
            </span>
          ))}
        </div>
      )}

      {estimate.comment && <p className="border-t pt-2 whitespace-pre-wrap text-muted-foreground">{estimate.comment}</p>}
    </div>
  );
}

export function SavedEstimatesList({
  estimates,
  allTags,
  filter,
  loading,
  editingId,
  onToggleTag,
  onClearFilter,
  onEdit,
  onCreateProduct,
  onDelete,
}: {
  estimates: SavedEstimate[];
  /** Every tag in use. */
  allTags: string[];
  /** The tags the list is filtered by (an estimate must have all of them). */
  filter: string[];
  loading: boolean;
  /** The estimate being edited in the estimator, if any. */
  editingId: string | null;
  onToggleTag: (tag: string) => void;
  onClearFilter: () => void;
  onEdit: (estimate: SavedEstimate) => void;
  onCreateProduct: (estimate: SavedEstimate) => void;
  /** Delete after the owner confirmed. Resolves when finished. */
  onDelete: (estimate: SavedEstimate) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedEstimate | null>(null);
  const [busy, setBusy] = useState(false);

  const confirmDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    await onDelete(deleting);
    setBusy(false);
    setDeleting(null);
  };

  return (
    <Panel
      title={`Saved estimates${estimates.length ? ` (${estimates.length})` : ""}`}
      actions={loading ? <span className="text-xs text-muted-foreground">Updating…</span> : undefined}
      flush
    >
      {(allTags.length > 0 || filter.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 border-b px-3 py-2" role="group" aria-label="Filter by tag">
          {[...new Set([...allTags, ...filter])].map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={filter.includes(t)}
              onClick={() => onToggleTag(t)}
              className={cn("rounded-full border px-2.5 py-0.5 text-xs transition-colors", filter.includes(t) ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent")}
            >
              {t}
            </button>
          ))}
          {filter.length > 0 && (
            <button type="button" onClick={onClearFilter} className="ml-1 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground">
              Clear
            </button>
          )}
        </div>
      )}

      {estimates.length === 0 ? (
        <EmptyState>{filter.length > 0 ? "No estimates have all of these tags." : "No saved estimates yet. Work out a job and press Save estimate."}</EmptyState>
      ) : (
        <ul className="divide-y">
          {estimates.map((e) => {
            const open = expanded === e.id;
            const standard = e.tiers[1];
            return (
              <li key={e.id} className={cn(editingId === e.id && "bg-accent/30")}>
                <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
                  <button type="button" className="flex min-w-0 flex-1 items-start gap-1.5 text-left" aria-expanded={open} onClick={() => setExpanded(open ? null : e.id)}>
                    {open ? <ChevronDown className="mt-0.5 size-4 shrink-0" aria-hidden /> : <ChevronRight className="mt-0.5 size-4 shrink-0" aria-hidden />}
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-medium">{e.title || "Untitled estimate"}</span>
                        <span className="text-xs text-muted-foreground">{date(e.createdAt)}</span>
                        {editingId === e.id && <Badge variant="outline">Editing</Badge>}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        Cost {formatPHP(e.totalCostCents)}
                        {standard && <> · Standard {peso0(standard.rounded)}</>}
                        {e.quantity > 1 && <> · ×{e.quantity}</>}
                      </span>
                      {e.tags.length > 0 && (
                        <span className="mt-1 flex flex-wrap gap-1">
                          {e.tags.map((t) => (
                            <Badge key={t} variant="secondary" className="text-[10px]">
                              {t}
                            </Badge>
                          ))}
                        </span>
                      )}
                    </span>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button type="button" size="xs" variant="outline" onClick={() => onEdit(e)}>
                      Edit
                    </Button>
                    <Button type="button" size="xs" variant="outline" onClick={() => onCreateProduct(e)}>
                      Create product
                    </Button>
                    <Button type="button" size="xs" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(e)}>
                      Delete
                    </Button>
                  </div>
                </div>
                {open && <Details estimate={e} />}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={deleting !== null} onOpenChange={(o) => !o && !busy && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this estimate?</DialogTitle>
            <DialogDescription>“{deleting?.title || "Untitled estimate"}” will be removed for good. Products created from it are not affected.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={confirmDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}
