"use client";

/**
 * The clicker designer: a 3D view of the clicker with tools beside it, a list of clickers (an order can hold several
 * different ones), live price, undo and redo, and a draft that survives a reload or a sign-in. Everything the customer
 * does changes a plain design object; the print file is rebuilt from that design on the server.
 */
import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Hand, Loader2, Plus, Redo2, RotateCcw, ShoppingBag, Trash2, Undo2, View } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/quantity-stepper";
import { ViewerLoading } from "@/components/three/viewer-loading";
import {
  ColoursPanel, DesignPanel, KeyringPanel, ShapePanel, StylePanel,
  type PictureSettings, type PictureState,
} from "@/components/clicker/clicker-panels";
import { readRaster, readSvg } from "@/components/clicker/image-import";
import { useClickerFonts } from "@/components/clicker/use-fonts";
import { addManyToCartAction } from "@/app/(shop)/cart/actions";
import { useSession } from "@/lib/auth-client";
import { formatPHP } from "@/lib/money";
import { buildLayout, type Layout } from "@/lib/clicker/layout";
import { extrudeLayout } from "@/lib/clicker/extrude";
import { pointInRegion } from "@/lib/clicker/poly";
import {
  checkAgainstConfig, clickerPriceDeltaCents, clickerSpecSchema, defaultSpec, LIMITS, MAX_ADD_JSON,
  type ClickerConfig, type ClickerSpec,
} from "@/lib/clicker/spec";
import { addLayer, canRedo, canUndo, commit, imageLayerFrom, newHistory, newTextLayer, redo, undo, updateLayer, type History } from "@/lib/clicker/state";
import { layoutToSvg } from "@/lib/clicker/svg";
import { analyzeImage, defaultTrace, traceAnalysis } from "@/lib/clicker/trace";
import { cn } from "@/lib/utils";
import type { ViewMode } from "@/components/clicker/clicker-viewer";

const ClickerViewer = dynamic(() => import("@/components/clicker/clicker-viewer"), {
  ssr: false,
  loading: () => (
    <div className="relative size-full">
      <ViewerLoading />
    </div>
  ),
});

type Slot = { key: string; qty: number; h: History<ClickerSpec> };
type Tab = "shape" | "design" | "colours" | "style" | "keyring";
const TABS: { id: Tab; label: string }[] = [
  { id: "shape", label: "Shape & size" },
  { id: "design", label: "Design" },
  { id: "colours", label: "Colours" },
  { id: "style", label: "Style" },
  { id: "keyring", label: "Keyring" },
];

const draftKey = (productId: string) => `dc:clicker:draft:${productId}`;
const pendingKey = (productId: string) => `dc:clicker:pending:${productId}`;

