"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Trash2, Box } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { formatPHP } from "@/lib/money";
import type { CartLine } from "@/lib/cart";
import { updateQtyAction, removeItemAction } from "@/app/(shop)/cart/actions";

export function CartItemRow({ line }: { line: CartLine }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function setQty(qty: number) {
    if (qty < 1) return;
    startTransition(async () => {
      const res = await updateQtyAction({ itemId: line.id, qty });
      if (!res.ok) toast.error(res.error ?? "Update failed");
      else router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const res = await removeItemAction({ itemId: line.id });
      if (!res.ok) toast.error(res.error ?? "Remove failed");
      else {
        toast.success("Removed");
        router.refresh();
      }
    });
  }

  return (
    <div className="flex gap-4 rounded-xl border-2 border-border bg-card p-4">
      <div className="flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        {line.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.imageUrl} alt={line.productName} className="size-full object-cover" />
        ) : (
          <Box className="size-8 text-muted-foreground/50" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-bold">{line.productName}</h3>
        <ul className="mt-1 text-sm text-muted-foreground">
          {line.summary.map((s) => (
            <li key={s.label}>
              <span className="font-medium">{s.label}:</span> {s.value}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex items-center gap-3">
          <div className="inline-flex items-center rounded-lg border-2 border-border">
            <button
              type="button"
              aria-label="Decrease quantity"
              className="p-2 disabled:opacity-40"
              disabled={pending || line.qty <= 1}
              onClick={() => setQty(line.qty - 1)}
            >
              <Minus className="size-4" />
            </button>
            <span className="w-8 text-center font-semibold">{line.qty}</span>
            <button
              type="button"
              aria-label="Increase quantity"
              className="p-2 disabled:opacity-40"
              disabled={pending}
              onClick={() => setQty(line.qty + 1)}
            >
              <Plus className="size-4" />
            </button>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            disabled={pending}
            onClick={remove}
          >
            <Trash2 className="mr-1 size-4" /> Remove
          </Button>
        </div>
      </div>

      <div className="text-right">
        <p className="font-extrabold text-primary">{formatPHP(line.lineTotalCents)}</p>
        <p className="text-xs text-muted-foreground">
          {formatPHP(line.unitPriceCents)} each
        </p>
      </div>
    </div>
  );
}
