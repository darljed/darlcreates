"use client";

import { cloneElement, isValidElement, useId } from "react";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A labelled form control. Every field has the same shape (a label row, then the control), and the optional hint
 * lives on the label row, right-aligned and truncated (full text on hover and for screen readers). Because the hint
 * never adds a row, fields in the same row line up whether or not they have one.
 * The control must be a single element (Input, Textarea, <select>…): it receives the id and aria-describedby.
 */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const control = isValidElement<{ id?: string; "aria-describedby"?: string }>(children)
    ? cloneElement(children, { id: children.props.id ?? id, "aria-describedby": hint ? hintId : children.props["aria-describedby"] })
    : children;
  return (
    <div className={`grid content-start gap-1 text-xs font-medium ${className ?? ""}`}>
      <div className="flex min-w-0 items-baseline justify-between gap-2">
        <label htmlFor={isValidElement<{ id?: string }>(children) ? (children.props.id ?? id) : undefined} className="shrink-0">
          {label}
        </label>
        {hint && (
          <span id={hintId} title={hint} className="min-w-0 truncate text-[11px] font-normal text-muted-foreground">
            {hint}
          </span>
        )}
      </div>
      {control}
    </div>
  );
}

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

export function RowTools({ i, n, onMove, onRemove, what }: { i: number; n: number; onMove: (d: -1 | 1) => void; onRemove: () => void; what: string }) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button type="button" size="icon" variant="outline" disabled={i === 0} onClick={() => onMove(-1)} aria-label={`Move ${what} up`}>
        <ArrowUp className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="outline" disabled={i === n - 1} onClick={() => onMove(1)} aria-label={`Move ${what} down`}>
        <ArrowDown className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="outline" onClick={onRemove} aria-label={`Remove ${what}`}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}

export function swap<T>(arr: T[], i: number, d: -1 | 1) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}
