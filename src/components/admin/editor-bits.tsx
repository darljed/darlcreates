"use client";

import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Label wraps its control, so every input has an accessible name without id plumbing. */
export function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`grid content-start gap-1 text-xs font-medium ${className ?? ""}`}>
      <span>{label}</span>
      {children}
      {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
    </label>
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
