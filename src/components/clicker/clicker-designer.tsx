"use client";

/**
 * The clicker designer: a 3D view of the clicker (with an "Inside" view that lifts the key off to show the switch), a list
 * of steps beside it (artwork or letters, colours, shape and size, look, switch, keyring) each with a one-line summary, a
 * list of clickers (an order can hold several different ones), live price, undo and redo, and a draft that survives a
 * reload or a sign-in. On a phone the 3D view stays pinned at the top and the buy bar at the bottom. Everything the
 * customer does changes a plain design object; the print file is rebuilt from that design on the server.
 */
import dynamic from "next/dynamic";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, Copy, Hand, Layers, Loader2, Plus, Redo2, RotateCcw, ShoppingBag, Trash2, Type, Undo2, View } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuantityStepper } from "@/components/quantity-stepper";
import { ViewerLoading } from "@/components/three/viewer-loading";
import {
  ColoursPanel, DesignPanel, KeyringPanel, LettersPanel, LookPanel, ShapePanel, SwitchPanel,
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
  checkAgainstConfig, clickerColours, clickerPriceDeltaCents, clickerSpecSchema, defaultSpec, KIND_LABELS, LIMITS, MAX_ADD_JSON, nameKeys, switchCount,
  type ClickerConfig, type ClickerSpec, type Kind,
} from "@/lib/clicker/spec";
import { RELIEF_LABELS, RIM_LABELS } from "@/lib/clicker/fit";
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
type StepId = "design" | "letters" | "colours" | "shape" | "look" | "switch" | "keyring";
const STEPS: Record<Kind, StepId[]> = {
  clicker: ["design", "colours", "shape", "look", "switch", "keyring"],
  name: ["letters", "colours", "look", "switch", "keyring"],
};
const STEP_TITLES: Record<StepId, string> = {
  design: "What's on the key", letters: "Your letters", colours: "Colours", shape: "Shape & size", look: "Look", switch: "Switches", keyring: "Keyring",
};

/** The starting design with fixed layer ids: the server and the browser must build the same page (new ids use the clock). */
function firstSpec(config: ClickerConfig): ClickerSpec {
  const s = defaultSpec(config);
  return { ...s, layers: s.layers.map((l, i) => ({ ...l, id: `first${i}` })) };
}

/**
 * A key colour that does not swallow the picture: keep the current one if the picture does not use it, else white, else
 * the first colour on offer that the picture leaves free.
 */
function capColourFor(spec: ClickerSpec, config: ClickerConfig, pictureColours: string[]): string {
  const used = new Set(pictureColours.map((c) => c.toLowerCase()));
  // the artwork already on the key must stay visible too
  for (const l of spec.layers) {
    if (!l.visible) continue;
    if (l.kind === "text") used.add(l.color.toLowerCase());
    else for (const r of l.regions) if (r.shapes.length) used.add(r.color.toLowerCase());
  }
  if (!used.has(spec.capColor.toLowerCase())) return spec.capColor;
  return config.palette.find((c) => !used.has(c.toLowerCase()) && c.toLowerCase() !== spec.baseColor.toLowerCase()) ?? config.palette.find((c) => !used.has(c.toLowerCase())) ?? spec.capColor;
}

