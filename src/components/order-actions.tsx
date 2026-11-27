"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cancelOrderAction, reorderAction } from "@/app/(portal)/orders/actions";
import { useConfirm } from "@/components/confirm-provider";

/** "Buy again": copies the order's items into the cart and goes there. */
export function ReorderButton({ orderNo, size = "sm", variant = "outline" }: { orderNo: string; size?: "sm" | "default"; variant?: "outline" | "default" }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await reorderAction({ orderNo });
          if (!res.ok) return void toast.error(res.error);
          if (res.skipped.length) toast.warning(`Some items couldn't be added: ${res.skipped.join("; ")}`);
          else toast.success("Items added to your cart");
          router.push("/cart");
          router.refresh();
        })
      }
    >
      {pending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <RotateCcw className="mr-1 size-4" />}
      Buy again
    </Button>
  );
}

/** Cancel an unpaid order. The server refuses anything else, so this is only a convenience. */
export function CancelOrderButton({ orderNo }: { orderNo: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const confirm = useConfirm();
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="text-destructive hover:text-destructive"
      disabled={pending}
      onClick={async () => {
        if (!(await confirm({ title: `Cancel order ${orderNo}?`, description: "This can't be undone.", confirmLabel: "Cancel order", destructive: true }))) return;
        start(async () => {
          const res = await cancelOrderAction({ orderNo });
          if (!res.ok) return void toast.error(res.error);
          toast.success("Order cancelled");
          router.refresh();
        });
      }}
    >
      {pending ? <Loader2 className="mr-1 size-4 animate-spin" /> : <XCircle className="mr-1 size-4" />}
      Cancel order
    </Button>
  );
}
