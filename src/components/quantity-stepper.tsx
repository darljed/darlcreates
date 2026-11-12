"use client";

/**
 * Quantity with − and + buttons on either side of the number. The number cannot be typed: it only changes through the
 * buttons (or the arrow keys when it has focus), so it can never hold a letter, a blank or a value outside the limits.
 * Buttons are 40 px so they are easy to hit on a phone.
 */
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

export function QuantityStepper({
  value,
  onChange,
  min = 1,
  max = 99,
  disabled = false,
  label = "Quantity",
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** Names the control for screen readers ("Quantity of Maria"). */
  label?: string;
  className?: string;
}) {
  const set = (n: number) => {
    const next = Math.min(max, Math.max(min, n));
    if (next !== value) onChange(next);
  };
  const btn =
    "flex size-10 shrink-0 items-center justify-center text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-40";
  return (
    <div className={cn("inline-flex items-center overflow-hidden rounded-lg border-2 border-border bg-background", className)}>
      <button type="button" aria-label={`Decrease ${label.toLowerCase()}`} className={btn} disabled={disabled || value <= min} onClick={() => set(value - 1)}>
        <Minus className="size-4" aria-hidden />
      </button>
      <input
        type="text"
        readOnly
        inputMode="none"
        role="spinbutton"
        aria-label={label}
        aria-valuenow={value}
        aria-valuemin={min}
        aria-valuemax={max}
        value={value}
        disabled={disabled}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") { e.preventDefault(); set(value + 1); }
          else if (e.key === "ArrowDown" || e.key === "ArrowLeft") { e.preventDefault(); set(value - 1); }
        }}
        className="h-10 w-12 cursor-default border-x-2 border-border bg-transparent text-center text-sm font-semibold tabular-nums outline-none focus-visible:bg-muted"
      />
      <button type="button" aria-label={`Increase ${label.toLowerCase()}`} className={btn} disabled={disabled || value >= max} onClick={() => set(value + 1)}>
        <Plus className="size-4" aria-hidden />
      </button>
    </div>
  );
}
