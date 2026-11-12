/**
 * Editing a clicker design: undo / redo and the small pure changes the designer makes (add a layer, move it, recolour a
 * colour everywhere, resize). No React and no DOM, so every rule is tested.
 */
import type { ClickerConfig, ClickerSpec, ImageLayer, Layer, TextLayer } from "./spec";
import { defaultText, LIMITS, newId } from "./spec";
import type { Traced } from "./trace";

// --- history ---------------------------------------------------------------------------------------------------------

export type History<T> = { past: T[]; present: T; future: T[]; lastKey: string | null; lastAt: number };

export const newHistory = <T,>(present: T): History<T> => ({ past: [], present, future: [], lastKey: null, lastAt: 0 });

const MAX_HISTORY = 60;

/**
 * Make `next` the current design. Changes with the same `key` close together (dragging a slider or a layer) are one
 * step, so undo does not have to be pressed fifty times.
 */
export function commit<T>(h: History<T>, next: T, key: string | null = null, now = Date.now(), windowMs = 900): History<T> {
  if (Object.is(next, h.present)) return h;
  const merge = key !== null && key === h.lastKey && now - h.lastAt < windowMs;
  return {
    past: merge ? h.past : [...h.past, h.present].slice(-MAX_HISTORY),
    present: next,
    future: [],
    lastKey: key,
    lastAt: now,
  };
}
export const canUndo = (h: History<unknown>) => h.past.length > 0;
export const canRedo = (h: History<unknown>) => h.future.length > 0;
export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future], lastKey: null, lastAt: 0 };
}
export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1), lastKey: null, lastAt: 0 };
}

// --- layers ----------------------------------------------------------------------------------------------------------

const lc = (s: string) => s.toLowerCase();
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export function updateLayer(spec: ClickerSpec, id: string, patch: Partial<Layer>): ClickerSpec {
  return { ...spec, layers: spec.layers.map((l) => (l.id === id ? ({ ...l, ...patch } as Layer) : l)) };
}

export function addLayer(spec: ClickerSpec, layer: Layer, cfg: ClickerConfig): ClickerSpec {
  if (spec.layers.length >= cfg.maxLayers) return spec;
  return { ...spec, layers: [...spec.layers, layer] };
}

export function removeLayer(spec: ClickerSpec, id: string): ClickerSpec {
  return { ...spec, layers: spec.layers.filter((l) => l.id !== id) };
}

/** Move a layer one step towards the front (`up`) or the back. The last layer is on top. */
export function moveLayer(spec: ClickerSpec, id: string, dir: "up" | "down"): ClickerSpec {
  const i = spec.layers.findIndex((l) => l.id === id);
  const j = dir === "up" ? i + 1 : i - 1;
  if (i < 0 || j < 0 || j >= spec.layers.length) return spec;
  const layers = spec.layers.slice();
  [layers[i], layers[j]] = [layers[j], layers[i]];
  return { ...spec, layers };
}

export function duplicateLayer(spec: ClickerSpec, id: string, cfg: ClickerConfig): ClickerSpec {
  const src = spec.layers.find((l) => l.id === id);
  if (!src || spec.layers.length >= cfg.maxLayers) return spec;
  const copy = { ...structuredClone(src), id: newId(src.kind === "text" ? "t" : "i"), name: `${src.name || "Layer"} copy`, x: src.x + 3, y: src.y - 3 } as Layer;
  if (copy.kind === "image") copy.regions = copy.regions.map((r) => ({ ...r, id: newId("g") }));
  return { ...spec, layers: [...spec.layers, copy] };
}

/** Every use of one colour in the design (the base, the cap, and each text or picture colour, or the key colours). */
export function coloursInUse(spec: ClickerSpec): { hex: string; base: boolean; cap: boolean; layers: string[] }[] {
  const map = new Map<string, { hex: string; base: boolean; cap: boolean; layers: string[] }>();
  const slot = (hex: string) => {
    const k = lc(hex);
    if (!map.has(k)) map.set(k, { hex: k, base: false, cap: false, layers: [] });
    return map.get(k)!;
  };
  slot(spec.baseColor).base = true;
  if (spec.kind === "name" && spec.name) {
    spec.name.keyColors.forEach((c) => (slot(c).cap = true));
    slot(spec.name.letterColor).layers.push("letters");
    return [...map.values()];
  }
  slot(spec.capColor).cap = true;
  for (const l of spec.layers) {
    if (!l.visible) continue;
    if (l.kind === "text") slot(l.color).layers.push(l.id);
    else for (const r of l.regions) if (r.shapes.length) slot(r.color).layers.push(l.id);
  }
  return [...map.values()];
}

