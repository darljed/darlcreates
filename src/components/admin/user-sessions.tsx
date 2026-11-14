"use client";

/**
 * List of a customer's active sessions with a button to end each one.
 */

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import { endSessionAction } from "@/app/(admin)/admin/users/actions";

export type SessionView = { id: string; device: string; ip: string | null; createdAt: string; expiresAt: string };

const when = (iso: string) => new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });

/** Where the user is signed in. The session token is never sent to the browser. */
export function UserSessions({ userId, sessions, canEnd }: { userId: string; sessions: SessionView[]; canEnd: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (sessions.length === 0) return <p className="text-sm text-muted-foreground">Not signed in anywhere right now.</p>;
  return (
    <ul className="divide-y rounded-md border">
      {sessions.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 p-2.5 text-sm">
          <div className="flex min-w-0 items-center gap-2.5">
            <Monitor className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0">
              <p className="truncate font-medium">{s.device}</p>
              <p className="truncate text-xs text-muted-foreground">
                {s.ip ?? "Unknown IP"} · signed in {when(s.createdAt)}
              </p>
            </div>
          </div>
          {canEnd && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await endSessionAction({ userId, sessionId: s.id });
                  if (res.ok) {
                    toast.success("Signed out");
                    router.refresh();
                  } else toast.error(res.error);
                })
              }
            >
              Sign out
            </Button>
          )}
        </li>
      ))}
    </ul>
  );
}
