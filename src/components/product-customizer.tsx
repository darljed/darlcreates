"use client";

/**
 * Product page customizer: option pickers with live price (display only; the server recomputes), image upload, add
 * to cart. If the customer must sign in or accept the privacy policy first, their choices are kept and the add is
 * completed automatically when they return.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductGallery, type GalleryPhoto } from "@/components/product-gallery";
import { CustomerImageUpload } from "@/components/customer-image-upload";
import { formatPHP } from "@/lib/money";
import { computeUnitPrice, configSelectionSchema, type ConfigSelection, type ProductOptionInput } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import { addToCartAction } from "@/app/(shop)/cart/actions";

export function ProductCustomizer({
  productId,
  productName,
  basePriceCents,
  options,
  stlUrl,
  photos,
}: {
  productId: string;
  productName: string;
  basePriceCents: number;
  options: ProductOptionInput[];
  stlUrl: string | null;
  photos: GalleryPhoto[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending: sessionLoading } = useSession();
  const signedIn = Boolean(session?.user);
  const [selection, setSelection] = useState<ConfigSelection>({});
  const [pending, startTransition] = useTransition();
  const storeKey = `dc:selection:${productId}`;

  // Keep the customer's work across a sign-in or privacy-consent detour. sessionStorage only exists in the browser.
  // `add` means "they pressed Add to cart": the add is finished automatically when they come back. `tries` stops a
  // loop if consent somehow never sticks.
  const keepAndGo = useCallback(
    (sel: ConfigSelection, add: boolean, to: "/sign-in" | "/consent", tries = 0) => {
      try {
        sessionStorage.setItem(storeKey, JSON.stringify({ selection: sel, add, tries, at: Date.now() }));
      } catch {
        /* storage unavailable: they'll just re-pick */
      }
      router.push(`${to}?redirect=${encodeURIComponent(pathname)}`);
    },
    [storeKey, router, pathname],
  );

  const addNow = useCallback(
    (sel: ConfigSelection, tries = 0) => {
      startTransition(async () => {
        const res = await addToCartAction({ productId, selection: sel, qty: 1 });
        if (res.ok) {
          toast.success("Added to cart", { action: { label: "Go to cart", onClick: () => router.push("/cart") } });
          router.refresh();
        } else if ("needs" in res && tries < 2) {
          keepAndGo(sel, true, res.needs === "consent" ? "/consent" : "/sign-in", tries + 1);
        } else {
          toast.error(res.error ?? "Could not add to cart");
        }
      });
    },
    [productId, router, keepAndGo],
  );

  // Restore choices saved before a sign-in / consent redirect, and finish the add if that is what they were doing.
  // The saved copy is removed as soon as it's used, and ignored when old.
  useEffect(() => {
    if (sessionLoading) return;
    try {
      const raw = sessionStorage.getItem(storeKey);
      if (!raw) return;
      sessionStorage.removeItem(storeKey);
      const saved = JSON.parse(raw) as { selection?: unknown; add?: boolean; tries?: number; at?: number };
      const parsed = configSelectionSchema.safeParse(saved.selection);
      if (!parsed.success || !Object.keys(parsed.data).length) return;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelection(parsed.data);
      const fresh = typeof saved.at === "number" && Date.now() - saved.at < 30 * 60 * 1000;
      if (saved.add && fresh && signedIn) addNow(parsed.data, saved.tries ?? 0);
      else toast.info("We kept your choices. Add to cart when you're ready.");
    } catch {
      /* private mode or corrupt value: start fresh */
    }
  }, [storeKey, sessionLoading, signedIn, addNow]);

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
    return "#9ca3af";
  }, [options, selection]);

  function setValue(optId: string, patch: ConfigSelection[string]) {
    setSelection((s) => ({ ...s, [optId]: { ...s[optId], ...patch } }));
  }

  function onAddToCart() {
    if (!signedIn) {
      keepAndGo(selection, true, "/sign-in");
      return;
    }
    if (errors.length) {
      toast.error(errors[0]);
      return;
    }
    addNow(selection);
  }

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <ProductGallery
        productName={productName}
        modelUrl={stlUrl}
        color={activeColor}
        photos={photos}
      />

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
              <CustomerImageUpload
                signedIn={signedIn}
                value={selection[opt.id]?.imageKey}
                onChange={(key) => setValue(opt.id, { imageKey: key })}
                onNeedSignIn={() => keepAndGo(selection, false, "/sign-in")}
              />
            )}
          </div>
        ))}

        <div className="rounded-xl border-2 border-border bg-muted/40 p-4">
          <div className="flex items-baseline justify-between gap-3">
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
