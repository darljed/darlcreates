"use client";

/**
 * "Check your fee" box on the public Shipping rates page: pick a province, enter how heavy the order is, see the fee.
 * Uses the same pure quote as checkout (packaging is added by it), with the table passed in from the server.
 */
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPHP } from "@/lib/money";
import type { PsgcProvince } from "@/lib/psgc";
import { kg, quoteShipping, type ShippingConfig } from "@/lib/shipping";

export function ShippingChecker({ config, provinces }: { config: ShippingConfig; provinces: Pick<PsgcProvince, "code" | "name" | "group">[] }) {
  const [code, setCode] = useState("");
  const [weight, setWeight] = useState("0.5");

  const province = provinces.find((p) => p.code === code);
  const grams = Math.round(Number(weight) * 1000);
  const quote = province && Number.isFinite(grams) && grams > 0 ? quoteShipping(config, province, [{ qty: 1, weightGrams: grams }], 0) : null;

  return (
    <div className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="check-province">Where is it going?</Label>
          <select id="check-province" value={code} onChange={(e) => setCode(e.target.value)} className="h-9 w-64 max-w-full rounded-md border bg-background px-2 text-sm">
            <option value="">Choose a province</option>
            {provinces.map((p) => (
              <option key={p.code} value={p.code}>{p.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="check-kg">How heavy is your order (kg)</Label>
          <Input id="check-kg" type="number" min={0.05} step={0.1} value={weight} onChange={(e) => setWeight(e.target.value)} className="w-36" />
        </div>
      </div>
      <p className="mt-3 text-sm" aria-live="polite">
        {quote ? (
          <>
            Shipping is about <strong>{formatPHP(quote.baseCents)}</strong> to {province?.name} ({quote.zoneLabel}), for a parcel of {kg(quote.grams)} ({quote.tierLabel}).
          </>
        ) : (
          <span className="text-muted-foreground">Choose a province and enter the weight to see the fee.</span>
        )}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        We already add {kg(config.packagingGrams)} for the box and packing. If you are not sure how much your order weighs, checkout works it out for you.
        {config.freeOverCents > 0 && <> Orders of {formatPHP(config.freeOverCents)} or more ship free.</>}
      </p>
    </div>
  );
}
