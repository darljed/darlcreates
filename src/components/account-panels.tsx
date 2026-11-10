"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SavedAddress } from "@/lib/addresses";
import { deleteAccountAction, deleteAddressAction, setDefaultAddressAction } from "@/app/(shop)/account/actions";

export function AddressBook({ addresses }: { addresses: SavedAddress[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (addresses.length === 0) {
    return <p className="text-sm text-muted-foreground">No saved addresses yet. Tick &ldquo;Save this address&rdquo; at checkout.</p>;
  }
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { toast.success(okMsg); router.refresh(); } else toast.error(r.error ?? "Failed");
    });
  return (
    <ul className="space-y-3">
      {addresses.map((a) => (
        <li key={a.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border-2 border-border p-4">
          <div className="text-sm">
            <p className="font-bold">{a.label}{a.isDefault && <span className="ml-2 rounded-full bg-accent px-2 py-0.5 text-xs text-accent-foreground">Default</span>}</p>
            <p className="text-muted-foreground">{a.recipient} · {a.phone}</p>
            <p className="text-muted-foreground">{[a.line1, a.line2, a.barangay, a.city, a.province, a.postalCode].filter(Boolean).join(", ")}</p>
          </div>
          <div className="flex gap-2">
            {!a.isDefault && (
              <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => setDefaultAddressAction({ id: a.id }), "Default address updated")}>
                <Star className="mr-1 size-4" /> Make default
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={pending} onClick={() => run(() => deleteAddressAction({ id: a.id }), "Address removed")} aria-label={`Delete ${a.label}`}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DeleteAccount() {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [pending, start] = useTransition();
  function submit() {
    start(async () => {
      const r = await deleteAccountAction({ confirm });
      if (r && !r.ok) toast.error(r.error); // on success the action redirects
    });
  }
  if (!open) {
    return <Button variant="outline" className="border-destructive text-destructive" onClick={() => setOpen(true)}>Delete my account…</Button>;
  }
  return (
    <div className="space-y-3 rounded-xl border-2 border-destructive/50 bg-destructive/5 p-4">
      <p className="text-sm">
        This removes your name, email, saved addresses, reviews and uploaded images, and signs you out everywhere.
        Past orders and payments are kept for our records but no longer linked to your personal details.
        <strong> This can&apos;t be undone.</strong>
      </p>
      <label className="block text-sm font-semibold" htmlFor="confirm-delete">Type DELETE to confirm</label>
      <Input id="confirm-delete" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
      <div className="flex gap-2">
        <Button variant="destructive" disabled={pending || confirm !== "DELETE"} onClick={submit}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />} Permanently delete
        </Button>
        <Button variant="ghost" onClick={() => { setOpen(false); setConfirm(""); }}>Cancel</Button>
      </div>
    </div>
  );
}
