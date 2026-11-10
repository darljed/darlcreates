import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  paid: "Paid",
  in_production: "In production",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

const STYLES: Record<string, string> = {
  awaiting_payment: "bg-accent text-accent-foreground",
  paid: "bg-secondary text-secondary-foreground",
  in_production: "bg-secondary text-secondary-foreground",
  ready_to_ship: "bg-secondary text-secondary-foreground",
  shipped: "bg-primary text-primary-foreground",
  delivered: "bg-green-600 text-white",
  cancelled: "bg-muted text-muted-foreground",
  refunded: "bg-muted text-muted-foreground",
};

export function OrderStatusBadge({ status, size = "md" }: { status: string; size?: "sm" | "md" }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full font-bold",
        size === "sm" ? "px-2 py-0.5 text-[11px]" : "px-3 py-1 text-sm",
        STYLES[status] ?? "bg-muted text-muted-foreground",
      )}
    >
      {LABELS[status] ?? status}
    </span>
  );
}
