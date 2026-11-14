"use client";

/**
 * Checkout form: saved addresses or a new one, save-address option, inline validation, place order
 * (useActionState).
 */

import { useActionState, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { SavedAddress } from "@/lib/addresses";
import { placeOrderAction, type PlaceOrderState } from "@/app/(shop)/checkout/actions";

const EMPTY = { recipient: "", phone: "", line1: "", line2: "", barangay: "", city: "", province: "", postalCode: "" };
type Fields = typeof EMPTY;

export function CheckoutForm({ saved, defaultName }: { saved: SavedAddress[]; defaultName: string }) {
  const [state, action, pending] = useActionState<PlaceOrderState, FormData>(placeOrderAction, { error: null });
  const initial = saved.find((a) => a.isDefault) ?? saved[0];
  const [fields, setFields] = useState<Fields>(
    initial
      ? { recipient: initial.recipient, phone: initial.phone, line1: initial.line1, line2: initial.line2, barangay: initial.barangay, city: initial.city, province: initial.province, postalCode: initial.postalCode }
      : { ...EMPTY, recipient: defaultName },
  );
  const [chosen, setChosen] = useState<string>(initial?.id ?? "new");

  function choose(id: string) {
    setChosen(id);
    const a = saved.find((x) => x.id === id);
    setFields(a ? { recipient: a.recipient, phone: a.phone, line1: a.line1, line2: a.line2, barangay: a.barangay, city: a.city, province: a.province, postalCode: a.postalCode } : { ...EMPTY, recipient: defaultName });
  }
  const set = (k: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) => setFields((f) => ({ ...f, [k]: e.target.value }));

  return (
    <form action={action} className="space-y-4">
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
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="barangay" label="Barangay" value={fields.barangay} onChange={set("barangay")} />
        <Field name="city" label="City / Municipality" required value={fields.city} onChange={set("city")} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field name="province" label="Province" required value={fields.province} onChange={set("province")} />
        <Field name="postalCode" label="Postal code" value={fields.postalCode} onChange={set("postalCode")} />
      </div>

      {chosen === "new" && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="saveAddress" defaultChecked /> Save this address for next time
        </label>
      )}

      {state.error && (
        <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{state.error}</p>
      )}

      <Button type="submit" size="lg" disabled={pending} className="w-full bg-primary text-primary-foreground">
        {pending && <Loader2 className="mr-2 size-4 animate-spin" />}
        Place order
      </Button>
      <p className="text-xs text-muted-foreground">
        You&apos;ll get GCash payment instructions on the next screen. We print after your payment is verified.
      </p>
    </form>
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
