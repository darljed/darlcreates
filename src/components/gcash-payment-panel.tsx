"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPHP } from "@/lib/money";
import { submitPaymentAction } from "@/app/(shop)/checkout/actions";

export function GcashPaymentPanel({
  orderNo,
  totalCents,
  gcashName,
  gcashNumber,
  latestPayment,
}: {
  orderNo: string;
  totalCents: number;
  gcashName: string;
  gcashNumber: string;
  latestPayment: {
    reference: string;
    status: string;
    rejectReason: string | null;
  } | null;
}) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [pending, startTransition] = useTransition();

  const amount = (totalCents / 100).toFixed(2);
  const isPending = latestPayment?.status === "pending";
  const isRejected = latestPayment?.status === "rejected";

  function submit() {
    if (reference.trim().length < 4) {
      toast.error("Enter the GCash reference number");
      return;
    }
    startTransition(async () => {
      const res = await submitPaymentAction({ orderNo, reference, amount });
      if (res.ok) {
        toast.success("Reference submitted — we'll verify it shortly");
        setReference("");
        router.refresh();
      } else {
        toast.error(res.error ?? "Submission failed");
      }
    });
  }

  return (
    <div className="rounded-xl border-2 border-primary bg-primary/5 p-5">
      <div className="flex items-center gap-2">
        <Smartphone className="size-5 text-primary" />
        <h2 className="text-lg font-extrabold">Pay with GCash</h2>
      </div>

      <ol className="mt-3 space-y-1 text-sm">
        <li>
          1. Send exactly{" "}
          <span className="font-extrabold text-primary">
            {formatPHP(totalCents)}
          </span>{" "}
          via GCash to:
        </li>
        <li className="ml-4 rounded-lg bg-background p-3 font-mono">
          {gcashName}
          <br />
          {gcashNumber || "(GCash number set by admin)"}
        </li>
        <li>2. Copy the GCash reference number from your receipt.</li>
        <li>3. Paste it below and submit. We verify, then start printing.</li>
      </ol>

      {isPending ? (
        <p className="mt-4 rounded-lg bg-accent/40 p-3 text-sm font-medium">
          Reference <span className="font-mono">{latestPayment!.reference}</span>{" "}
          submitted. Awaiting verification — you&apos;ll be notified.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {isRejected && (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              Previous reference was rejected
              {latestPayment?.rejectReason
                ? `: ${latestPayment.rejectReason}`
                : ""}
              . Please re-check and submit again.
            </p>
          )}
          <Label htmlFor="ref">GCash reference number</Label>
          <div className="flex gap-2">
            <Input
              id="ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="e.g. 1234567890123"
              className="bg-background"
            />
            <Button
              onClick={submit}
              disabled={pending}
              className="bg-primary text-primary-foreground"
            >
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
              Submit
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
