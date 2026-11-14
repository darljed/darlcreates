"use client";

/**
 * Account controls on the admin user page: block / unblock, sign out everywhere, ask for consent again, delete.
 * Each risky action uses a confirm dialog.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, FileCheck2, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { Field } from "@/components/admin/editor-bits";
import {
  blockUserAction,
  deleteUserAccountAction,
  endAllSessionsAction,
  requireReconsentAction,
  unblockUserAction,
} from "@/app/(admin)/admin/users/actions";

type Dialog = null | "block" | "signout" | "consent" | "delete";

/** The account-level actions. Anything hard to undo goes through a confirm dialog. */
export function UserControls({
  userId,
  name,
  blocked,
  deleted,
  protectedAccount,
  isSelf,
}: {
  userId: string;
  name: string;
  blocked: boolean;
  deleted: boolean;
  /** Admin accounts can't be blocked or deleted from here. */
  protectedAccount: boolean;
  isSelf: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<Dialog>(null);
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function close() {
    setOpen(null);
    setReason("");
    setTyped("");
    setError(null);
  }

  function run(fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>) {
    setError(null);
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(res.message ?? "Done");
        close();
        router.refresh();
      } else setError(res.error);
    });
  }

  if (deleted) return <p className="text-sm text-muted-foreground">This account was deleted. Its personal data is gone and nothing can be changed.</p>;

  const row = "flex items-start justify-between gap-3 rounded-md border p-3";
  return (
    <div className="space-y-2">
      {blocked ? (
        <div className={row}>
          <div className="text-sm">
            <p className="font-semibold">Unblock</p>
            <p className="text-xs text-muted-foreground">Lets them sign in with Google again.</p>
          </div>
          <Button size="sm" disabled={pending} onClick={() => run(() => unblockUserAction({ userId }))}>
            <ShieldCheck className="mr-1 size-4" /> Unblock
          </Button>
        </div>
      ) : (
        <div className={row}>
          <div className="text-sm">
            <p className="font-semibold">Block account</p>
            <p className="text-xs text-muted-foreground">Ends all their sessions and stops them signing in. They aren&apos;t told why.</p>
          </div>
          <Button size="sm" variant="outline" disabled={protectedAccount || isSelf} title={protectedAccount ? "Admin accounts can't be blocked here" : undefined} onClick={() => setOpen("block")}>
            <Ban className="mr-1 size-4" /> Block
          </Button>
        </div>
      )}

      <div className={row}>
        <div className="text-sm">
          <p className="font-semibold">Sign out everywhere</p>
          <p className="text-xs text-muted-foreground">
            Signing in is by Google, so there&apos;s no password to reset. This ends every session and they sign in with Google again.
          </p>
        </div>
        <Button size="sm" variant="outline" disabled={isSelf} title={isSelf ? "Use your own Sign out menu" : undefined} onClick={() => setOpen("signout")}>
          <LogOut className="mr-1 size-4" /> Sign out
        </Button>
      </div>

      <div className={row}>
        <div className="text-sm">
          <p className="font-semibold">Ask them to accept the privacy policy again</p>
          <p className="text-xs text-muted-foreground">They&apos;ll see the consent screen on their next visit.</p>
        </div>
        <Button size="sm" variant="outline" disabled={protectedAccount} onClick={() => setOpen("consent")}>
          <FileCheck2 className="mr-1 size-4" /> Ask
        </Button>
      </div>

      <div className={`${row} border-destructive/40 bg-destructive/5`}>
        <div className="text-sm">
          <p className="font-semibold text-destructive">Delete account</p>
          <p className="text-xs text-muted-foreground">Removes their personal data. Order and payment records stay, with no name attached. Refused while an order is in progress.</p>
        </div>
        <Button size="sm" variant="destructive" disabled={protectedAccount || isSelf} title={protectedAccount ? "Admin accounts can't be deleted here" : undefined} onClick={() => setOpen("delete")}>
          <Trash2 className="mr-1 size-4" /> Delete
        </Button>
      </div>

      <ConfirmDialog
        open={open === "block"}
        onOpenChange={(o) => !o && close()}
        title={`Block ${name}?`}
        description="They are signed out of every device immediately and can't sign in until you unblock them. The reason is private to admins."
        confirmLabel="Block account"
        destructive
        busy={pending}
        canConfirm={reason.trim().length >= 3}
        error={error}
        onConfirm={() => run(() => blockUserAction({ userId, reason }))}
      >
        <Field label="Reason (private)">
          <Input value={reason} maxLength={300} autoFocus placeholder="e.g. Repeated chargebacks" onChange={(e) => setReason(e.target.value)} />
        </Field>
      </ConfirmDialog>

      <ConfirmDialog
        open={open === "signout"}
        onOpenChange={(o) => !o && close()}
        title={`Sign ${name} out everywhere?`}
        description="Every device they're signed in on is logged out. They can sign in again with Google right away."
        confirmLabel="Sign out everywhere"
        busy={pending}
        error={error}
        onConfirm={() => run(() => endAllSessionsAction({ userId }))}
      />

      <ConfirmDialog
        open={open === "consent"}
        onOpenChange={(o) => !o && close()}
        title="Ask for consent again?"
        description={`${name} will be sent to the privacy consent screen on their next visit and must accept it to keep ordering.`}
        confirmLabel="Ask again"
        busy={pending}
        error={error}
        onConfirm={() => run(() => requireReconsentAction({ userId }))}
      />

      <ConfirmDialog
        open={open === "delete"}
        onOpenChange={(o) => !o && close()}
        title={`Delete ${name}'s account?`}
        description="This can't be undone. Their name, email, addresses, reviews and uploaded images are removed. Order and payment records are kept without any personal details."
        confirmLabel="Delete account"
        destructive
        busy={pending}
        canConfirm={typed === "DELETE"}
        error={error}
        onConfirm={() => run(() => deleteUserAccountAction({ userId, confirm: typed }))}
      >
        <Field label="Type DELETE to confirm">
          <Input value={typed} autoFocus autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
        </Field>
      </ConfirmDialog>
    </div>
  );
}