/** One line under a step's title once it is done. */
function stepSummary(id: StepId, spec: ClickerSpec, config: ClickerConfig): string {
  switch (id) {
    case "design": {
      const t = spec.layers.filter((l) => l.kind === "text" && l.visible && (l as { text: string }).text.trim()).length;
      const p = spec.layers.filter((l) => l.kind === "image" && l.visible).length;
      return [t ? `${t} text` : null, p ? `${p} picture${p === 1 ? "" : "s"}` : null].filter(Boolean).join(", ") || "Nothing yet";
    }
    case "letters": return spec.name ? `“${nameKeys(spec.name).join("")}” · ${nameKeys(spec.name).length} keys` : "";
    case "colours": return `${clickerColours(spec).length} of ${config.maxColours} colours`;
    case "shape": return spec.shape === "outline" ? `${spec.width} × ${spec.height} mm · follows your design` : `${spec.width} × ${spec.height} mm ${spec.shape}`;
    case "look": return `${RELIEF_LABELS[spec.relief]} · ${RIM_LABELS[spec.rim]} wall`;
    case "switch": return spec.kind === "name" ? `${switchCount(spec)} · one per key` : `${spec.switches.length} Cherry MX switch${spec.switches.length === 1 ? "" : "es"}`;
    case "keyring": return spec.keyring.on ? "With a tab" : "None";
  }
}

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
  const [slots, setSlots] = useState<Slot[]>(() => [{ key: "c0", qty: 1, h: newHistory(firstSpec(config)) }]);
  const [active, setActive] = useState(0);
  const slot = slots[Math.min(active, slots.length - 1)];
  const spec = slot.h.present;

  const [step, setStep] = useState<StepId>("design");
  const [visited, setVisited] = useState<Set<StepId>>(() => new Set());
  const [explode, setExplode] = useState(false);
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
    () => buildLayout(deferredSpec, fonts.lookup, config.tune),
    // `fonts.version` changes when a font arrives, so text appears without another edit
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [deferredSpec, fonts.lookup, fonts.version, config.tune],
  );
  const solids = useMemo(() => extrudeLayout(layout), [layout]);
  const stale = deferredSpec !== spec;

  // A key that follows its artwork has the size the artwork makes. Keep the size written on the design equal to the real one
  // (the price size step and the server's check use it). This is bookkeeping, not an edit, so it is not an undo step.
  useEffect(() => {
    if (spec.kind !== "clicker" || spec.shape !== "outline" || deferredSpec !== spec) return;
    const w = Math.min(LIMITS.maxSizeMm, Math.max(LIMITS.minSizeMm, Math.ceil(layout.capSize[0] * 10) / 10));
    const h = Math.min(LIMITS.maxSizeMm, Math.max(LIMITS.minSizeMm, Math.ceil(layout.capSize[1] * 10) / 10));
    if (Math.abs(w - spec.width) < 0.05 && Math.abs(h - spec.height) < 0.05) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- keeping the written size equal to the real one
    setSlots((all) => all.map((s, i) => (i === Math.min(active, all.length - 1) && s.h.present === spec ? { ...s, h: { ...s.h, present: { ...spec, width: w, height: h } } } : s)));
  }, [layout, spec, deferredSpec, active]);

  const flatUri = useMemo(() => "data:image/svg+xml;charset=utf-8," + encodeURIComponent(layoutToSvg(layout, { margin: 2 })), [layout]);
  const thumbs = useMemo(() => {
    const m = new Map<ClickerSpec, string>();
    for (const s of slots) {
      m.set(s.h.present, "data:image/svg+xml;charset=utf-8," + encodeURIComponent(layoutToSvg(buildLayout(s.h.present, fonts.lookup, config.tune), { margin: 1 })));
    }
    return m;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fonts.version: redraw when a font arrives
  }, [slots, fonts.lookup, fonts.version, config.tune]);
  const thumbOf = (s: ClickerSpec, current: boolean) => (current ? flatUri : (thumbs.get(s) ?? ""));

  // --- prices and problems ---------------------------------------------------------------------------------------
  const unitOf = (s: ClickerSpec) => basePriceCents + clickerPriceDeltaCents(s, config);
  const total = slots.reduce((sum, s) => sum + unitOf(s.h.present) * s.qty, 0);
  const problem = checkAgainstConfig(spec, config) ?? layout.errors[0] ?? null;

  // --- direct manipulation in the 3D view ------------------------------------------------------------------------
  const drag = useRef<{ kind: "layer"; id: string; start: [number, number]; at: [number, number] } | { kind: "keyring" } | null>(null);
  const onDragStart = (p: [number, number]) => {
    if (spec.kind !== "clicker" && !spec.keyring.on) return;
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
    setStep("design");
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
        // base + key take two of the printer's colours, so start with what is left for the picture
        const wanted = Math.max(2, config.maxColours - 2);
        const analysis = analyzeImage(pixels, wanted);
        if (!analysis.palette.length) throw new Error("That picture looks empty or fully transparent.");
        const d = defaultTrace(analysis, config.palette);
        const settings: PictureSettings = { colours: wanted, keep: d.keep, target: d.target, smoothing: 1, detail: 0.6 };
        const traced = traceAnalysis(analysis, settings);
        if (!traced.groups.length) throw new Error("We couldn't find any shapes to print in that picture. Try one with clearer colours.");
        layer = imageLayerFrom(traced, spec, file.name.replace(/\.[^.]+$/, ""));
        pictures.current.set(layer.id, { analysis, settings, pixels });
        setPictureSnap(new Map(pictures.current));
      }
      const pictureColours = layer.regions.filter((r) => r.shapes.length).map((r) => r.color);
      edit((s) => ({ ...addLayer(s, layer, config), capColor: capColourFor(s, config, pictureColours) }));
      setSelected(layer.id);
      setStep("design");
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
    setStep("design");
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
    // every design is built here once more: a key that follows its artwork gets its real size written on the design first
    const ready: Slot[] = [];
    for (const [i, s] of slots.entries()) {
      const lay = buildLayout(s.h.present, fonts.lookup, config.tune);
      const sp = s.h.present.kind === "clicker" && s.h.present.shape === "outline"
        ? { ...s.h.present, width: Math.min(LIMITS.maxSizeMm, Math.max(LIMITS.minSizeMm, Math.ceil(lay.capSize[0] * 10) / 10)), height: Math.min(LIMITS.maxSizeMm, Math.max(LIMITS.minSizeMm, Math.ceil(lay.capSize[1] * 10) / 10)) }
        : s.h.present;
      const why = checkAgainstConfig(sp, config) ?? lay.errors[0];
      if (why) {
        setActive(i);
        toast.error(slots.length > 1 ? `Clicker ${i + 1}: ${why}` : why);
        return;
      }
      ready.push({ ...s, h: { ...s.h, present: sp } });
    }
    if (JSON.stringify(ready.map((s) => s.h.present)).length > MAX_ADD_JSON) {
      toast.error("That is a lot of detailed designs at once. Add them in smaller groups.");
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
      const p = JSON.parse(raw) as { tries?: number; at?: number };
      sessionStorage.removeItem(pendingKey(productId));
      if (typeof p.at === "number" && Date.now() - p.at < 30 * 60 * 1000) toast.info("Welcome back. Your clicker is ready: press Add to cart.");
    } catch { /* ignore */ }
  }, [sessionLoading, signedIn, productId]);

  const count = slots.reduce((n, s) => n + s.qty, 0);
  const iconBtn = "size-9";
  const steps = STEPS[spec.kind];
  const openStep = steps.includes(step) ? step : steps[0];
  const goStep = (id: StepId) => {
    setVisited((v) => new Set(v).add(openStep));
    setStep(id);
    if (id !== "design") setMoveMode(false);
  };
  function switchKind(kind: Kind) {
    if (kind === spec.kind) return;
    edit(() => ({ ...defaultSpec(config, kind), layers: kind === "clicker" ? defaultSpec(config, kind).layers : [] }));
    setSelected(null);
    setStep(kind === "name" ? "letters" : "design");
    setVisited(new Set());
  }
  const kindLabel = (sp: ClickerSpec, i: number) => `${KIND_LABELS[sp.kind]} ${i + 1}`;
  const nColours = clickerColours(spec).length;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_420px] lg:items-start">
        {/* on a phone the two columns dissolve into one list, so the 3D view can stay pinned while the steps scroll under it;
            on a desktop the view column stays in sight while the steps scroll */}
        <div className="contents lg:block lg:sticky lg:top-20 lg:space-y-3 lg:self-start">
          <div className="sticky top-16 z-20 -mx-6 bg-background/95 px-6 pb-2 pt-1 backdrop-blur lg:static lg:z-auto lg:mx-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none">
          <div className="relative overflow-hidden rounded-xl border-2 border-border bg-gradient-to-b from-muted/40 to-card">
            <div className="h-[36vh] min-h-[230px] w-full lg:aspect-[4/3] lg:h-auto lg:max-h-[70vh]" aria-live="polite">
              <ClickerViewer
                solids={solids}
                layout={layout}
                selectedLayerId={moveMode ? selected : null}
                view={view}
                moveMode={moveMode}
                explode={explode}
                onPick={() => goStep("colours")}
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
              <Button type="button" size="sm" variant={explode ? "default" : "outline"} aria-pressed={explode} className="h-8 bg-background/90 backdrop-blur" onClick={() => { setExplode((e) => !e); setView("3d"); setMoveMode(false); }} title="Lift the key off to see the switch inside">
                <Layers className="mr-1.5 size-4" /> Inside
              </Button>
              {spec.kind === "clicker" && (
                <Button type="button" size="sm" variant={moveMode ? "default" : "outline"} aria-pressed={moveMode} className="h-8 bg-background/90 backdrop-blur" onClick={() => { setMoveMode((m) => !m); setExplode(false); }} title="Drag the artwork or the keyring tab">
                  {moveMode ? <Hand className="size-4 sm:mr-1.5" /> : <View className="size-4 sm:mr-1.5" />} <span className="hidden sm:inline">{moveMode ? "Move" : "Orbit"}</span><span className="sr-only sm:hidden">{moveMode ? "Move" : "Orbit"}</span>
                </Button>
              )}
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
            <p className="pointer-events-none absolute bottom-2 left-3 right-3 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">Key {layout.capSize[0].toFixed(0)} × {layout.capSize[1].toFixed(0)} mm · base {layout.baseSize[0].toFixed(0)} × {layout.baseSize[1].toFixed(0)} mm · {layout.totalHeight.toFixed(1)} mm tall</span>
              <span className="hidden sm:inline"> · {moveMode ? "Drag the artwork or the ring." : "Click a part to change its colour. Drag to turn, scroll to zoom."}</span>
            </p>
          </div>

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
                    onClick={() => { setActive(i); setSelected(null); setStep(s.h.present.kind === "name" ? "letters" : "design"); }}
                    className={cn("flex items-center gap-2 rounded-lg border-2 py-1 pl-1 pr-2.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-primary bg-primary/10" : "border-border hover:border-primary")}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={thumbOf(s.h.present, on)} alt="" className="size-9 rounded bg-muted/50 object-contain" />
                    {kindLabel(s.h.present, i)}{s.qty > 1 ? ` × ${s.qty}` : ""}
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
                <Button type="button" size="sm" variant="ghost" onClick={() => edit(() => defaultSpec(config, spec.kind))} aria-label="Start this clicker again" title="Start this clicker again">
                  <RotateCcw className="size-4" />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* what to make, then the steps */}
        <div className="contents lg:block lg:space-y-3">
          {config.allowName && (
            <div role="group" aria-label="What are you making?" className="grid grid-cols-2 gap-2">
              {(["clicker", "name"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={spec.kind === k}
                  onClick={() => switchKind(k)}
                  className={cn("rounded-xl border-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", spec.kind === k ? "border-primary bg-primary/5" : "border-border hover:border-primary")}
                >
                  <span className="flex items-center gap-1.5 text-sm font-bold">{k === "clicker" ? <Layers className="size-4" aria-hidden /> : <Type className="size-4" aria-hidden />} {KIND_LABELS[k]}</span>
                  <span className="block text-[11px] text-muted-foreground">{k === "clicker" ? "Your picture or text on one big key" : "One key and switch for each letter"}</span>
                </button>
              ))}
            </div>
          )}

          <ol className="space-y-2">
            {steps.map((id, n) => {
              const open = openStep === id;
              const done = visited.has(id) && !open;
              return (
                <li key={id} className="rounded-xl border-2 border-border bg-card">
                  <h3>
                    <button
                      type="button"
                      aria-expanded={open}
                      onClick={() => goStep(id)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    >
                      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-bold", open ? "bg-primary text-primary-foreground" : done ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground")}>
                        {done ? <Check className="size-4" aria-hidden /> : n + 1}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-bold">{STEP_TITLES[id]}</span>
                        <span className={cn("block truncate text-xs", id === "colours" && nColours > config.maxColours ? "text-destructive" : "text-muted-foreground")}>{stepSummary(id, spec, config)}</span>
                      </span>
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} aria-hidden />
                    </button>
                  </h3>
                  {open && (
                    <div className="border-t-2 border-border p-4">
                      {id === "design" && (
                        <DesignPanel
                          spec={spec} edit={edit} config={config}
                          selected={selected} setSelected={setSelected}
                          onAddText={onAddText} onAddFile={onAddFile}
                          pictures={pictureSnap} retrace={retraceLayer} busy={busy} error={pictureError}
                        />
                      )}
                      {id === "letters" && <LettersPanel spec={spec} edit={edit} config={config} layout={layout} />}
                      {id === "colours" && <ColoursPanel spec={spec} edit={edit} config={config} />}
                      {id === "shape" && <ShapePanel spec={spec} edit={edit} config={config} lock={lock} setLock={setLock} layout={layout} />}
                      {id === "look" && <LookPanel spec={spec} edit={edit} config={config} />}
                      {id === "switch" && <SwitchPanel spec={spec} edit={edit} config={config} layout={layout} />}
                      {id === "keyring" && <KeyringPanel spec={spec} edit={edit} config={config} layout={layout} />}
                      {n < steps.length - 1 && (
                        <div className="mt-4 flex justify-end">
                          <Button type="button" size="sm" variant="outline" onClick={() => goStep(steps[n + 1])}>
                            Next: {STEP_TITLES[steps[n + 1]]} →
                          </Button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      </div>

      {/* price and add: pinned to the bottom of the screen on a phone */}
      <div className="sticky bottom-0 z-20 -mx-6 space-y-2 border-t-2 border-border bg-background/95 px-6 py-3 backdrop-blur lg:static lg:mx-0 lg:space-y-3 lg:rounded-xl lg:border-2 lg:bg-muted/40 lg:p-4 lg:backdrop-blur-none">
        {(problem || layout.warnings.length > 0) && (
          <ul className="space-y-1 text-xs" aria-live="polite">
            {problem && <li role="alert" className="font-semibold text-destructive">{problem}</li>}
            {layout.warnings.map((w) => <li key={w} className="text-amber-700">{w}</li>)}
          </ul>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground sm:text-sm">
              {count > 1 ? `Total (${count} clickers)` : "Your price"}
              {slots.length > 1 ? ` · this one ${formatPHP(unitOf(spec))} each` : ""}
              {switchCount(spec) > 1 ? ` · ${switchCount(spec)} switches` : ""}
            </p>
            <p className="text-2xl font-extrabold text-primary sm:text-3xl">{formatPHP(total)}</p>
          </div>
          <Button size="lg" className="min-w-44 bg-primary text-primary-foreground sm:min-w-56" disabled={adding || Boolean(problem)} onClick={onAdd}>
            {adding ? <Loader2 className="mr-2 size-4 animate-spin" /> : <ShoppingBag className="mr-2 size-4" />}
            {slots.length > 1 ? `Add all ${slots.length} to cart` : "Add to cart"}
          </Button>
        </div>
        <p className="hidden text-xs text-muted-foreground lg:block">Each clicker is printed to order from this exact design, with a real switch fitted. We check every design before we print it.</p>
      </div>
    </div>
  );
}