/** Change one colour everywhere it is used. `part` limits it to the base, the cap or the artwork. */
export function recolour(spec: ClickerSpec, from: string, to: string, part?: "base" | "cap" | "design"): ClickerSpec {
  const f = lc(from);
  const swap = (c: string) => (lc(c) === f ? to : c);
  const all = !part;
  return {
    ...spec,
    baseColor: all || part === "base" ? swap(spec.baseColor) : spec.baseColor,
    capColor: all || part === "cap" ? swap(spec.capColor) : spec.capColor,
    layers: all || part === "design"
      ? spec.layers.map((l) => (l.kind === "text" ? { ...l, color: swap(l.color) } : { ...l, regions: l.regions.map((r) => ({ ...r, color: swap(r.color) })) }))
      : spec.layers,
    name: spec.name && (all || part === "cap" || part === "design")
      ? { ...spec.name, keyColors: part === "design" ? spec.name.keyColors : spec.name.keyColors.map(swap), letterColor: part === "cap" ? spec.name.letterColor : swap(spec.name.letterColor) }
      : spec.name,
  };
}

// --- size ------------------------------------------------------------------------------------------------------------

/** Set the width and/or height within the owner's limits; with `lock`, the other side follows so the proportions stay. */
export function setSize(spec: ClickerSpec, patch: { width?: number; height?: number }, cfg: ClickerConfig, lock: boolean): ClickerSpec {
  const lo = Math.max(cfg.minSize, LIMITS.minSizeMm), hi = Math.min(cfg.maxSize, LIMITS.maxSizeMm);
  let { width, height } = spec;
  const ratio = spec.height / spec.width;
  if (patch.width !== undefined) {
    width = clamp(patch.width, lo, hi);
    if (lock) height = clamp(width * ratio, lo, hi);
  }
  if (patch.height !== undefined) {
    height = clamp(patch.height, lo, hi);
    if (lock) width = clamp(height / ratio, lo, hi);
  }
  return { ...spec, width: round1(width), height: round1(height) };
}
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Make the whole design bigger or smaller by `k`: text sizes, picture sizes and where every layer sits. Used for a key that
 * follows its artwork, where the size of the key IS the size of the design. Switches stay where they are (they are a fixed size).
 */
export function scaleDesign(spec: ClickerSpec, k: number): ClickerSpec {
  if (!Number.isFinite(k) || k <= 0 || Math.abs(k - 1) < 0.002) return spec;
  const r = (n: number) => Math.round(n * 100) / 100;
  return {
    ...spec,
    layers: spec.layers.map((l) =>
      l.kind === "text"
        ? { ...l, x: r(l.x * k), y: r(l.y * k), size: r(clamp(l.size * k, 2, 80)), spacing: r(clamp(l.spacing * k, -1, 10)), lineGap: r(clamp(l.lineGap * k, -2, 20)) }
        : { ...l, x: r(l.x * k), y: r(l.y * k), size: r(clamp(l.size * k, 2, 200)) },
    ),
  };
}

// --- new layers ------------------------------------------------------------------------------------------------------

export function newTextLayer(cfg: ClickerConfig, over: Partial<TextLayer> = {}): TextLayer {
  return { ...defaultText(cfg), ...over };
}

/**
 * A picture layer from a trace: the shapes keep the picture's proportions (longest side = 1) and the layer is sized so
 * the picture fills about `fill` of the clicker.
 */
export function imageLayerFrom(traced: Traced, spec: ClickerSpec, name: string, fill = 0.62): ImageLayer {
  const room = Math.min(spec.width, spec.height) * fill;
  return {
    id: newId("i"),
    kind: "image",
    name: name.slice(0, 40) || "Picture",
    x: 0,
    y: 0,
    rotation: 0,
    mirror: false,
    visible: true,
    size: round1(clamp(room, 2, 200)),
    regions: traced.groups.map((g) => ({ id: newId("g"), color: g.color, shapes: g.shapes.map((s) => ({ outer: s.outer.map(rnd), holes: s.holes.map((h) => h.map(rnd)) })) })),
  };
}
/** Three decimals keep a stored design small and are finer than the printer. */
const rnd = ([x, y]: [number, number]): [number, number] => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000];
