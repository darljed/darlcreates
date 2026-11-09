"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  verifyPaymentAction,
  rejectPaymentAction,
} from "@/app/(admin)/admin/orders/actions";

export function PaymentActions({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  function verify() {
    startTransition(async () => {
      const res = await verifyPaymentAction({ paymentId });
      if (res.ok) {
        toast.success("Payment verified — order marked paid");
        router.refresh();
      } else toast.error(res.error ?? "Failed");
    });
  }

  function reject() {
    if (reason.trim().length < 2) {
      toast.error("Enter a reason");
      return;
    }
    startTransition(async () => {
      const res = await rejectPaymentAction({ paymentId, reason });
      if (res.ok) {
        toast.success("Payment rejected");
        router.refresh();
      } else toast.error(res.error ?? "Failed");
    });
  }

  if (rejecting) {
    return (
      <div className="flex items-center gap-2">
        <Input
          autoFocus
          placeholder="Reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="h-9 w-48"
        />
        <Button size="sm" variant="destructive" disabled={pending} onClick={reject}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Confirm"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <Button
        size="sm"
        className="bg-green-600 text-white hover:bg-green-700"
        disabled={pending}
        onClick={verify}
      >
        <Check className="mr-1 size-4" /> Verify
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => setRejecting(true)}
      >
        <X className="mr-1 size-4" /> Reject
      </Button>
    </div>
  );
}
