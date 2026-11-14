"use client";

/**
 * A row of colour swatches from the filaments on offer. Used for every colour in the designer, so a customer can only
 * pick what can be printed.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function PalettePicker({
  palette,
  value,
  onChange,
  label,
  size = "md",
}: {
  palette: string[];
  value: string;
  onChange: (hex: string) => void;
  label: string;
  size?: "sm" | "md";
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-1.5">
      {palette.map((hex) => {
        const on = hex.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={hex}
            type="button"
            aria-label={hex}
            aria-pressed={on}
            title={hex}
            onClick={() => onChange(hex)}
            className={cn(
              "relative flex items-center justify-center rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              size === "sm" ? "size-6" : "size-8",
              on ? "border-foreground ring-2 ring-ring" : "border-border",
            )}
            style={{ backgroundColor: hex }}
          >
            {on && <Check className={cn("drop-shadow", size === "sm" ? "size-3" : "size-4", isLight(hex) ? "text-black" : "text-white")} aria-hidden />}
          </button>
        );
      })}
    </div>
  );
}

/** Whether a colour is light enough to need dark ink on top of it. */
export function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
}
