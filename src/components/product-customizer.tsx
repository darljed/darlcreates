"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StlViewer } from "@/components/three/stl-viewer-lazy";
import { formatPHP } from "@/lib/money";
import { computeUnitPrice, type ConfigSelection, type ProductOptionInput } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import { addToCartAction } from "@/app/(shop)/cart/actions";

export function ProductCustomizer({
  productId,
  basePriceCents,
  options,
  stlUrl,
  photoUrls,
}: {
  productId: string;
  basePriceCents: number;
  options: ProductOptionInput[];
  stlUrl: string | null;
  photoUrls: string[];
}) {
  const router = useRouter();
  const { data: session } = useSession();
  const signedIn = Boolean(session?.user);
  const [selection, setSelection] = useState<ConfigSelection>({});
  const [pending, startTransition] = useTransition();

  // Live, client-side preview of the authoritative price (server re-checks).
  const { unitPriceCents, errors } = useMemo(
    () => computeUnitPrice(basePriceCents, options, selection),
    [basePriceCents, options, selection],
  );

  // The currently selected color (if any) drives the 3D model material.
  const activeColor = useMemo(() => {
    for (const opt of options) {
      if (opt.type === "color") {
        const sel = selection[opt.id];
        const val = opt.values.find((v) => v.id === sel?.valueId);
        if (val) return val.value;
      }
    }
    return "#ff2d78";
  }, [options, selection]);

  function setValue(optId: string, patch: ConfigSelection[string]) {
    setSelection((s) => ({ ...s, [optId]: { ...s[optId], ...patch } }));
  }

  function onAddToCart() {
    if (!signedIn) {
      router.push("/sign-in?redirect=/products");
      return;
    }
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    startTransition(async () => {
      const res = await addToCartAction({ productId, selection, qty: 1 });
      if (res.ok) {
        toast.success("Added to cart");
        router.refresh();
      } else {
        toast.error(res.error ?? "Could not add to cart");
      }
    });
  }

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* Visual: 3D viewer + photo thumbnails */}
      <div>
        <div className="aspect-square overflow-hidden rounded-xl border-2 border-border bg-card">
          <StlViewer url={stlUrl} color={activeColor} className="size-full" />
        </div>
        {photoUrls.length > 0 && (
          <div className="mt-3 flex gap-2">
            {photoUrls.slice(0, 4).map((u, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={i}
                src={u}
                alt={`Product photo ${i + 1}`}
                className="size-16 rounded-lg border object-cover"
              />
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Drag to rotate · scroll to zoom. The 3D model is the actual
          print-ready shape.
        </p>
      </div>

      {/* Customizer form */}
      <div className="space-y-6">
        {options.map((opt) => (
          <div key={opt.id} className="space-y-2">
            <Label className="text-base font-bold">
              {opt.label}
              {opt.required && <span className="ml-1 text-primary">*</span>}
              {opt.priceDeltaCents > 0 && (
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  +{formatPHP(opt.priceDeltaCents)}
                </span>
              )}
            </Label>

            {(opt.type === "color" || opt.type === "size") && (
              <div className="flex flex-wrap gap-2">
                {opt.values.map((v) => {
                  const selected = selection[opt.id]?.valueId === v.id;
                  if (opt.type === "color") {
                    return (
                      <button
                        key={v.id}
                        type="button"
                        aria-label={v.label}
                        aria-pressed={selected}
                        onClick={() => setValue(opt.id, { valueId: v.id })}
                        className={cn(
                          "size-10 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          selected ? "border-foreground ring-2 ring-ring" : "border-border",
                        )}
                        style={{ backgroundColor: v.value }}
                        title={v.label}
                      />
                    );
                  }
                  return (
                    <button
                      key={v.id}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => setValue(opt.id, { valueId: v.id })}
                      className={cn(
                        "rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background hover:border-primary",
                      )}
                    >
                      {v.label}
                      {v.priceDeltaCents > 0 && (
                        <span className="ml-1 text-xs opacity-80">
                          +{formatPHP(v.priceDeltaCents)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

            {opt.type === "text" && (
              <Input
                maxLength={opt.constraints.maxLen ?? 50}
                placeholder={`Up to ${opt.constraints.maxLen ?? 50} characters`}
                value={selection[opt.id]?.text ?? ""}
                onChange={(e) => setValue(opt.id, { text: e.target.value })}
              />
            )}

            {opt.type === "image" && (
              <p className="rounded-lg border border-dashed p-3 text-sm text-muted-foreground">
                Image upload is available at checkout once storage is enabled.
              </p>
            )}
          </div>
        ))}

        <div className="rounded-xl border-2 border-border bg-muted/40 p-4">
          <div className="flex items-end justify-between">
            <span className="text-sm text-muted-foreground">Your price</span>
            <span className="text-3xl font-extrabold text-primary">
              {formatPHP(unitPriceCents)}
            </span>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0"
          disabled={pending || errors.length > 0}
          onClick={onAddToCart}
        >
          {pending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <ShoppingBag className="mr-2 size-4" />
          )}
          Add to cart
        </Button>
        {errors.length > 0 && (
          <p className="text-center text-sm text-muted-foreground">
            {errors[0]}
          </p>
        )}
      </div>
    </div>
  );
}
