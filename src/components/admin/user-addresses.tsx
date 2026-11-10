"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Field } from "@/components/admin/editor-bits";
import { deleteUserAddressAction, updateUserAddressAction } from "@/app/(admin)/admin/users/actions";

export type AddressView = {
  id: string; label: string; recipient: string; phone: string; line1: string; line2: string;
  barangay: string; city: string; province: string; postalCode: string; isDefault: boolean;
};
type Fields = Omit<AddressView, "id" | "label" | "isDefault">;
const KEYS: { key: keyof Fields; label: string; wide?: boolean }[] = [
  { key: "recipient", label: "Recipient" },
  { key: "phone", label: "Mobile number" },
  { key: "line1", label: "Street / House no.", wide: true },
  { key: "line2", label: "Apt / Landmark", wide: true },
  { key: "barangay", label: "Barangay" },
  { key: "city", label: "City / Municipality" },
  { key: "province", label: "Province" },
  { key: "postalCode", label: "Postal code" },
];

export function UserAddresses({ userId, addresses, locked }: { userId: string; addresses: AddressView[]; locked: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<AddressView | null>(null);
  const [form, setForm] = useState<Fields | null>(null);
  const [removing, setRemoving] = useState<AddressView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (addresses.length === 0) return <p className="text-sm text-muted-foreground">No saved addresses.</p>;

  function open(a: AddressView) {
    setEditing(a);
    setForm({ recipient: a.recipient, phone: a.phone, line1: a.line1, line2: a.line2, barangay: a.barangay, city: a.city, province: a.province, postalCode: a.postalCode });
    setError(null);
  }

  return (
    <>
      <ul className="space-y-2">
        {addresses.map((a) => (
          <li key={a.id} className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm">
            <div className="min-w-0">
              <p className="font-semibold">
                {a.label}
                {a.isDefault && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-[10px] font-bold text-accent-foreground">Default</span>}
              </p>
              <p className="text-muted-foreground">
                {a.recipient} · {a.phone}
              </p>
              <p className="break-words text-muted-foreground">{[a.line1, a.line2, a.barangay, a.city, a.province, a.postalCode].filter(Boolean).join(", ")}</p>
            </div>
            {!locked && (
              <div className="flex shrink-0 gap-1.5">
                <Button size="icon" variant="outline" aria-label={`Edit ${a.label} address`} onClick={() => open(a)}>
                  <Pencil className="size-4" />
                </Button>
                <Button size="icon" variant="outline" aria-label={`Delete ${a.label} address`} onClick={() => setRemoving(a)}>
                  <Trash2 className="size-4 text-destructive" />
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <Dialog open={Boolean(editing)} onOpenChange={(o) => !o && !pending && setEditing(null)}>
        <DialogContent>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!editing || !form) return;
              start(async () => {
                const res = await updateUserAddressAction({ userId, addressId: editing.id, address: form });
                if (res.ok) {
                  toast.success("Address saved");
                  setEditing(null);
                  router.refresh();
                } else setError(res.error);
              });
            }}
          >
            <DialogHeader>
              <DialogTitle>Edit address</DialogTitle>
              <DialogDescription>Fix what we have on file. Past orders keep the address they were placed with.</DialogDescription>
            </DialogHeader>
            {form && (
              <div className="grid gap-3 sm:grid-cols-2">
                {KEYS.map(({ key, label, wide }) => (
                  <Field key={key} label={label} className={wide ? "sm:col-span-2" : undefined}>
                    <Input value={form[key]} onChange={(e) => setForm((p) => (p ? { ...p, [key]: e.target.value } : p))} />
                  </Field>
                ))}
              </div>
            )}
            {error && <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">{error}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending}>Save address</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(o) => !o && setRemoving(null)}
        title="Delete this address?"
        description="It's removed from their saved addresses. Past orders are not affected."
        confirmLabel="Delete address"
        destructive
        busy={pending}
        error={error}
        onConfirm={() =>
          removing &&
          start(async () => {
            const res = await deleteUserAddressAction({ userId, addressId: removing.id });
            if (res.ok) {
              toast.success("Address deleted");
              setRemoving(null);
              router.refresh();
            } else setError(res.error);
          })
        }
      />
    </>
  );
}
