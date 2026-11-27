"use client";

/**
 * `useConfirm()`: an awaitable confirmation dialog, used instead of `window.confirm` everywhere (it looks like the app,
 * is keyboard and screen-reader friendly, and can say what happens). Mounted once in the root layout.
 *
 *   const confirm = useConfirm();
 *   if (!(await confirm({ title: "Delete this photo?", confirmLabel: "Delete", destructive: true }))) return;
 */
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";

export type ConfirmOptions = { title: string; description?: React.ReactNode; confirmLabel?: string; destructive?: boolean };
type Ask = (o: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<Ask | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const settle = useRef<((ok: boolean) => void) | null>(null);
  const ask = useCallback<Ask>((o) => {
    settle.current?.(false); // a second question cancels the first
    setOpts(o);
    return new Promise<boolean>((resolve) => { settle.current = resolve; });
  }, []);
  const close = (ok: boolean) => {
    settle.current?.(ok);
    settle.current = null;
    setOpts(null);
  };
  return (
    <Ctx.Provider value={ask}>
      {children}
      <ConfirmDialog
        open={opts !== null}
        onOpenChange={(o) => { if (!o) close(false); }}
        title={opts?.title ?? ""}
        description={opts?.description ?? ""}
        confirmLabel={opts?.confirmLabel ?? "Confirm"}
        destructive={opts?.destructive}
        onConfirm={() => close(true)}
      />
    </Ctx.Provider>
  );
}

/** The confirmation dialog. Outside the provider it falls back to the browser's confirm, so nothing breaks. */
export function useConfirm(): Ask {
  const ask = useContext(Ctx);
  return ask ?? (async (o) => window.confirm(o.title));
}
