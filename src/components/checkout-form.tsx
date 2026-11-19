"use client";

/**
 * Checkout form: saved addresses or a new one, province / city / barangay pickers, save-address option, inline validation, place
 * order (useActionState). The order summary lives in the same client tree so the shipping fee follows the chosen province live.
 * The server recomputes the fee from the rate table, so the number shown here is what is charged.
 */

import { useActionState, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EMPTY_LOCATION, LocationPicker, type LocationValue } from "@/components/location-picker";
import type { SavedAddress } from "@/lib/addresses";
import type { PsgcProvince } from "@/lib/psgc";
import { formatPHP } from "@/lib/money";
import { kg, quoteShipping, type ShippingConfig, type ShippingItem } from "@/lib/shipping";
import { placeOrderAction, type PlaceOrderState } from "@/app/(shop)/checkout/actions";

/** A saved address plus the location the page worked out for it (its own codes, or a single exact guess for older ones). */
export type CheckoutAddress = SavedAddress & { location: LocationValue; guessed: boolean };
export type SummaryLine = { id: string; productName: string; qty: number; lineTotalCents: number };

const EMPTY = { recipient: "", phone: "", line1: "", line2: "", postalCode: "" };
type Fields = typeof EMPTY;

const fieldsOf = (a: SavedAddress): Fields => ({ recipient: a.recipient, phone: a.phone, line1: a.line1, line2: a.line2, postalCode: a.postalCode });

export function CheckoutForm({ saved, defaultName, lines, subtotalCents, shippingConfig, shippingItems }: {
  saved: CheckoutAddress[];
  defaultName: string;
  lines: SummaryLine[];
  subtotalCents: number;
  shippingConfig: ShippingConfig;
  shippingItems: ShippingItem[];
}) {
  const [state, action, pending] = useActionState<PlaceOrderState, FormData>(placeOrderAction, { error: null });
  const initial = saved.find((a) => a.isDefault) ?? saved[0];
  const [fields, setFields] = useState<Fields>(initial ? fieldsOf(initial) : { ...EMPTY, recipient: defaultName });
  const [location, setLocation] = useState<LocationValue>(initial?.location ?? EMPTY_LOCATION);
  const [needsPick, setNeedsPick] = useState<boolean>(initial ? !initial.location.barangayCode : false);
  const [province, setProvince] = useState<PsgcProvince | null>(null);
  const [chosen, setChosen] = useState<string>(initial?.id ?? "new");

  function choose(id: string) {
    setChosen(id);
    const a = saved.find((x) => x.id === id);
    setFields(a ? fieldsOf(a) : { ...EMPTY, recipient: defaultName });
    setLocation(a?.location ?? EMPTY_LOCATION);
    setNeedsPick(a ? !a.location.barangayCode : false);
  }
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  const complete = Boolean(location.provinceCode && location.cityCode && location.barangayCode);
  const quote = province && location.provinceCode === province.code ? quoteShipping(shippingConfig, province, shippingItems, subtotalCents) : null;
  const total = subtotalCents + (quote?.feeCents ?? 0);

  return (
    <form action={action} className="grid gap-8 md:grid-cols-[1fr_320px]">
      <div className="space-y-4">
        <h2 className="text-xl font-bold">Shipping address</h2>

        {saved.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold">Saved addresses</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {saved.map((a) => (
                <label key={a.id} className={`cursor-pointer rounded-lg border-2 p-3 text-sm ${chosen === a.id ? "border-primary bg-primary/5" : "border-border"}`}>
                  <input type="radio" name="_saved" className="sr-only" checked={chosen === a.id} onChange={() => choose(a.id)} />
                  <span className="font-bold">{a.label}{a.isDefault ? " · default" : ""}</span>
                  <span className="block text-muted-foreground">{a.recipient}, {a.line1}, {a.city}</span>
                </label>
              ))}
              <label className={`cursor-pointer rounded-lg border-2 p-3 text-sm ${chosen === "new" ? "border-primary bg-primary/5" : "border-border"}`}>
                <input type="radio" name="_saved" className="sr-only" checked={chosen === "new"} onChange={() => choose("new")} />
                <span className="font-bold">Use a new address</span>
              </label>
            </div>
          </fieldset>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field name="recipient" label="Full name" required value={fields.recipient} onChange={set("recipient")} />
          <Field name="phone" label="Mobile number" required placeholder="0917…" value={fields.phone} onChange={set("phone")} />
        </div>
        <Field name="line1" label="Street / House no." required value={fields.line1} onChange={set("line1")} />
        <Field name="line2" label="Apt / Landmark (optional)" value={fields.line2} onChange={set("line2")} />

        <LocationPicker
          idPrefix="checkout"
          value={location}
          onChange={(v) => {
            setLocation(v);
            setNeedsPick(false);
          }}
          onProvince={setProvince}
        />
        {needsPick && !complete && (
          <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
            Please pick your location from the lists so we can work out the exact shipping fee.
          </p>
        )}

        <Field name="postalCode" label="Postal code (optional)" value={fields.postalCode} onChange={set("postalCode")} />

        {chosen === "new" && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="saveAddress" defaultChecked /> Save this address for next time
          </label>
        )}

        {state.error && (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>
        )}

        <Button type="submit" size="lg" disabled={pending || !complete} className="w-full bg-primary text-primary-foreground">
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
          Place order
        </Button>
        {!complete && <p className="text-xs text-muted-foreground">Choose your province, city and barangay to place the order.</p>}
        <p className="text-xs text-muted-foreground">
          You&apos;ll get GCash payment instructions on the next screen. We print after your payment is verified.
        </p>
      </div>

      <aside className="h-fit rounded-xl border-2 border-border bg-muted/40 p-5">
        <h2 className="mb-3 font-bold">Order summary</h2>
        <ul className="space-y-2 text-sm">
          {lines.map((l) => (
            <li key={l.id} className="flex justify-between gap-2">
              <span className="text-muted-foreground">{l.qty}× {l.productName}</span>
              <span className="font-medium">{formatPHP(l.lineTotalCents)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-3 space-y-1 border-t pt-3 text-sm">
          <Row label="Subtotal" value={formatPHP(subtotalCents)} />
          {quote ? (
            <div aria-live="polite">
              <Row label="Shipping" value={quote.free ? "Free" : formatPHP(quote.feeCents)} />
              <p className="text-xs text-muted-foreground">
                {quote.free ? "Free shipping · " : ""}{quote.zoneLabel} · {kg(quote.grams)} · {quote.tierLabel}
              </p>
            </div>
          ) : (
            <p className="text-muted-foreground" aria-live="polite">Shipping: choose your location to see the fee</p>
          )}
          <Link href="/shipping" className="block text-xs text-primary underline underline-offset-2">See all shipping rates</Link>
        </div>
        <div className="mt-3 flex justify-between border-t pt-3 text-lg font-extrabold">
          <span>Total</span>
          <span className="text-primary">{formatPHP(total)}</span>
        </div>
        {!quote && <p className="mt-1 text-xs text-muted-foreground">Subtotal only. Shipping is added once you choose your location.</p>}
      </aside>
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function Field({ name, label, required, placeholder, value, onChange }: {
  name: string; label: string; required?: boolean; placeholder?: string; value: string; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label} {required && <span className="text-primary">*</span>}</Label>
      <Input id={name} name={name} required={required} placeholder={placeholder} value={value} onChange={onChange} />
    </div>
  );
}
