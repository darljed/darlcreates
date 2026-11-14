"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, Copy, Loader2, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centavosToPesos, formatPHP } from "@/lib/money";
import { submitPaymentAction } from "@/app/(shop)/checkout/actions";

/** Copy to clipboard with feedback; falls back to a toast when the browser blocks clipboard access. */
function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      aria-label={`Copy ${label}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          toast.error("Couldn't copy. Select the text and copy it manually.");
        }
      }}
    >
      {done ? <Check className="mr-1 size-4" /> : <Copy className="mr-1 size-4" />}
      {done ? "Copied" : "Copy"}
    </Button>
  );
}

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

  const isPending = latestPayment?.status === "pending";
  const isRejected = latestPayment?.status === "rejected";

  function submit() {
    if (reference.trim().length < 4) {
      toast.error("Enter the GCash reference number");
      return;
    }
    startTransition(async () => {
      const res = await submitPaymentAction({ orderNo, reference });
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
    <div id="pay" className="scroll-mt-4 rounded-lg border-2 border-primary bg-primary/5 p-4">
      <div className="flex items-center gap-2">
        <Smartphone className="size-5 text-primary" />
        <h2 className="text-lg font-extrabold">Pay with GCash</h2>
      </div>

      <ol className="mt-3 space-y-3 text-sm">
        <li>
          1. Send exactly{" "}
          <span className="font-extrabold text-primary">{formatPHP(totalCents)}</span> via GCash to:
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <div className="flex items-center justify-between gap-2 rounded-md border bg-background p-2.5">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">GCash number · {gcashName}</p>
                <p className="font-mono font-semibold">{gcashNumber || "(set by admin)"}</p>
              </div>
              {gcashNumber && <CopyButton value={gcashNumber.replace(/\s+/g, "")} label="GCash number" />}
            </div>
            <div className="flex items-center justify-between gap-2 rounded-md border bg-background p-2.5">
              <div>
                <p className="text-xs text-muted-foreground">Amount</p>
                <p className="font-mono font-semibold">{formatPHP(totalCents)}</p>
              </div>
              <CopyButton value={centavosToPesos(totalCents).toFixed(2)} label="amount" />
            </div>
          </div>
        </li>
        <li>2. Copy the reference number from your GCash receipt.</li>
        <li>3. Paste it below and submit. We verify it, then start printing.</li>
      </ol>

      {isPending ? (
        <p className="mt-4 rounded-md bg-accent/40 p-3 text-sm font-medium">
          Reference <span className="font-mono">{latestPayment!.reference}</span>{" "}
          submitted. Awaiting verification — you&apos;ll be notified.
        </p>
      ) : (
        <div className="mt-4 space-y-2">
          {isRejected && (
            <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
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
