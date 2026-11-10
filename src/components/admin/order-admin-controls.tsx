"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  transitionOrderAction,
  saveShipmentAction,
} from "@/app/(admin)/admin/orders/actions";

const STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  paid: "Mark paid",
  in_production: "Start production",
  ready_to_ship: "Mark ready to ship",
  shipped: "Mark shipped",
  delivered: "Mark delivered",
  cancelled: "Cancel order",
  refunded: "Mark refunded",
};

export function OrderAdminControls({
  orderId,
  nextStatuses,
  shipment,
}: {
  orderId: string;
  nextStatuses: string[];
  shipment: { carrier: string; trackingNo: string; status: string } | null;
}) {
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [carrier, setCarrier] = useState(shipment?.carrier ?? "");
  const [trackingNo, setTrackingNo] = useState(shipment?.trackingNo ?? "");

  function transition(to: string) {
    startTransition(async () => {
      const res = await transitionOrderAction({ orderId, to });
      if (res.ok) {
        toast.success("Order updated");
        router.refresh();
      } else toast.error(res.error ?? "Failed");
    });
  }

  function saveShipment() {
    startTransition(async () => {
      const res = await saveShipmentAction({
        orderId,
        carrier,
        trackingNo,
        status: trackingNo ? "in_transit" : "",
      });
      if (res.ok) {
        toast.success("Shipping saved");
        router.refresh();
      } else toast.error(res.error ?? "Failed");
    });
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-bold">Update status</h2>
        {nextStatuses.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No further transitions.
          </p>
        ) : (
          <div className="space-y-2">
            {nextStatuses.map((s) => (
              <Button
                key={s}
                variant={s === "cancelled" || s === "refunded" ? "outline" : "default"}
                className={
                  s === "cancelled" || s === "refunded"
                    ? "w-full"
                    : "w-full bg-primary text-primary-foreground"
                }
                disabled={pending}
                onClick={() => transition(s)}
              >
                {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
                {STATUS_LABELS[s] ?? s}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 font-bold">Shipping</h2>
        <div className="space-y-2">
          <div className="space-y-1">
            <Label htmlFor={`${uid}-carrier`} className="text-xs">Carrier</Label>
            <Input
              id={`${uid}-carrier`}
              value={carrier}
              onChange={(e) => setCarrier(e.target.value)}
              placeholder="J&T, LBC…"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`${uid}-tracking`} className="text-xs">Tracking number</Label>
            <Input
              id={`${uid}-tracking`}
              value={trackingNo}
              onChange={(e) => setTrackingNo(e.target.value)}
            />
          </div>
          <Button
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={saveShipment}
          >
            Save shipping
          </Button>
        </div>
      </div>
    </div>
  );
}
