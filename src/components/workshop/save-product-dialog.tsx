"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { applyEstimateToProductAction, createProductFromEstimateAction } from "@/app/(admin)/admin/estimator/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { peso, selectClass, type ProductDraft } from "./estimator-helpers";

/**
 * "Save as product" for an estimate (the live one or a saved one). Two modes: create a new DRAFT shop product (the owner adds
 * photos and publishes it on its page), or put the costing on an existing product (its price is left alone). A product is ONE
 * piece, so in batch mode the cost and the filament shown here are the per-piece share.
 */
export function SaveProductDialog({ draft, products, onClose }: { draft: ProductDraft; products: { id: string; name: string }[]; onClose: () => void }) {
  const uid = useId();
  const router = useRouter();
  const [mode, setMode] = useState<"create" | "apply">("create");
  const [name, setName] = useState(draft.defaultName);
  const [productId, setProductId] = useState("");
  const [busy, setBusy] = useState(false);

  const payload = { unitCostPesos: draft.unitCost, components: draft.components.map((c) => ({ partId: c.partId, qty: c.qty, unitPricePesos: c.unitPricePesos })) };

  const create = async () => {
    const trimmed = name.trim();
    if (!trimmed) return void toast.error("Product name is required");
    setBusy(true);
    const res = await createProductFromEstimateAction({ ...payload, name: trimmed, pricePesos: draft.unitPrice });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(`Draft product “${trimmed}” created`, {
      description: "Add photos and publish it on its page.",
      action: { label: "Open product", onClick: () => router.push(`/admin/products/${res.id}`) },
    });
    onClose();
  };

  const apply = async () => {
    if (!productId) return void toast.error("Choose a product");
    setBusy(true);
    const res = await applyEstimateToProductAction({ ...payload, productId });
    setBusy(false);
    if (!res.ok) return void toast.error(res.error);
    const target = products.find((p) => p.id === productId);
    toast.success(`Costing added to “${target?.name ?? "the product"}”`, { action: { label: "Open product", onClick: () => router.push(`/admin/products/${productId}`) } });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Save as product</DialogTitle>
          <DialogDescription>Parts from inventory become the product&apos;s bill of materials. The rest of the cost becomes its print cost.</DialogDescription>
        </DialogHeader>

        <dl className="space-y-1 rounded-md border p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Bill of materials</dt>
            <dd>
              {draft.bomCount} part{draft.bomCount === 1 ? "" : "s"}
            </dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Unit cost{draft.batch ? " (per piece)" : ""}</dt>
            <dd className="font-mono tabular-nums">{peso(draft.unitCost)}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-muted-foreground">Price / piece ({draft.tierLabel})</dt>
            <dd className="font-mono tabular-nums">{peso(draft.unitPrice)}</dd>
          </div>
          {draft.batch && (
            <p className="pt-1 text-xs text-muted-foreground">
              Batch of {draft.quantity}: a product is one piece, so the cost and price are per piece and the filament in its bill of materials is {draft.perPieceGrams.toFixed(1)} g.
            </p>
          )}
        </dl>

        <Tabs value={mode} onValueChange={(v) => setMode(v === "apply" ? "apply" : "create")}>
          <TabsList className="w-full">
            <TabsTrigger value="create">Create a new product</TabsTrigger>
            <TabsTrigger value="apply">Add to an existing product</TabsTrigger>
          </TabsList>
          <TabsContent value="create" className="mt-3 grid gap-1.5">
            <Label htmlFor={`${uid}-name`}>Product name</Label>
            <Input id={`${uid}-name`} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Custom keycap keychain" />
            <p className="text-xs text-muted-foreground">Created as a draft at the {draft.tierLabel} price. Nothing is shown in the shop until you publish it.</p>
          </TabsContent>
          <TabsContent value="apply" className="mt-3 grid gap-1.5">
            <Label htmlFor={`${uid}-product`}>Product</Label>
            <select id={`${uid}-product`} className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)} disabled={products.length === 0}>
              <option value="">{products.length === 0 ? "No products yet" : "Choose a product…"}</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">Replaces the product&apos;s cost and bill of materials with this estimate&apos;s. Its price is left alone.</p>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          {mode === "create" ? (
            <Button onClick={create} disabled={busy}>
              {busy ? "Creating…" : "Create product"}
            </Button>
          ) : (
            <Button onClick={apply} disabled={busy || !productId}>
              {busy ? "Saving…" : "Add costing"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
