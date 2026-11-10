import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = [
  { key: "awaiting_payment", label: "Placed" },
  { key: "paid", label: "Paid" },
  { key: "in_production", label: "Printing" },
  { key: "ready_to_ship", label: "Packed" },
  { key: "shipped", label: "Shipped" },
  { key: "delivered", label: "Delivered" },
] as const;

/**
 * Where the order is, at a glance. Done steps are filled, the current one is ringed.
 * Cancelled / refunded orders show a plain notice instead of a misleading progress bar.
 */
export function OrderProgress({ status }: { status: string }) {
  if (status === "cancelled" || status === "refunded") {
    return (
      <p role="status" className="rounded-md border border-dashed bg-muted/50 px-3 py-2 text-sm font-medium text-muted-foreground">
        This order was {status}.
      </p>
    );
  }
  const current = Math.max(0, STEPS.findIndex((s) => s.key === status));
  return (
    <ol aria-label="Order progress" className="grid grid-cols-6 gap-1">
      {STEPS.map((s, i) => {
        const done = i < current || status === "delivered";
        const isCurrent = i === current && status !== "delivered";
        return (
          <li key={s.key} aria-current={isCurrent ? "step" : undefined} className="flex flex-col items-center gap-1 text-center">
            <span
              className={cn(
                "flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold",
                done && "border-primary bg-primary text-primary-foreground",
                isCurrent && "border-primary bg-background text-primary ring-4 ring-primary/20",
                !done && !isCurrent && "border-border bg-background text-muted-foreground",
              )}
            >
              {done ? <Check className="size-4" aria-hidden /> : i + 1}
            </span>
            <span className={cn("text-[11px] leading-tight sm:text-xs", isCurrent || done ? "font-semibold" : "text-muted-foreground")}>
              {s.label}
              <span className="sr-only">{done ? " (done)" : isCurrent ? " (current)" : ""}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Cart → Details → Pay → Done, shown on the cart and checkout pages. */
export function CheckoutSteps({ current }: { current: 1 | 2 | 3 | 4 }) {
  const steps = ["Cart", "Details", "Pay", "Done"];
  return (
    <ol aria-label="Checkout steps" className="mb-6 flex flex-wrap items-center gap-x-1.5 gap-y-2 text-sm sm:gap-x-2">
      {steps.map((label, i) => {
        const n = i + 1;
        return (
          <li key={label} aria-current={n === current ? "step" : undefined} className="flex items-center gap-1.5 sm:gap-2">
            <span
              className={cn(
                "flex size-6 items-center justify-center rounded-full text-xs font-bold",
                n < current && "bg-primary text-primary-foreground",
                n === current && "bg-primary text-primary-foreground ring-4 ring-primary/20",
                n > current && "bg-muted text-muted-foreground",
              )}
            >
              {n < current ? <Check className="size-3.5" aria-hidden /> : n}
            </span>
            <span className={cn(n === current ? "font-semibold" : "text-muted-foreground max-sm:sr-only")}>{label}</span>
            {n < steps.length && <span aria-hidden className="h-px w-4 bg-border sm:mx-1 sm:w-10" />}
          </li>
        );
      })}
    </ol>
  );
}
