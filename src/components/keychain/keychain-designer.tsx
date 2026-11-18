"use client";

/**
 * The name keychain designer: a 3D view of the keychain beside a list of simple choices (style, name, font, icon, colours,
 * size and thickness, keyring hole), a live price, a list of keychains (an order can hold several different names), undo and
 * redo, and a draft that survives a reload or a sign-in. On a phone the 3D view stays pinned at the top and the buy bar at
 * the bottom. Everything the customer does changes a plain design object; the print file is rebuilt from it on the server.
 */
import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Loader2, Plus, Redo2, RotateCcw, ShoppingBag, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { QuantityStepper } from "@/components/quantity-stepper";
import { ViewerLoading } from "@/components/three/viewer-loading";
import { FontPicker } from "@/components/font-picker";
import { PalettePicker } from "@/components/clicker/palette-picker";
import { Slider } from "@/components/clicker/clicker-panels";
import { useKeychainFonts } from "@/components/keychain/use-keychain-fonts";
import type { KeychainViewMode } from "@/components/keychain/keychain-viewer";
import { addManyToCartAction } from "@/app/(shop)/cart/actions";
import { useSession } from "@/lib/auth-client";
import { formatPHP } from "@/lib/money";
import { extrudeParts, GeometryCache } from "@/lib/clicker/extrude";
import { canRedo, canUndo, commit, newHistory, redo, undo, type History } from "@/lib/clicker/state";
import { MAX_ADD_JSON } from "@/lib/clicker/spec";
import { ICON_LABELS, iconPath } from "@/lib/keychain/icons";
import { buildKeychainLayout, keychainToSvg, layoutProblem } from "@/lib/keychain/layout";
import {
  checkKeychainAgainstConfig, defaultKeychain, keychainColours, keychainPriceDeltaCents, keychainSpecSchema, linesOf, LIMITS, PLATE_IDS, PLATE_LABELS, RING_LABELS, RING_POSITIONS, STYLE_HINTS, STYLE_LABELS,
  type KeychainConfig, type KeychainSpec, type StyleId,
} from "@/lib/keychain/spec";
import { cn } from "@/lib/utils";

const KeychainViewer = dynamic(() => import("@/components/keychain/keychain-viewer"), {
  ssr: false,
  loading: () => (
    <div className="relative size-full">
      <ViewerLoading />
    </div>
  ),
});

type Slot = { key: string; qty: number; h: History<KeychainSpec> };
type Edit = (patch: Partial<KeychainSpec> | ((s: KeychainSpec) => KeychainSpec), key?: string) => void;

const draftKey = (productId: string) => `dc:keychain:draft:${productId}`;
const pendingKey = (productId: string) => `dc:keychain:pending:${productId}`;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Thickness presets: plate + letters (mm). */
const THICKNESS = [
  { id: "thin", label: "Thin", base: 1.6, text: 0.8 },
  { id: "standard", label: "Standard", base: 2, text: 1.2 },
  { id: "chunky", label: "Chunky", base: 3, text: 2 },
] as const;