export function ClickerDesigner({
  productId,
  basePriceCents,
  optionId,
  config,
}: {
  productId: string;
  basePriceCents: number;
  optionId: string;
  config: ClickerConfig;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: session, isPending: sessionLoading } = useSession();
  const signedIn = Boolean(session?.user);
  const [adding, startAdd] = useTransition();

  const counter = useRef(1);
  const [slots, setSlots] = useState<Slot[]>(() => [{ key: "c0", qty: 1, h: newHistory(defaultSpec(config)) }]);
  const [active, setActive] = useState(0);
  const slot = slots[Math.min(active, slots.length - 1)];
  const spec = slot.h.present;

  const [tab, setTab] = useState<Tab>("design");
  const [selected, setSelected] = useState<string | null>(() => slots[0].h.present.layers[0]?.id ?? null);
  const [view, setView] = useState<ViewMode>("3d");
  const [moveMode, setMoveMode] = useState(false);
  const [lock, setLock] = useState(true);
  const [busy, setBusy] = useState(false);
  const [pictureError, setPictureError] = useState<string | null>(null);
  const pictures = useRef(new Map<string, PictureState>());
  const [pictureSnap, setPictureSnap] = useState<Map<string, PictureState>>(() => new Map());

  // --- editing ---------------------------------------------------------------------------------------------------
  const edit = useCallback(
    (fn: (s: ClickerSpec) => ClickerSpec, key?: string) => {
      setSlots((all) => all.map((s, i) => (i === Math.min(active, all.length - 1) ? { ...s, h: commit(s.h, fn(s.h.present), key ?? null) } : s)));
    },
    [active],
  );
  const setQty = (qty: number) => setSlots((all) => all.map((s, i) => (i === Math.min(active, all.length - 1) ? { ...s, qty } : s)));
  const doUndo = () => setSlots((all) => all.map((s, i) => (i === Math.min(active, all.length - 1) ? { ...s, h: undo(s.h) } : s)));
  const doRedo = () => setSlots((all) => all.map((s, i) => (i === Math.min(active, all.length - 1) ? { ...s, h: redo(s.h) } : s)));

  function addSlot(from?: ClickerSpec) {
    if (slots.length >= config.maxClickers) return;
    const key = `c${counter.current++}`;
    setSlots((all) => [...all, { key, qty: 1, h: newHistory(from ? structuredClone(from) : defaultSpec(config)) }]);
    setActive(slots.length);
    setSelected(null);
  }
  function removeSlot(i: number) {
    if (slots.length < 2) return;
    setSlots((all) => all.filter((_, j) => j !== i));
    setActive((a) => Math.max(0, a > i ? a - 1 : Math.min(a, slots.length - 2)));
    setSelected(null);
  }

  // --- fonts, layout and the solids ------------------------------------------------------------------------------
  const fonts = useClickerFonts(slots.map((s) => s.h.present));
  const deferredSpec = useDeferredValue(spec);
  const layout: Layout = useMemo(
    () => buildLayout(deferredSpec, fonts.lookup),
    // `fonts.version` changes when a font arrives, so text appears without another edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deferredSpec, fonts.lookup, fonts.version],
  );
  const solids = useMemo(() => extrudeLayout(layout), [layout]);
  const stale = deferredSpec !== spec;

  const flatUri = useMemo(() => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(layoutToSvg(layout, { margin: 2 })), [layout]);
  const thumbs = useMemo(() => {
    const m = new Map<ClickerSpec, string>();
    for (const s of slots) {
      m.set(s.h.present, "data:image/svg+xml;charset=utf-8," + encodeURIComponent(layoutToSvg(buildLayout(s.h.present, fonts.lookup), { margin: 1 })));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fonts.version: redraw when a font arrives
  }, [slots, fonts.lookup, fonts.version]);
  const thumbOf = (s: ClickerSpec, current: boolean) => (current ? flatUri : (thumbs.get(s) ?? ""));

  // --- prices and problems ---------------------------------------------------------------------------------------
  const unitOf = (s: ClickerSpec) => basePriceCents + clickerPriceDeltaCents(s, config);
  const total = slots.reduce((sum, s) => sum + unitOf(s.h.present) * s.qty, 0);
  const problem = checkAgainstConfig(spec, config) ?? layout.errors[0] ?? null;

  // --- direct manipulation in the 3D view ------------------------------------------------------------------------
  const drag = useRef<{ kind: "layer"; id: string; start: [number, number]; at: [number, number] } | { kind: "keyring" } | null>(null);
  const onDragStart = (p: [number, number]) => {
    const k = layout.keyring;
    if (spec.keyring.on && k && Math.hypot(p[0] - k.cx, p[1] - k.cy) <= k.loopR + 1) {
      drag.current = { kind: "keyring" };
      return;
    }
    let hit: string | null = null;
    for (let i = spec.layers.length - 1; i >= 0 && !hit; i--) {
      const l = spec.layers[i];
      if (l.visible && layout.layerShapes.get(l.id)?.some((r) => pointInRegion(p, r))) hit = l.id;
    }
    const id = hit ?? selected;
    const layer = spec.layers.find((l) => l.id === id);
    if (!layer) {
      drag.current = null;
      return;
    }
    setSelected(layer.id);
    setTab("design");
    drag.current = { kind: "layer", id: layer.id, start: p, at: [layer.x, layer.y] };
  };
  const onDrag = (p: [number, number]) => {
    const d = drag.current;
    if (!d) return;
    if (d.kind === "keyring") {
      const angle = Math.round((Math.atan2(p[1], p[0]) * 180) / Math.PI);
      edit((s) => ({ ...s, keyring: { ...s.keyring, angle } }), "drag-keyring");
    } else {
      const x = Math.round((d.at[0] + p[0] - d.start[0]) * 10) / 10, y = Math.round((d.at[1] + p[1] - d.start[1]) * 10) / 10;
      edit((s) => updateLayer(s, d.id, { x, y }), `drag-${d.id}`);
    }
  };
  const onDragEnd = () => {
    drag.current = null;
  };

  // --- pictures and text -----------------------------------------------------------------------------------------
  const retraceLayer = useCallback(
    (layerId: string, patch: Partial<PictureSettings>) => {
      const pic = pictures.current.get(layerId);
      if (!pic) return;
      let { analysis } = pic;
      let settings: PictureSettings = { ...pic.settings, ...patch };
      if (patch.colours !== undefined && patch.colours !== pic.settings.colours) {
        analysis = analyzeImage(pic.pixels, patch.colours);
        const d = defaultTrace(analysis, config.palette);
        settings = { ...settings, keep: d.keep, target: d.target };
      }
      const traced = traceAnalysis(analysis, { keep: settings.keep, target: settings.target, smoothing: settings.smoothing, detail: settings.detail });
      pictures.current.set(layerId, { ...pic, analysis, settings });
      setPictureSnap(new Map(pictures.current));
      edit((s) => {
        const layer = s.layers.find((l) => l.id === layerId);
        if (!layer || layer.kind !== "image") return s;
        const fresh = imageLayerFrom(traced, s, layer.name);
        return updateLayer(s, layerId, { regions: fresh.regions });
      }, `trace-${layerId}`);
    },
    [config.palette, edit],
  );

  async function onAddFile(file: File) {
    setBusy(true);
    setPictureError(null);
    try {
      const isSvg = file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
      let layer;
      if (isSvg) {
        const traced = await readSvg(file, config.palette);
        if (traced.points > LIMITS.maxPoints) throw new Error("That SVG is too detailed. Simplify it and try again.");
        layer = imageLayerFrom(traced, spec, file.name.replace(/\.[^.]+$/, ""));
      } else {
        const pixels = await readRaster(file);
        const analysis = analyzeImage(pixels, 4);
        if (!analysis.palette.length) throw new Error("That picture looks empty or fully transparent.");
        const d = defaultTrace(analysis, config.palette);
        const settings: PictureSettings = { colours: 4, keep: d.keep, target: d.target, smoothing: 1, detail: 0.6 };
        const traced = traceAnalysis(analysis, settings);
        if (!traced.groups.length) throw new Error("We couldn't find any shapes to print in that picture. Try one with clearer colours.");
        layer = imageLayerFrom(traced, spec, file.name.replace(/\.[^.]+$/, ""));
        pictures.current.set(layer.id, { analysis, settings, pixels });
        setPictureSnap(new Map(pictures.current));
      }
      edit((s) => addLayer(s, layer, config));
      setSelected(layer.id);
      setTab("design");
    } catch (e) {
      setPictureError(e instanceof Error ? e.message : "We couldn't read that picture.");
    } finally {
      setBusy(false);
    }
  }
  function onAddText() {
    const layer = newTextLayer(config, { text: "Text", y: spec.layers.length * -6 });
    edit((s) => addLayer(s, layer, config));
    setSelected(layer.id);
    setTab("design");
  }

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
      for (const [i, s] of (saved.slots ?? []).slice(0, config.maxClickers).entries()) {
        const parsed = clickerSpecSchema.safeParse(s.spec);
        if (parsed.success) list.push({ key: `r${i}`, qty: typeof s.qty === "number" ? Math.min(99, Math.max(1, Math.floor(s.qty))) : 1, h: newHistory(parsed.data) });
      }
      if (!list.length) return;
      counter.current = list.length + 1;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSlots(list);
      setActive(0);
      setSelected(list[0].h.present.layers[0]?.id ?? null);
      toast.info("We kept your design from last time.");
    } catch {
      /* private mode or a damaged draft: start fresh */
    }
  }, [productId, config.maxClickers]);

  useEffect(() => {
    if (!restored.current) return;
    const t = setTimeout(() => {
      try {
        const json = JSON.stringify({ slots: slots.map((s) => ({ qty: s.qty, spec: s.h.present })) });
        if (json.length < 2_000_000) localStorage.setItem(draftKey(productId), json);
      } catch {
        /* storage full or unavailable */
      }
    }, 700);
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
  });

  // --- add to cart -----------------------------------------------------------------------------------------------
  const addNow = useCallback(
    async (list: Slot[], tries = 0) => {
      const res = await addManyToCartAction({ productId, rows: list.map((s) => ({ selection: { [optionId]: { design: s.h.present } }, qty: s.qty })) });
      if (res.ok) {
        const n = "added" in res ? Number(res.added) : list.length;
        toast.success(n > 1 ? `Added ${n} clickers to cart` : "Added to cart", { action: { label: "Go to cart", onClick: () => router.push("/cart") } });
        try { localStorage.removeItem(draftKey(productId)); sessionStorage.removeItem(pendingKey(productId)); } catch { /* ignore */ }
        setSlots([{ key: `c${counter.current++}`, qty: 1, h: newHistory(defaultSpec(config)) }]);
        setActive(0);
        setSelected(null);
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
    for (const [i, s] of slots.entries()) {
      const why = checkAgainstConfig(s.h.present, config) ?? buildLayout(s.h.present, fonts.lookup).errors[0];
      if (why) {
        setActive(i);
        toast.error(slots.length > 1 ? `Clicker ${i + 1}: ${why}` : why);
        return;
      }
    }
    if (JSON.stringify(slots.map((s) => s.h.present)).length > MAX_ADD_JSON) {
      toast.error("That is a lot of detailed designs at once. Add them in smaller groups.");
      return;
    }
    startAdd(() => {
      void addNow(slots);
    });
  }

  // finish an add that was waiting for sign-in or consent
  useEffect(() => {
    if (sessionLoading || !signedIn) return;
    try {
      const raw = sessionStorage.getItem(pendingKey(productId));
      if (!raw) return;
      const p = JSON.parse(raw) as { tries?: number; at?: number };
      sessionStorage.removeItem(pendingKey(productId));
      if (typeof p.at === "number" && Date.now() - p.at < 30 * 60 * 1000) toast.info("Welcome back. Your clicker is ready: press Add to cart.");
    } catch { /* ignore */ }
  }, [sessionLoading, signedIn, productId]);

  const count = slots.reduce((n, s) => n + s.qty, 0);
  const iconBtn = "size-9";

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* the view */}
        <div className="space-y-3">
          <div className="relative overflow-hidden rounded-xl border-2 border-border bg-gradient-to-b from-muted/40 to-card">
            <div className="aspect-square max-h-[70vh] w-full lg:aspect-[4/3]" aria-live="polite">
              <ClickerViewer
                solids={solids}
                layout={layout}
                selectedLayerId={moveMode ? selected : null}
                view={view}
                moveMode={moveMode}
                onDragStart={onDragStart}
                onDrag={onDrag}
                onDragEnd={onDragEnd}
                fallback={
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={flatUri} alt="Your clicker from above" className="size-full object-contain p-6" />
                }
              />
            </div>
            <div className="absolute left-2 top-2 flex flex-wrap items-center gap-1.5">
              <div className="inline-flex overflow-hidden rounded-lg border-2 border-border bg-background/90 backdrop-blur" role="group" aria-label="View">
                {(["3d", "top"] as const).map((v) => (
                  <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("px-3 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", view === v ? "bg-primary text-primary-foreground" : "hover:bg-muted")}>
                    {v === "3d" ? "3D" : "Top"}
                  </button>
                ))}
              </div>
              <Button type="button" size="sm" variant={moveMode ? "default" : "outline"} aria-pressed={moveMode} className="h-8 bg-background/90 backdrop-blur data-[state=on]:bg-primary" onClick={() => setMoveMode((m) => !m)} title="Drag the design or the keyring on the clicker">
                {moveMode ? <Hand className="mr-1.5 size-4" /> : <View className="mr-1.5 size-4" />} {moveMode ? "Move" : "Orbit"}
              </Button>
            </div>
            <div className="absolute right-2 top-2 flex items-center gap-1.5">
              {(stale || busy) && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Updating" />}
              <Button type="button" size="icon" variant="outline" className={cn(iconBtn, "bg-background/90 backdrop-blur")} aria-label="Undo (Ctrl+Z)" title="Undo (Ctrl+Z)" disabled={!canUndo(slot.h)} onClick={doUndo}>
                <Undo2 className="size-4" />
              </Button>
              <Button type="button" size="icon" variant="outline" className={cn(iconBtn, "bg-background/90 backdrop-blur")} aria-label="Redo (Ctrl+Shift+Z)" title="Redo (Ctrl+Shift+Z)" disabled={!canRedo(slot.h)} onClick={doRedo}>
                <Redo2 className="size-4" />
              </Button>
            </div>
            <p className="pointer-events-none absolute bottom-2 left-3 text-[11px] text-muted-foreground">
              {moveMode ? "Drag the design or the keyring ring. Scroll to zoom." : "Drag to turn, scroll to zoom."} {spec.width} × {spec.height} mm
            </p>
          </div>

          {/* the list of clickers in this order */}
          <div className="space-y-2 rounded-xl border-2 border-border p-3">
            <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Your clickers">
              {slots.map((s, i) => {
                const on = i === Math.min(active, slots.length - 1);
                return (
                  <button
                    key={s.key}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => { setActive(i); setSelected(null); }}
                    className={cn("flex items-center gap-2 rounded-lg border-2 py-1 pl-1 pr-2.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-primary bg-primary/10" : "border-border hover:border-primary")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbOf(s.h.present, on)} alt="" className="size-9 rounded bg-muted/50 object-contain" />
                    Clicker {i + 1}{s.qty > 1 ? ` × ${s.qty}` : ""}
                  </button>
                );
              })}
              {slots.length < config.maxClickers && (
                <Button type="button" size="sm" variant="outline" onClick={() => addSlot()}>
                  <Plus className="mr-1 size-4" /> New clicker
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <QuantityStepper value={slot.qty} onChange={setQty} label={slots.length > 1 ? `Copies of clicker ${active + 1}` : "Copies"} />
              <span className="text-xs text-muted-foreground">copies of this one</span>
              <div className="ml-auto flex gap-1.5">
                <Button type="button" size="sm" variant="outline" disabled={slots.length >= config.maxClickers} onClick={() => addSlot(spec)}>
                  <Copy className="mr-1 size-4" /> Duplicate
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={slots.length < 2} onClick={() => removeSlot(Math.min(active, slots.length - 1))} aria-label="Remove this clicker">
                  <Trash2 className="size-4" />
                </Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => edit(() => defaultSpec(config))} aria-label="Start this clicker again" title="Start this clicker again">
                  <RotateCcw className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* the tools */}
        <div className="rounded-xl border-2 border-border bg-card">
          <div role="tablist" aria-label="Tools" className="flex overflow-x-auto border-b-2 border-border">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={cn("shrink-0 px-3 py-2.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring", tab === t.id ? "border-b-2 border-primary text-primary" : "text-muted-foreground hover:text-foreground")}
                style={{ marginBottom: -2 }}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="max-h-[640px] overflow-y-auto p-4">
            {tab === "shape" && <ShapePanel spec={spec} edit={edit} config={config} lock={lock} setLock={setLock} />}
            {tab === "design" && (
              <DesignPanel
                spec={spec} edit={edit} config={config}
                selected={selected} setSelected={setSelected}
                onAddText={onAddText} onAddFile={onAddFile}
                pictures={pictureSnap} retrace={retraceLayer} busy={busy} error={pictureError}
              />
            )}
            {tab === "colours" && <ColoursPanel spec={spec} edit={edit} config={config} />}
            {tab === "style" && <StylePanel spec={spec} edit={edit} config={config} />}
            {tab === "keyring" && <KeyringPanel spec={spec} edit={edit} config={config} layout={layout} />}
          </div>
        </div>
      </div>

      {/* price and add */}
      <div className="space-y-3 rounded-xl border-2 border-border bg-muted/40 p-4">
        {(problem || layout.warnings.length > 0) && (
          <ul className="space-y-1 text-xs" aria-live="polite">
            {problem && <li role="alert" className="font-semibold text-destructive">{problem}</li>}
            {layout.warnings.map((w) => <li key={w} className="text-amber-700">{w}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-sm text-muted-foreground">
              {count > 1 ? `Total (${count} clickers)` : "Your price"}
              {slots.length > 1 ? ` · this one ${formatPHP(unitOf(spec))} each` : ""}
            </p>
            <p className="text-3xl font-extrabold text-primary">{formatPHP(total)}</p>
          </div>
          <Button size="lg" className="min-w-56 bg-primary text-primary-foreground" disabled={adding || Boolean(problem)} onClick={onAdd}>
            {adding ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShoppingBag className="mr-2 size-4" />}
            {slots.length > 1 ? `Add all ${slots.length} designs to cart` : "Add to cart"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Each clicker is printed to order from this exact design. We check every design before we print it.</p>
      </div>
    </div>
  );
}
