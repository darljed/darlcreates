"use client";

/**
 * Admin form to fix a customer's name, email and private note.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "@/components/admin/editor-bits";
import { updateUserProfileAction } from "@/app/(admin)/admin/users/actions";

export function UserProfileForm({ userId, initial, locked }: { userId: string; initial: { name: string; email: string; adminNote: string }; locked: boolean }) {
  const router = useRouter();
  const [saved, setSaved] = useState(initial);
  const [d, setD] = useState(initial);
  const [pending, start] = useTransition();
  const dirty = d.name !== saved.name || d.email !== saved.email || d.adminNote !== saved.adminNote;

  function save() {
    start(async () => {
      const res = await updateUserProfileAction({ userId, ...d });
      if (res.ok) {
        toast.success("Saved");
        setSaved({ ...d, email: d.email.trim().toLowerCase() });
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (dirty && !pending) save();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name">
          <Input value={d.name} maxLength={120} disabled={locked} onChange={(e) => setD((p) => ({ ...p, name: e.target.value }))} />
        </Field>
        <Field label="Email" hint="Their Google sign-in doesn't change">
          <Input type="email" value={d.email} maxLength={200} disabled={locked} onChange={(e) => setD((p) => ({ ...p, email: e.target.value }))} />
        </Field>
      </div>
      <Field label="Private note" hint="Only admins see this">
        <Textarea rows={3} value={d.adminNote} maxLength={1000} disabled={locked} placeholder="e.g. Prefers J&T, repeat buyer, paid by bank transfer once" onChange={(e) => setD((p) => ({ ...p, adminNote: e.target.value }))} />
      </Field>
      {!locked && (
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs">
            {dirty ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
                <span className="size-2 rounded-full bg-amber-500" aria-hidden /> Unsaved changes
              </span>
            ) : (
              <span className="text-muted-foreground">Edits are recorded in the activity log.</span>
            )}
          </p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" disabled={!dirty || pending} onClick={() => setD(saved)}>
              <Undo2 className="mr-1 size-4" /> Discard
            </Button>
            <Button type="submit" size="sm" disabled={!dirty || pending}>
              {pending && <Loader2 className="mr-1 size-4 animate-spin" />} Save
            </Button>
          </div>
        </div>
      )}
    </form>
  );
}
