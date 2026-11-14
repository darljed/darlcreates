/**
 * The order's activity list (status history) shown to customers and the owner.
 */
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const LABELS: Record<string, string> = {
  awaiting_payment: "Order placed",
  paid: "Payment verified",
  in_production: "In production",
  ready_to_ship: "Ready to ship",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
  refunded: "Refunded",
};

/** A compact progress timeline built from the append-only status history. */
export function OrderTimeline({
  history,
}: {
  history: { toStatus: string; note: string; createdAt: Date }[];
}) {
  // history is newest-first; reverse to show chronological progress.
  const chrono = [...history].reverse();

  return (
    <ol className="space-y-3">
      {chrono.map((h, i) => (
        <li key={i} className="flex gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
              "bg-primary text-primary-foreground",
            )}
          >
            <Check className="size-3" />
          </span>
          <div>
            <p className="text-sm font-semibold">
              {LABELS[h.toStatus] ?? h.toStatus}
            </p>
            <p className="text-xs text-muted-foreground">
              {h.createdAt.toLocaleString("en-PH")}
              {h.note && h.note.trim().toLowerCase() !== (LABELS[h.toStatus] ?? h.toStatus).toLowerCase() ? ` · ${h.note}` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
