import { cn } from "@/lib/utils";

/**
 * Small form helpers shared by the workshop screens: a labelled field wrapper and a native select styled like the Input
 * (native selects work well on phones and keep Radix Select's non-empty-value rule out of the way).
 */
export function Field({ label, htmlFor, hint, className, children }: { label: string; htmlFor: string; hint?: React.ReactNode; className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("grid gap-1", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-base shadow-xs outline-none md:text-sm",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/** A number typed in a form: null when empty or not a finite number. */
export function parseNum(s: string): number | null {
  if (s.trim() === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** A quantity for display: at most 2 decimals, thousands separators. */
export function fmtQty(n: number): string {
  return Number(n.toFixed(2)).toLocaleString("en-PH");
}
