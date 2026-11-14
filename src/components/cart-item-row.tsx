"use client";

/**
 * One cart line: thumbnail, chosen options, price, quantity stepper and remove.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Box } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/quantity-stepper";
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
        {line.designUri ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.designUri} alt="Your clicker design" className="size-full object-contain" />
        ) : line.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.imageUrl} alt={line.productName} className="size-full object-cover" />
        ) : (
          <Box className="size-8 text-muted-foreground/50" />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <h3 className="font-bold">{line.productName}</h3>
        {line.uploadUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={line.uploadUrl} alt="Your uploaded image" className="mt-2 size-14 rounded-md border object-cover" />
        )}
        <ul className="mt-1 text-sm text-muted-foreground">
          {line.summary.map((s) => (
            <li key={s.label}>
              <span className="font-medium">{s.label}:</span> {s.value}
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
          <QuantityStepper value={line.qty} disabled={pending} label={`Quantity of ${line.productName}`} onChange={setQty} />
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