const Section = ({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) => (
  <section className="space-y-3 rounded-xl border-2 border-border bg-card p-4">
    <div>
      <h3 className="flex items-center gap-2 text-sm font-bold">
        <span className="flex size-6 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground">{n}</span> {title}
      </h3>
      {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
    {children}
  </section>
);

const choiceClass = (on: boolean) =>
  cn("rounded-lg border-2 px-3 py-2 text-left text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary");

export function KeychainDesigner({ productId, basePriceCents, optionId, config }: { productId: string; basePriceCents: number; optionId: string; config: KeychainConfig }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending: sessionLoading } = useSession();
  const signedIn = Boolean(session?.user);
  const [adding, startAdd] = useTransition();

  const counter = useRef(1);
  const [slots, setSlots] = useState<Slot[]>(() => [{ key: "k0", qty: 1, h: newHistory(defaultKeychain(config)) }]);
  const [active, setActive] = useState(0);
  const idx = Math.min(active, slots.length - 1);
  const slot = slots[idx];
  const spec = slot.h.present;
  const [view, setView] = useState<KeychainViewMode>("3d");

  // --- editing ---------------------------------------------------------------------------------------------------
  const edit: Edit = useCallback(
    (patch, key) => {
      setSlots((all) => all.map((s, i) => (i === idx ? { ...s, h: commit(s.h, typeof patch === "function" ? patch(s.h.present) : { ...s.h.present, ...patch }, key ?? null) } : s)));
    },
    [idx],
  );
  const setQty = (qty: number) => setSlots((all) => all.map((s, i) => (i === idx ? { ...s, qty } : s)));
  const doUndo = useCallback(() => setSlots((all) => all.map((s, i) => (i === idx ? { ...s, h: undo(s.h) } : s))), [idx]);
  const doRedo = useCallback(() => setSlots((all) => all.map((s, i) => (i === idx ? { ...s, h: redo(s.h) } : s))), [idx]);
  function addSlot(from?: KeychainSpec) {
    if (slots.length >= config.maxKeychains) return;
    setSlots((all) => [...all, { key: `k${counter.current++}`, qty: 1, h: newHistory(from ? structuredClone(from) : { ...defaultKeychain(config, spec.style), text: "" }) }]);
    setActive(slots.length);
  }
  function removeSlot(i: number) {
    if (slots.length < 2) return;
    setSlots((all) => all.filter((_, j) => j !== i));
    setActive((a) => Math.max(0, a > i ? a - 1 : Math.min(a, slots.length - 2)));
  }

  // --- fonts, layout and the solids ------------------------------------------------------------------------------
  const fonts = useKeychainFonts(slots.map((s) => s.h.present));
  const deferred = useDeferredValue(spec);
  const stale = deferred !== spec;
  const layout = useMemo(
    () => buildKeychainLayout(deferred, fonts.lookup),
    // `fonts.version` changes when a font arrives, so the name appears without another edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deferred, fonts.lookup, fonts.version],
  );
  const [geomCache] = useState(() => new GeometryCache());
  useEffect(() => () => geomCache.clear(), [geomCache]);
  const solids = useMemo(() => extrudeParts(layout.parts, geomCache), [layout, geomCache]);

  // The price follows the plate's real length. Keep the length written on the design equal to it (bookkeeping, not an undo step).
  useEffect(() => {
    if (deferred !== spec || layout.parts.length === 0) return;
    const len = Math.min(300, Math.max(5, Math.ceil(layout.lengthMm * 10) / 10));
    if (Math.abs(len - spec.lengthMm) < 0.05) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keeping the written length equal to the real one
    setSlots((all) => all.map((s, i) => (i === idx && s.h.present === spec ? { ...s, h: { ...s.h, present: { ...spec, lengthMm: len } } } : s)));
  }, [layout, spec, deferred, idx]);

  const [settled, setSettled] = useState(layout);
  useEffect(() => {
    const t = setTimeout(() => setSettled(layout), 250);
    return () => clearTimeout(t);
  }, [layout]);
  const flatUri = useMemo(() => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(keychainToSvg(settled, { margin: 2 })), [settled]);

  // --- prices and problems ---------------------------------------------------------------------------------------
  const unitOf = (s: KeychainSpec) => basePriceCents + keychainPriceDeltaCents(s, config);
  const total = slots.reduce((sum, s) => sum + unitOf(s.h.present) * s.qty, 0);
  const problem = checkKeychainAgainstConfig(spec, config) ?? layoutProblem(layout, config);
  const nColours = keychainColours(spec).length;

  // --- draft kept in the browser, and the keyboard ---------------------------------------------------------------
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    try {
      const raw = localStorage.getItem(draftKey(productId));
      if (!raw) return;
      const saved = JSON.parse(raw) as { slots?: { qty?: number; spec?: unknown }[] };
      const list: Slot[] = [];
      for (const [i, s] of (saved.slots ?? []).slice(0, config.maxKeychains).entries()) {
        const parsed = keychainSpecSchema.safeParse(s.spec);
        if (parsed.success) list.push({ key: `r${i}`, qty: typeof s.qty === "number" ? Math.min(99, Math.max(1, Math.floor(s.qty))) : 1, h: newHistory(parsed.data) });
      }
      if (!list.length) return;
      counter.current = list.length + 1;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restoring the saved draft once, after the first render
      setSlots(list);
      setActive(0);
      toast.info("We kept your design from last time.");
    } catch {
      /* private mode or a damaged draft: start fresh */
    }
  }, [productId, config.maxKeychains]);

  useEffect(() => {
    if (!restored.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(draftKey(productId), JSON.stringify({ slots: slots.map((s) => ({ qty: s.qty, spec: s.h.present })) }));
      } catch {
        /* storage full or unavailable */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [slots, productId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (!(e.metaKey || e.ctrlKey)) return;
      const k = e.key.toLowerCase();
      if (k === "z" && !e.shiftKey) { e.preventDefault(); doUndo(); }
      else if ((k === "z" && e.shiftKey) || k === "y") { e.preventDefault(); doRedo(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [doUndo, doRedo]);

  // --- add to cart -----------------------------------------------------------------------------------------------
  const addNow = useCallback(
    async (list: Slot[], tries = 0) => {
      const res = await addManyToCartAction({ productId, rows: list.map((s) => ({ selection: { [optionId]: { design: s.h.present } }, qty: s.qty })) });
      if (res.ok) {
        const n = "added" in res ? Number(res.added) : list.length;
        toast.success(n > 1 ? `Added ${n} keychains to cart` : "Added to cart", { action: { label: "Go to cart", onClick: () => router.push("/cart") } });
        try { localStorage.removeItem(draftKey(productId)); sessionStorage.removeItem(pendingKey(productId)); } catch { /* ignore */ }
        setSlots([{ key: `k${counter.current++}`, qty: 1, h: newHistory(defaultKeychain(config)) }]);
        setActive(0);
        router.refresh();
      } else if ("needs" in res && tries < 2) {
        try { sessionStorage.setItem(pendingKey(productId), JSON.stringify({ tries: tries + 1, at: Date.now() })); } catch { /* ignore */ }
        router.push(`${res.needs === "consent" ? "/consent" : "/sign-in"}?redirect=${encodeURIComponent(pathname)}`);
      } else {
        toast.error(res.error ?? "Could not add to cart");
      }
    },
    [productId, optionId, router, pathname, config],
  );

  async function onAdd() {
    if (!signedIn) {
      try { sessionStorage.setItem(pendingKey(productId), JSON.stringify({ tries: 0, at: Date.now() })); localStorage.setItem(draftKey(productId), JSON.stringify({ slots: slots.map((s) => ({ qty: s.qty, spec: s.h.present })) })); } catch { /* ignore */ }
      router.push(`/sign-in?redirect=${encodeURIComponent(pathname)}`);
      return;
    }
    try {
      await fonts.ready();
    } catch {
      toast.error("A font could not be loaded. Check your connection and try again.");
      return;
    }
    // every design is built here once more, so its real length is written on it before the server prices it
    const ready: Slot[] = [];
    for (const [i, s] of slots.entries()) {
      const lay = buildKeychainLayout(s.h.present, fonts.lookup);
      const sp = { ...s.h.present, lengthMm: Math.min(300, Math.max(5, Math.ceil(lay.lengthMm * 10) / 10)) };
      const why = checkKeychainAgainstConfig(sp, config) ?? layoutProblem(lay, config);
      if (why) {
        setActive(i);
        toast.error(slots.length > 1 ? `Keychain ${i + 1}: ${why}` : why);
        return;
      }
      ready.push({ ...s, h: { ...s.h, present: sp } });
    }
    if (JSON.stringify(ready.map((s) => s.h.present)).length > MAX_ADD_JSON) {
      toast.error("That is a lot of keychains at once. Add them in smaller groups.");
      return;
    }
    startAdd(() => {
      void addNow(ready);
    });
  }

  // finish an add that was waiting for sign-in or consent
  useEffect(() => {
    if (sessionLoading || !signedIn) return;
    try {
      const raw = sessionStorage.getItem(pendingKey(productId));
      if (!raw) return;
      const p = JSON.parse(raw) as { at?: number };
      sessionStorage.removeItem(pendingKey(productId));
      if (typeof p.at === "number" && Date.now() - p.at < 30 * 60 * 1000) toast.info("Welcome back. Your keychain is ready: press Add to cart.");
    } catch { /* ignore */ }
  }, [sessionLoading, signedIn, productId]);

  // --- choices ---------------------------------------------------------------------------------------------------
  function pickStyle(style: StyleId) {
    if (style === spec.style) return;
    edit((s) => ({
      ...s,
      style,
      sub: style === "tag" && !s.sub.trim() ? "0917 123 4567" : s.sub,
      // a bag tag looks best in a box; the other two follow the letters
      plate: style === "tag" ? (s.plate === "follow" ? "rounded" : s.plate) : s.style === "tag" && s.plate === "rounded" ? "follow" : s.plate,
    }));
  }
  function onName(value: string) {
    const lines = value.replace(/\r/g, "").split("\n").slice(0, config.maxLines);
    let left = config.maxChars;
    const kept = lines.map((l) => {
      const cut = l.slice(0, Math.max(0, left));
      left -= cut.replace(/\s/g, "").length > 0 ? cut.length : 0;
      return cut;
    });
    edit({ text: kept.join("\n") }, "text");
  }

  const priceTag = (cents: number) => (cents > 0 ? ` +${formatPHP(cents)}` : "");
  const styleCents: Record<StyleId, number> = { name: 0, icon: config.iconCents, tag: config.tagCents };
  const count = slots.reduce((n, s) => n + s.qty, 0);
  const lines = linesOf(spec);
  const firstLine = lines[0] ?? "";
  const iconBtn = "size-9";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        {/* on a phone the two columns dissolve into one list, so the 3D view can stay pinned while the choices scroll under it */}
        <div className="contents lg:block lg:sticky lg:top-20 lg:space-y-3 lg:self-start">
          <div id="keychain-viewer" className="sticky top-16 z-20 -mx-6 bg-background/95 px-6 pb-2 pt-1 backdrop-blur lg:static lg:z-auto lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
            <div className="relative overflow-hidden rounded-xl border-2 border-border bg-gradient-to-b from-muted/40 to-card">
              <div className="h-[34vh] min-h-[220px] w-full lg:aspect-[4/3] lg:h-auto lg:max-h-[60vh]" aria-live="polite">
                <KeychainViewer
                  solids={solids}
                  bounds={layout.bounds}
                  totalHeight={layout.totalHeight}
                  view={view}
                  fallback={
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={flatUri} alt="Your keychain from above" className="size-full object-contain p-6" />
                  }
                />
              </div>
              <div className="absolute left-2 top-2 flex items-center gap-1.5">
                <div className="inline-flex overflow-hidden rounded-lg border-2 border-border bg-background/90 backdrop-blur" role="group" aria-label="View">
                  {(["3d", "top"] as const).map((v) => (
                    <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("px-3 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                      {v === "3d" ? "3D" : "Top"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="absolute right-2 top-2 flex items-center gap-1.5">
                {stale && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
                <Button type="button" size="icon" variant="outline" className={cn(iconBtn, "bg-background/90 backdrop-blur")} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!canUndo(slot.h)} onClick={doUndo}>
                  <Undo2 className="size-4" />
                </Button>
                <Button type="button" size="icon" variant="outline" className={cn(iconBtn, "bg-background/90 backdrop-blur")} aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo(slot.h)} onClick={doRedo}>
                  <Redo2 className="size-4" />
                </Button>
              </div>
              <p className="pointer-events-none absolute bottom-2 left-3 right-3 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">{round1(layout.lengthMm)} mm long · {round1(layout.totalHeight)} mm thick</span>
                <span className="hidden sm:inline"> · Drag to turn, scroll to zoom.</span>
              </p>
            </div>
          </div>

          {/* the keychains in this order */}
          <div className="space-y-2 rounded-xl border-2 border-border p-3">
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Your keychains">
              {slots.map((s, i) => {
                const on = i === idx;
                const name = linesOf(s.h.present)[0] ?? "New keychain";
                return (
                  <button
                    key={s.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setActive(i)}
                    className={cn("max-w-40 truncate rounded-lg border-2 px-3 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-primary bg-primary/10" : "border-border hover:border-primary")}
                  >
                    {name}{s.qty > 1 ? ` × ${s.qty}` : ""}
                  </button>
                );
              })}
              {slots.length < config.maxKeychains && (
                <Button type="button" size="sm" variant="outline" onClick={() => addSlot()}>
                  <Plus className="mr-1 size-4" /> Another name
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <QuantityStepper value={slot.qty} onChange={setQty} label={slots.length > 1 ? `Copies of keychain ${idx + 1}` : "Copies"} />
              <span className="text-xs text-muted-foreground">copies of this one</span>
              <div className="ml-auto flex gap-1.5">
                <Button type="button" size="sm" variant="outline" disabled={slots.length >= config.maxKeychains} onClick={() => addSlot(spec)}>
                  <Copy className="mr-1 size-4" /> Duplicate
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={slots.length < 2} onClick={() => removeSlot(idx)} aria-label="Remove this keychain">
                  <Trash2 className="size-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => edit(() => defaultKeychain(config, spec.style))} aria-label="Start this keychain again" title="Start this keychain again">
                  <RotateCcw className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="contents lg:block lg:space-y-3">
          {config.styles.length > 1 && (
            <Section n={1} title="Pick a style">
              <div role="group" aria-label="Style" className="grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
                {config.styles.map((id) => (
                  <button key={id} type="button" aria-pressed={spec.style === id} onClick={() => pickStyle(id)} className={choiceClass(spec.style === id)}>
                    <span className="block text-sm font-bold">{STYLE_LABELS[id]}{priceTag(styleCents[id])}</span>
                    <span className="block text-[11px] font-normal text-muted-foreground">{STYLE_HINTS[id]}</span>
                  </button>
                ))}
              </div>
            </Section>
          )}

          <Section n={config.styles.length > 1 ? 2 : 1} title="Type the name" hint={config.maxLines > 1 ? `Press Enter for a second line (up to ${config.maxLines}${config.lineCents ? `, +${formatPHP(config.lineCents)} each after the first` : ""}). Up to ${config.maxChars} letters.` : `Up to ${config.maxChars} letters.`}>
            {config.maxLines > 1 ? (
              <Textarea aria-label="Name" rows={2} value={spec.text} maxLength={config.maxChars + config.maxLines} onChange={(e) => onName(e.target.value)} placeholder="Emma" className="text-base" />
            ) : (
              <Input aria-label="Name" value={spec.text} maxLength={config.maxChars} onChange={(e) => onName(e.target.value)} placeholder="Emma" className="text-base" />
            )}
            {spec.style === "tag" && (
              <div className="space-y-2">
                <label className="block text-xs font-semibold" htmlFor="kc-sub">Small line (phone number, class, address…)</label>
                <Input id="kc-sub" value={spec.sub} maxLength={30} onChange={(e) => edit({ sub: e.target.value }, "sub")} placeholder="0917 123 4567" />
                <Slider id="kc-subsize" label="Small line size" value={spec.subSize} min={3} max={8} step={0.5} onChange={(v) => edit({ subSize: v }, "subsize")} />
              </div>
            )}
          </Section>

          <Section n={config.styles.length > 1 ? 3 : 2} title="Font and size">
            <FontPicker fonts={config.fonts} value={spec.font} onChange={(id) => edit({ font: id })} sample={firstLine} />
            <Slider id="kc-size" label="Letter height" value={spec.size} min={config.minSize} max={config.maxSize} step={0.5} onChange={(v) => edit({ size: v }, "size")} />
            <Slider id="kc-spacing" label="Letter spacing" value={spec.spacing} min={-1} max={4} step={0.2} onChange={(v) => edit({ spacing: v }, "spacing")} />
          </Section>

          {spec.style === "icon" && config.icons.length > 0 && (
            <Section n={4} title="Pick an icon">
              <div role="group" aria-label="Icon" className="grid grid-cols-4 gap-2 sm:grid-cols-8 lg:grid-cols-4">
                {config.icons.map((id) => (
                  <button key={id} type="button" aria-pressed={spec.icon === id} aria-label={ICON_LABELS[id]} title={ICON_LABELS[id]} onClick={() => edit({ icon: id })} className={cn("flex aspect-square items-center justify-center rounded-lg border-2 p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", spec.icon === id ? "border-primary bg-primary/10 text-primary" : "border-border text-foreground hover:border-primary")}>
                    <svg viewBox="0 0 100 100" className="size-full" aria-hidden><path d={iconPath(id)} fill="currentColor" fillRule="evenodd" /></svg>
                  </button>
                ))}
              </div>
              <div role="group" aria-label="Icon side" className="grid grid-cols-2 gap-2">
                {(["left", "right"] as const).map((side) => (
                  <button key={side} type="button" aria-pressed={spec.iconSide === side} onClick={() => edit({ iconSide: side })} className={choiceClass(spec.iconSide === side)}>
                    Icon on the {side}
                  </button>
                ))}
              </div>
              <Slider id="kc-iconscale" label="Icon size" value={spec.iconScale} min={0.6} max={2} step={0.1} unit="×" onChange={(v) => edit({ iconScale: round1(v) }, "iconscale")} />
            </Section>
          )}

          <Section n={spec.style === "icon" ? 5 : config.styles.length > 1 ? 4 : 3} title="Colours" hint={`The printer holds ${config.maxColours} colours at once.${config.extraColourCents ? ` Each colour after the 2nd adds ${formatPHP(config.extraColourCents)}.` : ""}`}>
            {([
              ["Plate", "baseColor", true],
              ["Name", "textColor", true],
              ["Icon", "iconColor", spec.style === "icon"],
              ["Frame", "frameColor", spec.style === "tag"],
            ] as const).filter(([, , show]) => show).map(([label, field]) => (
              <div key={field} className="space-y-1.5">
                <p className="text-xs font-semibold">{label}</p>
                <PalettePicker palette={config.palette} value={spec[field]} label={`${label} colour`} onChange={(c) => edit({ [field]: c } as Partial<KeychainSpec>)} />
              </div>
            ))}
            <p role="status" className={cn("text-xs font-semibold", nColours > config.maxColours ? "text-destructive" : "text-muted-foreground")}>
              {nColours} of {config.maxColours} colours used{nColours > config.maxColours ? ". Too many: give two parts the same colour." : ""}
            </p>
          </Section>

          <Section n={spec.style === "icon" ? 6 : config.styles.length > 1 ? 5 : 4} title="Plate and thickness">
            <div role="group" aria-label="Plate shape" className="grid grid-cols-3 gap-2">
              {PLATE_IDS.map((id) => (
                <button key={id} type="button" aria-pressed={spec.plate === id} onClick={() => edit({ plate: id })} className={choiceClass(spec.plate === id)}>
                  {PLATE_LABELS[id]}
                </button>
              ))}
            </div>
            <Slider id="kc-border" label="Plate margin round the letters" value={spec.border} min={1} max={6} step={0.5} onChange={(v) => edit({ border: v }, "border")} />
            <div role="group" aria-label="Thickness" className="grid grid-cols-3 gap-2">
              {THICKNESS.map((t) => {
                const on = Math.abs(spec.baseMm - t.base) < 0.05 && Math.abs(spec.textMm - t.text) < 0.05;
                return (
                  <button key={t.id} type="button" aria-pressed={on} onClick={() => edit({ baseMm: t.base, textMm: t.text })} className={choiceClass(on)}>
                    {t.label}
                    <span className="block text-[11px] font-normal text-muted-foreground">{round1(t.base + t.text)} mm</span>
                  </button>
                );
              })}
            </div>
            <Slider id="kc-base" label="Plate thickness" value={spec.baseMm} min={LIMITS.minBaseMm} max={LIMITS.maxBaseMm} step={0.2} onChange={(v) => edit({ baseMm: round1(v) }, "base")} />
            <Slider id="kc-text" label="Letters stand up by" value={spec.textMm} min={LIMITS.minTextMm} max={LIMITS.maxTextMm} step={0.2} onChange={(v) => edit({ textMm: round1(v) }, "text-mm")} hint={config.thickCents ? `Anything thicker than ${config.thickOverMm} mm in all adds ${formatPHP(config.thickCents)}.` : undefined} />
          </Section>

          <Section n={spec.style === "icon" ? 7 : config.styles.length > 1 ? 6 : 5} title="Keyring hole">
            <div role="group" aria-label="Keyring hole position" className="grid grid-cols-4 gap-2">
              {RING_POSITIONS.map((p) => (
                <button key={p} type="button" aria-pressed={spec.ring.pos === p} onClick={() => edit((s) => ({ ...s, ring: { ...s.ring, pos: p } }))} className={choiceClass(spec.ring.pos === p)}>
                  {RING_LABELS[p]}
                </button>
              ))}
            </div>
            {spec.ring.pos !== "none" && <Slider id="kc-hole" label="Hole size" value={spec.ring.hole} min={3} max={8} step={0.5} onChange={(v) => edit((s) => ({ ...s, ring: { ...s.ring, hole: v } }), "hole")} />}
          </Section>
          {/* room below the last section, so it can be reached above the pinned bars on a phone */}
          <div aria-hidden className="h-[20vh] lg:hidden" />
        </div>
      </div>

      {/* price and add: pinned to the bottom of the screen on a phone */}
      <div id="keychain-buy" className="sticky bottom-0 z-20 -mx-6 space-y-2 border-t-2 border-border bg-background/95 px-6 py-3 backdrop-blur lg:static lg:mx-0 lg:space-y-3 lg:rounded-xl lg:border-2 lg:bg-muted/40 lg:p-4 lg:backdrop-blur-none">
        {(problem || layout.warnings.length > 0) && (
          <ul className="space-y-1 text-xs" aria-live="polite">
            {problem && <li role="alert" className="font-semibold text-destructive">{problem}</li>}
            {layout.warnings.map((w) => <li key={w} className="text-amber-700">{w}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {count > 1 ? `Total (${count} keychains)` : "Your price"}
              {slots.length > 1 ? ` · this one ${formatPHP(unitOf(spec))} each` : ""}
            </p>
            <p className="text-2xl font-extrabold text-primary sm:text-3xl">{formatPHP(total)}</p>
          </div>
          <Button size="lg" className="min-w-44 bg-primary text-primary-foreground sm:min-w-56" disabled={adding || Boolean(problem)} onClick={onAdd}>
            {adding ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShoppingBag className="mr-2 size-4" />}
            {slots.length > 1 ? `Add all ${slots.length} to cart` : "Add to cart"}
          </Button>
        </div>
        <p className="hidden text-xs text-muted-foreground lg:block">Each keychain is 3D-printed to order from this exact design. We check every design before we print it.</p>
      </div>
    </div>
  );
}
