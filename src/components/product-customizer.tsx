"use client";

/**
 * Product page customizer: option pickers with live price (display only; the server recomputes), image upload, add
 * to cart. If the customer must sign in or accept the privacy policy first, their choices are kept and the add is
 * completed automatically when they return.
 *
 * A product with a name on the model is a LIST of names: each name has its own text, font, name colour, part colours and
 * quantity, and all of them are added to the cart together (a bulk order). Options that are not per name (size, image,
 * other text) are shared by every name. Any other product is the same screen with just one "row" and no list.
 */

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductGallery, type GalleryPhoto } from "@/components/product-gallery";
import { CustomerImageUpload } from "@/components/customer-image-upload";
import { formatPHP } from "@/lib/money";
import { computeUnitPrice, configSelectionSchema, type ConfigSelection, type ProductOptionInput } from "@/lib/pricing";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import { fontChoices, NAME_FONTS, slotOf, withFont, withNameColor } from "@/lib/name-mesh";
import { defaultPartSelection, partColorsFor, wholeModelColor } from "@/lib/part-colors";
import { useNameBuild } from "@/components/use-name-build";
import { addManyToCartAction, addToCartAction } from "@/app/(shop)/cart/actions";

/** Most names in one order (the server enforces the same limit: MAX_NAMES_PER_ADD in cart-service.ts). */
const MAX_NAMES = 20;
/** How an engraved name looks in the preview: a dark cut. */
const ENGRAVED_PREVIEW = "#1f2937";

