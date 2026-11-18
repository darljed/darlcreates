"use client";

/**
 * Delete a product (behind a confirm step). The server refuses a service and a product that was ordered, and the
 * message is shown in the dialog. `redirectTo` leaves a page that no longer exists (the edit page).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { deleteProductAction } from "@/app/(admin)/admin/products/actions";

export function DeleteProductButton({ productId, name, redirectTo, iconOnly = false }: { productId: string; name: string; redirectTo?: string; iconOnly?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const confirm = () =>
    start(async () => {
      const res = await deleteProductAction({ productId });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      toast.success("Product deleted");
      setOpen(false);
      if (redirectTo) router.push(redirectTo);
      else router.refresh();
    });

  return (
    <>
      <Button type="button" variant="outline" size={iconOnly ? "icon" : "sm"} className="text-destructive" aria-label={`Delete ${name}`} onClick={() => { setError(null); setOpen(true); }}>
        <Trash2 className="size-4" />
        {!iconOnly && <span className="ml-1">Delete product</span>}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Delete ${name}?`}
        description="Its photos, 3D model, customization options and reviews are removed for good, and it leaves customers' carts. A product that has been ordered cannot be deleted: archive it instead."
        confirmLabel="Delete product"
        destructive
        busy={pending}
        error={error}
        onConfirm={confirm}
      />
    </>
  );
}