type Row = { key: string; selection: ConfigSelection; qty: number };

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
  const [pending, startTransition] = useTransition();
  const storeKey = `dc:selection:${productId}`;

  // A text option with a name slot makes this a list-of-names product.
  const nameOpt = useMemo(() => options.find((o) => o.type === "text" && slotOf(o.constraints)) ?? null, [options]);
  const nameSlot = useMemo(() => (nameOpt ? slotOf(nameOpt.constraints) : null), [nameOpt]);
  const nameFonts = useMemo(() => (nameSlot ? fontChoices(nameSlot) : []), [nameSlot]);
  const engraved = nameSlot?.mode === "engraved";
  // what belongs to ONE name: the name itself and every colour option; everything else is shared by all names
  const perName = useMemo(() => new Set(nameOpt ? [nameOpt.id, ...options.filter((o) => o.type === "color").map((o) => o.id)] : []), [nameOpt, options]);

  const nextKey = useRef(0);
  const newKey = () => `r${++nextKey.current}`;
  const defaults = useMemo(() => defaultPartSelection(options), [options]);
  // a product without a name list keeps everything in `shared`; the designer's part colours start preselected either way
  const [shared, setShared] = useState<ConfigSelection>(() => (nameOpt ? {} : defaults));
  const [rows, setRows] = useState<Row[]>(() => [{ key: "r0", selection: nameOpt ? defaults : {}, qty: 1 }]);
  const [active, setActive] = useState(0); // the name shown on the 3D model
  const row = rows[Math.min(active, rows.length - 1)];

  /** The full selection of one name: the shared options plus its own. */
  const fullOf = useCallback((r: Row): ConfigSelection => ({ ...shared, ...r.selection }), [shared]);
  const split = useCallback(
    (full: ConfigSelection) => {
      const own: ConfigSelection = {}, rest: ConfigSelection = {};
      for (const [id, v] of Object.entries(full)) (perName.has(id) ? own : rest)[id] = v;
      return { own, rest };
    },
    [perName],
  );

  // Keep the customer's work across a sign-in or privacy-consent detour. sessionStorage only exists in the browser.
  // `add` means "they pressed Add to cart": the add is finished automatically when they come back. `tries` stops a
  // loop if consent somehow never sticks.
  const keepAndGo = useCallback(
    (selections: { selection: ConfigSelection; qty: number }[], add: boolean, to: "/sign-in" | "/consent", tries = 0) => {
      try {
        sessionStorage.setItem(storeKey, JSON.stringify({ rows: selections, add, tries, at: Date.now() }));
      } catch {
        /* storage unavailable: they'll just re-pick */
      }
      router.push(`${to}?redirect=${encodeURIComponent(pathname)}`);
    },
    [storeKey, router, pathname],
  );

  const addNow = useCallback(
    (selections: { selection: ConfigSelection; qty: number }[], tries = 0) => {
      startTransition(async () => {
        const res = nameOpt
          ? await addManyToCartAction({ productId, rows: selections })
          : await addToCartAction({ productId, selection: selections[0].selection, qty: selections[0].qty });
        if (res.ok) {
          const n = "added" in res ? Number(res.added) : 1;
          toast.success(n > 1 ? `Added ${n} names to cart` : "Added to cart", { action: { label: "Go to cart", onClick: () => router.push("/cart") } });
          router.refresh();
        } else if ("needs" in res && tries < 2) {
          keepAndGo(selections, true, res.needs === "consent" ? "/consent" : "/sign-in", tries + 1);
        } else {
          toast.error(res.error ?? "Could not add to cart");
        }
      });
    },
    [productId, nameOpt, router, keepAndGo],
  );

  // Restore choices saved before a sign-in / consent redirect, and finish the add if that is what they were doing.
  // The saved copy is removed as soon as it's used, and ignored when old.
  useEffect(() => {
    if (sessionLoading) return;
    try {
      const raw = sessionStorage.getItem(storeKey);
      if (!raw) return;
      sessionStorage.removeItem(storeKey);
      const saved = JSON.parse(raw) as { rows?: { selection?: unknown; qty?: unknown }[]; selection?: unknown; add?: boolean; tries?: number; at?: number };
      const list = (saved.rows ?? (saved.selection ? [{ selection: saved.selection, qty: 1 }] : []))
        .slice(0, MAX_NAMES)
        .map((r) => ({ selection: configSelectionSchema.safeParse(r.selection), qty: typeof r.qty === "number" && r.qty >= 1 && r.qty <= 99 ? Math.floor(r.qty) : 1 }))
        .filter((r) => r.selection.success && Object.keys(r.selection.data).length);
      if (!list.length) return;
      const fulls = list.map((r) => ({ selection: (r.selection as { data: ConfigSelection }).data, qty: r.qty }));
      const first = split(fulls[0].selection);
      setShared(first.rest);
      setRows(fulls.map((f) => ({ key: newKey(), selection: split(f.selection).own, qty: f.qty })));
      setActive(0);
      const fresh = typeof saved.at === "number" && Date.now() - saved.at < 30 * 60 * 1000;
      if (saved.add && fresh && signedIn) addNow(fulls, saved.tries ?? 0);
      else toast.info("We kept your choices. Add to cart when you're ready.");
    } catch {
      /* private mode or corrupt value: start fresh */
    }
  }, [storeKey, sessionLoading, signedIn, addNow, split]);

  // Live, client-side preview of the authoritative price (server re-checks).
  const priced = useMemo(
    () => rows.map((r) => computeUnitPrice(basePriceCents, options, fullOf(r))),
    [rows, basePriceCents, options, fullOf],
  );
  const totalCents = priced.reduce((sum, p, i) => sum + p.unitPriceCents * rows[i].qty, 0);
  const firstError = priced.map((p, i) => (p.errors[0] ? (rows.length > 1 ? `Name ${i + 1}: ${p.errors[0]}` : p.errors[0]) : null)).find(Boolean) ?? null;

  // The name shown on the 3D model is the active one: show it as it is typed, and block names that cannot be printed.
  const activeFull = row ? fullOf(row) : {};
  const chosenSlot = useMemo(
    () => (nameSlot && nameOpt ? withNameColor(withFont(nameSlot, activeFull[nameOpt.id]?.font), activeFull[nameOpt.id]?.nameColor) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeFull is rebuilt every render; its parts below are what matter
    [nameSlot, nameOpt, activeFull[nameOpt?.id ?? ""]?.font, activeFull[nameOpt?.id ?? ""]?.nameColor],
  );
  const nameBuild = useNameBuild(chosenSlot, nameOpt ? (activeFull[nameOpt.id]?.text ?? "") : "");
  const nameError = nameBuild && !nameBuild.ok ? nameBuild.error : null;

  // The whole model's colour, and the colour of each separately-coloured part, for the 3D model.
  const activeColor = wholeModelColor(options, activeFull) ?? "#9ca3af";
  const partKey = JSON.stringify(partColorsFor(options, activeFull));
  const partColors = useMemo(() => JSON.parse(partKey) as Record<string, string>, [partKey]);

  function setShare(optId: string, patch: ConfigSelection[string]) {
    setShared((s) => ({ ...s, [optId]: { ...s[optId], ...patch } }));
  }
  function setOwn(key: string, optId: string, patch: ConfigSelection[string]) {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, selection: { ...r.selection, [optId]: { ...r.selection[optId], ...patch } } } : r)));
  }
  /** A text option with the value removed: `undefined` fields are dropped so the selection stays clean. */
  function clearOwn(key: string, optId: string, field: "nameColor") {
    setRows((rs) =>
      rs.map((r) => {
        if (r.key !== key) return r;
        const { [field]: _gone, ...rest } = r.selection[optId] ?? {};
        void _gone;
        return { ...r, selection: { ...r.selection, [optId]: rest } };
      }),
    );
  }
  function addRow() {
    if (rows.length >= MAX_NAMES) return;
    // a new name starts with the colours of the last one: bulk orders are usually alike
    const last = rows[rows.length - 1];
    const colours: ConfigSelection = {};
    for (const [id, v] of Object.entries(last.selection)) if (id !== nameOpt?.id) colours[id] = v;
    const r: Row = { key: newKey(), selection: { ...colours, ...(nameOpt && last.selection[nameOpt.id]?.font ? { [nameOpt.id]: { font: last.selection[nameOpt.id]?.font } } : {}) }, qty: 1 };
    setRows([...rows, r]);
    setActive(rows.length);
  }
  function removeRow(key: string) {
    if (rows.length < 2) return;
    const at = rows.findIndex((r) => r.key === key);
    setRows(rows.filter((r) => r.key !== key));
    setActive((a) => Math.max(0, a > at ? a - 1 : Math.min(a, rows.length - 2)));
  }

  function onAddToCart() {
    const selections = rows.map((r) => ({ selection: fullOf(r), qty: r.qty }));
    if (!signedIn) {
      keepAndGo(selections, true, "/sign-in");
      return;
    }
    if (firstError) {
      toast.error(firstError);
      return;
    }
    if (nameError) {
      toast.error(nameError);
      return;
    }
    addNow(selections);
  }

  /** The pickers for one option: colour swatches, size buttons, text, image. `value` is that option's current choice. */
  function picker(opt: ProductOptionInput, value: ConfigSelection[string] | undefined, set: (patch: ConfigSelection[string]) => void, idPrefix: string) {
    return (
      <>
        {(opt.type === "color" || opt.type === "size") && (
          <div className="flex flex-wrap gap-2">
            {opt.values.map((v) => {
              const selected = value?.valueId === v.id;
              if (opt.type === "color") {
                return (
                  <button
                    key={v.id}
                    type="button"
                    aria-label={v.label}
                    aria-pressed={selected}
                    onClick={() => set({ valueId: v.id })}
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
                  onClick={() => set({ valueId: v.id })}
                  className={cn(
                    "rounded-lg border-2 px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    selected ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background hover:border-primary",
                  )}
                >
                  {v.label}
                  {v.priceDeltaCents > 0 && <span className="ml-1 text-xs opacity-80">+{formatPHP(v.priceDeltaCents)}</span>}
                </button>
              );
            })}
          </div>
        )}
        {opt.type === "text" && (
          <Input
            id={`${idPrefix}-${opt.id}`}
            maxLength={opt.constraints.maxLen ?? 50}
            placeholder={`Up to ${opt.constraints.maxLen ?? 50} characters`}
            value={value?.text ?? ""}
            onChange={(e) => set({ text: e.target.value })}
          />
        )}
        {opt.type === "image" && (
          <CustomerImageUpload
            signedIn={signedIn}
            value={value?.imageKey}
            onChange={(key) => set({ imageKey: key })}
            onNeedSignIn={() => keepAndGo(rows.map((r) => ({ selection: fullOf(r), qty: r.qty })), false, "/sign-in")}
          />
        )}
      </>
    );
  }

  const optionLabel = (opt: ProductOptionInput) => (
    <Label className="text-base font-bold">
      {opt.label}
      {opt.required && <span className="ml-1 text-primary">*</span>}
      {opt.priceDeltaCents > 0 && <span className="ml-2 text-xs font-normal text-muted-foreground">+{formatPHP(opt.priceDeltaCents)}</span>}
    </Label>
  );

  // the options shown above the list of names (everything that is not per name), in the product's own order
  const sharedOptions = options.filter((o) => !perName.has(o.id));
  const nameColours = !engraved ? (nameSlot?.nameColors ?? []) : [];
  const count = rows.length;
  const overlayColor = engraved ? ENGRAVED_PREVIEW : chosenSlot?.nameColor?.hex;

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
      <div className="lg:sticky lg:top-24 lg:self-start">
        <ProductGallery
          productName={productName}
          modelUrl={stlUrl}
          color={activeColor}
          photos={photos}
          overlay={nameBuild?.ok ? nameBuild.geometry : null}
          overlayColor={overlayColor}
          partColors={partColors}
        />
        {nameOpt && count > 1 && (
          <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
            Showing name {Math.min(active, count - 1) + 1} of {count}. Select another name to see it on the model.
          </p>
        )}
      </div>

      {/* Customizer form */}
      <div className="space-y-6">
        {!nameOpt &&
          options.map((opt) => (
            <div key={opt.id} className="space-y-2">
              {optionLabel(opt)}
              {picker(opt, shared[opt.id], (patch) => setShare(opt.id, patch), "opt")}
            </div>
          ))}

        {nameOpt && (
          <>
            {sharedOptions.map((opt) => (
              <div key={opt.id} className="space-y-2">
                {optionLabel(opt)}
                {picker(opt, shared[opt.id], (patch) => setShare(opt.id, patch), "opt")}
              </div>
            ))}

            <section aria-label="Names" className="space-y-3">
              <div>
                <h2 className="text-base font-bold">{count > 1 ? "Names" : nameOpt.label}</h2>
                <p className="text-xs text-muted-foreground">
                  Need more than one? Add a name for each, with its own colours. They all go to the cart together.
                </p>
              </div>
              {rows.map((r, i) => {
                const full = fullOf(r);
                const sel = r.selection[nameOpt.id];
                const chosenFont = withFont(nameSlot!, sel?.font).font;
                const isActive = i === Math.min(active, count - 1);
                const problem = priced[i]?.errors[0];
                return (
                  <div
                    key={r.key}
                    className={cn("space-y-3 rounded-xl border-2 p-3 transition-colors", isActive ? "border-primary" : "border-border")}
                    onFocusCapture={() => setActive(i)}
                    onClick={() => setActive(i)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`name-${r.key}`} className="text-sm font-bold">
                        {count > 1 ? `Name ${i + 1}` : nameOpt.label}
                        {nameOpt.required && <span className="ml-1 text-primary">*</span>}
                      </Label>
                      <div className="flex items-center gap-1.5">
                        <Label htmlFor={`qty-${r.key}`} className="text-xs font-semibold">Qty</Label>
                        <Input
                          id={`qty-${r.key}`}
                          type="number"
                          min={1}
                          max={99}
                          className="h-8 w-16"
                          value={r.qty}
                          onChange={(e) => setRows(rows.map((x) => (x.key === r.key ? { ...x, qty: Math.min(99, Math.max(1, Math.floor(Number(e.target.value)) || 1)) } : x)))}
                        />
                        {count > 1 && (
                          <Button type="button" size="icon" variant="outline" className="size-8" aria-label={`Remove name ${i + 1}`} onClick={() => removeRow(r.key)}>
                            <Trash2 className="size-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                    <Input
                      id={`name-${r.key}`}
                      maxLength={nameOpt.constraints.maxLen ?? 50}
                      placeholder={`Up to ${nameOpt.constraints.maxLen ?? 50} characters`}
                      value={sel?.text ?? ""}
                      onChange={(e) => setOwn(r.key, nameOpt.id, { text: e.target.value })}
                      aria-invalid={isActive && Boolean(nameError)}
                    />
                    {nameFonts.length > 1 && (
                      <div className="flex flex-wrap items-center gap-2">
                        <Label htmlFor={`font-${r.key}`} className="text-xs font-semibold">Font</Label>
                        <select
                          id={`font-${r.key}`}
                          className="h-9 rounded-md border-2 border-border bg-background px-2 text-sm"
                          value={chosenFont}
                          onChange={(e) => setOwn(r.key, nameOpt.id, { font: e.target.value })}
                        >
                          {nameFonts.map((f) => (
                            <option key={f} value={f}>{NAME_FONTS[f].label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {nameColours.length > 0 && (
                      <div role="group" aria-label={`Name colour${count > 1 ? ` for name ${i + 1}` : ""}`} className="space-y-1.5">
                        <p className="text-xs font-semibold">Name colour</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            aria-pressed={!sel?.nameColor}
                            onClick={() => clearOwn(r.key, nameOpt.id, "nameColor")}
                            className={cn(
                              "rounded-full border-2 px-3 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                              !sel?.nameColor ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary",
                            )}
                          >
                            Same as product
                          </button>
                          {nameColours.map((col) => {
                            const on = sel?.nameColor?.toLowerCase() === col.hex.toLowerCase();
                            return (
                              <button
                                key={col.hex}
                                type="button"
                                aria-label={`${col.label} name`}
                                aria-pressed={on}
                                title={col.label}
                                onClick={() => setOwn(r.key, nameOpt.id, { nameColor: col.hex })}
                                className={cn(
                                  "size-8 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                                  on ? "border-foreground ring-2 ring-ring" : "border-border",
                                )}
                                style={{ backgroundColor: col.hex }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {options
                      .filter((o) => o.type === "color")
                      .map((opt) => (
                        <div key={opt.id} className="space-y-1.5">
                          <p className="text-xs font-semibold">
                            {opt.label}
                            {opt.required && <span className="ml-1 text-primary">*</span>}
                          </p>
                          {picker(opt, full[opt.id], (patch) => setOwn(r.key, opt.id, patch), `c-${r.key}`)}
                        </div>
                      ))}
                    {isActive && (
                      <p className={cn("text-xs", nameError ? "text-destructive" : "text-muted-foreground")} role={nameError ? "alert" : undefined}>
                        {nameError ??
                          (nameBuild?.ok && nameBuild.scaledDown
                            ? "Long name: the letters are made smaller to fit."
                            : engraved
                              ? "Your name is engraved into the model; the preview shows where it goes."
                              : "Your name appears on the model so you can see it before you order.")}
                      </p>
                    )}
                    {!isActive && problem && <p className="text-xs text-muted-foreground">{problem}</p>}
                  </div>
                );
              })}
              {count < MAX_NAMES && (
                <Button type="button" variant="outline" className="w-full" onClick={addRow}>
                  <Plus className="mr-1.5 size-4" /> Add another name
                </Button>
              )}
            </section>
          </>
        )}

        <div className="rounded-xl border-2 border-border bg-muted/40 p-4">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              {nameOpt && (count > 1 || rows[0].qty > 1) ? `Total (${rows.reduce((n, r) => n + r.qty, 0)} items)` : "Your price"}
            </span>
            <span className="text-3xl font-extrabold text-primary">{formatPHP(nameOpt ? totalCents : (priced[0]?.unitPriceCents ?? 0))}</span>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full bg-primary text-primary-foreground transition-transform hover:-translate-y-0.5 active:translate-y-0"
          disabled={pending || Boolean(firstError) || Boolean(nameError)}
          onClick={onAddToCart}
        >
          {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShoppingBag className="mr-2 size-4" />}
          {count > 1 ? `Add all ${count} names to cart` : "Add to cart"}
        </Button>
        {firstError && <p className="text-center text-sm text-muted-foreground">{firstError}</p>}
      </div>
    </div>
  );
}
