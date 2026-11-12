/**
 * From a design to the flat pieces a clicker is printed from. A clicker is two printed objects around a real MX switch:
 *
 *   housing  floor, body with a 14 mm chamber for the switch, a band with four clip windows, the deck the switch sits in,
 *            and the rim around the well. One colour. A flat keyring tab can hang off it.
 *   cap      one per key: a ring and a round boss with a cross socket for the stem (hollow underneath) at each of its
 *            switches, a solid face, a thin skin on top with the coloured artwork inlaid in it (optionally standing above it).
 *            A key can follow the shape of its artwork ("outline") and can press on several switches.
 *
 * Every piece is a set of areas between two heights and no two pieces overlap, so each colour is its own filament. The
 * heights here are "assembled with the key up" (the cap sits `capRestZ` above the housing's bottom); the print file moves
 * the cap down to the bed. Everything here is 2D and in millimetres; `extrude.ts` gives the pieces their height. Pure, so
 * the browser preview, the cart check and the server's print file all use exactly the same result.
 */
import type { Font, NameFontId } from "../name-mesh";
import { boxRing, capTopMm, crossRing, DEFAULT_TUNE, FIT, RELIEF_MM, RIM_MM, totalHeightMm, type Tune } from "./fit";
import type { Bounds, Region, Ring } from "./poly";
import { boundsOf, difference, intersect, offset, regionArea, removeSmallFeatures, straighten, totalArea, transformRegions, union } from "./poly";
import { circleRing, rayExit, shapeRing } from "./shapes";
import { nameKeys, switchesApart, type ClickerSpec } from "./spec";
import { LIMITS } from "./spec";
import { textRegions } from "./text";

export type PartObject = "housing" | "cap";
export type PartRole = "floor" | "body" | "notch" | "deck" | "rim" | "keyring" | "cap-ring" | "cap-boss" | "cap-top" | "cap-face" | "cap-skin" | "art";
export type LayoutPart = {
  id: string;
  object: PartObject;
  role: PartRole;
  /** Human name for slicers and the colour list. */
  name: string;
  color: string;
  regions: Region[];
  /** Heights with the key up (assembled). The print file moves the cap down to the bed. */
  z0: number;
  z1: number;
};

export type KeyInfo = { index: number; cx: number; cy: number; char: string | null; outline: Region[]; width: number; height: number; color: string; switches: { x: number; y: number }[] };

export type Layout = {
  parts: LayoutPart[];
  keys: KeyInfo[];
  /** Every switch, in drawing coordinates (what the sockets and chambers are built round). */
  switches: { x: number; y: number }[];
  /** All caps together. */
  capOutline: Region[];
  /** The housing's footprint (without the keyring tab). */
  housingOutline: Region[];
  /** Housing with its keyring tab. */
  bounds: Bounds;
  capBounds: Bounds;
  keyring: { cx: number; cy: number; loopR: number; holeR: number } | null;
  /** Where each design layer ended up (before it is trimmed to the cap), for selecting and dragging it. */
  layerShapes: Map<string, Region[]>;
  warnings: string[];
  /** Things that stop the design from being ordered. */
  errors: string[];
  totalHeight: number;
  /** The cap's size after the shape was grown to hold the switch, and the base's size. */
  capSize: [number, number];
  baseSize: [number, number];
  /** Set when the cap had to be made bigger than asked so the switch fits. */
  grownFrom: [number, number] | null;
};

export type FontLookup = (id: NameFontId) => Font | undefined;

const lc = (s: string) => s.toLowerCase();
const region = (outer: Ring): Region => ({ outer, holes: [] });

const keepoutBox = (cx: number, cy: number) => region(boxRing(cx, cy, FIT.keepoutMm, FIT.keepoutMm));

/** The smallest k >= 1 so the shape scaled by k holds the keep-out square of every switch. */
function growToKeepout(spec: ClickerSpec): { w: number; h: number; grown: boolean } {
  const opt = { corner: spec.corner, points: spec.points };
  const keep = union(spec.switches.map((p) => keepoutBox(p.x, p.y)));
  const fits = (k: number) => totalArea(difference(keep, [region(shapeRing(spec.shape, spec.width * k, spec.height * k, opt))])) < 0.02;
  if (fits(1)) return { w: spec.width, h: spec.height, grown: false };
  let lo = 1, hi = 6;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (fits(mid)) hi = mid;
    else lo = mid;
  }
  const up = (v: number) => Math.ceil(v * 10) / 10;
  return { w: up(spec.width * hi), h: up(spec.height * hi), grown: true };
}

/** The convex hull of some regions' points (Andrew's monotone chain), as one counter-clockwise ring. */
function hullOf(regions: Region[]): Ring {
  const pts = regions.flatMap((r) => r.outer).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Ring = [], upper: Ring = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * The key that follows its artwork: everything on the key plus the keep-out square of every switch, any gaps between
 * letters and pieces closed up (so it is one solid shape with no holes), then grown by the border. If the pieces are too far
 * apart to join, the shape wraps all of them.
 */
function outlineAround(art: Region[], switches: { x: number; y: number }[], border: number): Region[] {
  // the switches' squares are joined into one block (their hull), so there is no slit between neighbours
  const boxes = switches.map((p) => keepoutBox(p.x, p.y));
  const keep = boxes.length > 1 ? [region(hullOf(boxes))] : boxes;
  const solid = union([...art, ...keep]);
  let joined: Region[] = [];
  for (const bridge of [1.5, 2.5, 4, 6, 9, 13]) {
    // closing: grow then shrink, which fills gaps narrower than twice the bridge; drop the holes so it is one solid
    joined = union(offset(offset(solid, bridge), -bridge).map((r) => ({ outer: r.outer, holes: [] })));
    if (joined.length === 1) break;
  }
  if (joined.length !== 1) joined = [region(hullOf(joined.length ? joined : solid))];
  return union(offset(joined, border).map((r) => ({ outer: r.outer, holes: [] })));
}

type PlacedLayer = { layerId: string; keyIndex: number; color: string; regions: Region[] };

/** Place the text and pictures of a clicker on the key (centred on its middle). */
function placeClickerLayers(spec: ClickerSpec, fonts: FontLookup, errors: string[]): { placed: PlacedLayer[]; layerShapes: Map<string, Region[]> } {
  const placed: PlacedLayer[] = [];
  const layerShapes = new Map<string, Region[]>();
  for (const layer of spec.layers) {
    if (!layer.visible) continue;
    if (layer.kind === "text") {
      if (!layer.text.trim()) continue;
      const font = fonts(layer.font);
      if (!font) continue; // still loading in the browser
      const t = textRegions(font, layer.text, { size: layer.size, spacing: layer.spacing, lineGap: layer.lineGap });
      if ("error" in t) {
        errors.push(`Text “${layer.text.slice(0, 12)}”: ${t.error}`);
        continue;
      }
      const regions = transformRegions(t.regions, { x: layer.x, y: layer.y, rotation: layer.rotation, mirror: layer.mirror });
      placed.push({ layerId: layer.id, keyIndex: 0, color: lc(layer.color), regions });
      layerShapes.set(layer.id, regions);
    } else {
      const all: Region[] = [];
      for (const g of layer.regions) {
        const regions = transformRegions(g.shapes, { scale: layer.size, x: layer.x, y: layer.y, rotation: layer.rotation, mirror: layer.mirror });
        if (regions.length) placed.push({ layerId: layer.id, keyIndex: 0, color: lc(g.color), regions });
        all.push(...regions);
      }
      if (all.length) layerShapes.set(layer.id, all);
    }
  }
  return { placed, layerShapes };
}

/** Where each key goes: one at the centre for a clicker; rows of keys for name keys. */
function placeKeys(spec: ClickerSpec, clickerArt: Region[]): { cx: number; cy: number; char: string | null; ring: Ring; color: string; switches: { x: number; y: number }[] }[] {
  if (spec.kind === "name" && spec.name) {
    const chars = nameKeys(spec.name);
    const per = Math.max(1, spec.name.perRow);
    const rows = Math.ceil(chars.length / per);
    const pitch = FIT.keyMm + FIT.keyGapMm;
    return chars.map((char, i) => {
      const row = Math.floor(i / per), col = i % per;
      const inRow = Math.min(per, chars.length - row * per);
      const cx = (col - (inRow - 1) / 2) * pitch;
      const cy = -(row - (rows - 1) / 2) * pitch;
      return { cx, cy, char, ring: boxRing(cx, cy, FIT.keyMm, FIT.keyMm, FIT.keyCornerMm), color: lc(spec.name!.keyColors[i % spec.name!.keyColors.length]), switches: [{ x: cx, y: cy }] };
    });
  }
  if (spec.shape === "outline") {
    const around = outlineAround(clickerArt, spec.switches, spec.border);
    const biggest = around.slice().sort((a, b) => regionArea(b) - regionArea(a))[0];
    return [{ cx: 0, cy: 0, char: null, ring: biggest.outer, color: lc(spec.capColor), switches: spec.switches }];
  }
  const size = growToKeepout(spec);
  return [{ cx: 0, cy: 0, char: null, ring: shapeRing(spec.shape, size.w, size.h, { corner: spec.corner, points: spec.points }), color: lc(spec.capColor), switches: spec.switches }];
}

export function buildLayout(spec: ClickerSpec, fonts: FontLookup, tune: Tune = DEFAULT_TUNE): Layout {
  const warnings: string[] = [];
  const errors: string[] = [];

  // --- the artwork of a clicker is placed first: a key that follows it needs to know where it is -----------------
  const early = spec.kind === "clicker" ? placeClickerLayers(spec, fonts, errors) : { placed: [] as PlacedLayer[], layerShapes: new Map<string, Region[]>() };
  if (spec.kind === "clicker" && !switchesApart(spec.switches)) errors.push(`The switches are too close. Keep them at least ${FIT.switchPitchMm} mm apart.`);

  // --- the keys (caps) ------------------------------------------------------------------------------------------
  const placedKeys = placeKeys(spec, early.placed.flatMap((p) => p.regions));
  const keys: KeyInfo[] = placedKeys.map((k, index) => {
    const outline = [region(k.ring)];
    const b = boundsOf(outline);
    return { index, cx: k.cx, cy: k.cy, char: k.char, outline, width: b.maxX - b.minX, height: b.maxY - b.minY, color: k.color, switches: k.switches };
  });
  const switches = keys.flatMap((k) => k.switches);
  const capOutline = union(keys.flatMap((k) => k.outline));
  const capBounds = boundsOf(capOutline);
  const asked: [number, number] = [spec.width, spec.height];
  const capSize: [number, number] = [capBounds.maxX - capBounds.minX, capBounds.maxY - capBounds.minY];
  let grownFrom: [number, number] | null = null;
  if (spec.kind === "clicker" && spec.shape !== "outline" && (capSize[0] > asked[0] + 0.05 || capSize[1] > asked[1] + 0.05)) {
    grownFrom = asked;
    warnings.push(`Made ${capSize[0].toFixed(1)} × ${capSize[1].toFixed(1)} mm so ${switches.length > 1 ? "the switches fit" : "the switch fits"} inside.`);
  }

  // --- the housing -----------------------------------------------------------------------------------------------
  const housingOutline = union(offset(capOutline, FIT.insetMm));
  const wells = union(offset(capOutline, FIT.clearMm + tune.gap));
  const pocket = FIT.pocketMm + tune.pocket;
  const chambers = union(switches.map((k) => region(boxRing(k.x, k.y, pocket, pocket))));
  const windows = union(
    switches.flatMap((k) => {
      const w = FIT.notchWidthMm, d = FIT.notchDepthMm + 0.2, off = pocket / 2 - 0.2 + d / 2;
      return [region(boxRing(k.x + off, k.y, d, w)), region(boxRing(k.x - off, k.y, d, w)), region(boxRing(k.x, k.y + off, w, d)), region(boxRing(k.x, k.y - off, w, d))];
    }),
  );
  const chambersAndWindows = union(chambers, windows);

  // the keyring: a flat tab on the housing with one real hole
  let keyring: Layout["keyring"] = null;
  let tab: Region[] = [];
  if (spec.keyring.on) {
    const biggest = housingOutline.slice().sort((a, b) => regionArea(b) - regionArea(a))[0];
    const exit = biggest ? rayExit(biggest.outer, spec.keyring.angle) : null;
    if (exit) {
      const holeR = spec.keyring.hole / 2;
      const loopR = holeR + spec.keyring.wall;
      let dist = holeR + 1.0;
      let cx = 0, cy = 0;
      for (let i = 0; i < 28; i++) {
        cx = exit.point[0] + exit.dir[0] * dist;
        cy = exit.point[1] + exit.dir[1] * dist;
        // keep a full ring of material (at least 1.2 mm) round the hole: it must not run into the base's edge
        if (totalArea(intersect(housingOutline, [region(circleRing(cx, cy, holeR + 1.2))])) < 0.05) break;
        dist += 0.25;
      }
      let loop: Region[] = [region(circleRing(cx, cy, loopR))];
      if (totalArea(intersect(housingOutline, loop)) < 8) {
        // a corner meets the loop at one spot: join them with a neck of round steps from inside the base
        const from: [number, number] = [exit.point[0] - exit.dir[0] * 1.5, exit.point[1] - exit.dir[1] * 1.5];
        const steps = Math.max(2, Math.ceil(Math.hypot(cx - from[0], cy - from[1]) / 0.5));
        const neck = Array.from({ length: steps + 1 }, (_, i) => {
          const t = i / steps;
          return region(circleRing(from[0] + (cx - from[0]) * t, from[1] + (cy - from[1]) * t, loopR));
        });
        loop = union(loop, union(neck));
      }
      if (totalArea(intersect(housingOutline, loop)) < 2) warnings.push("The keyring loop barely touches the base. Move it closer or make the loop wall thicker.");
      tab = difference(difference(loop, housingOutline), [region(circleRing(cx, cy, holeR))]);
      keyring = { cx, cy, loopR, holeR };
    }
  }
  const bounds = boundsOf(tab.length ? union(housingOutline, tab) : housingOutline);

  const parts: LayoutPart[] = [];
  const add = (p: LayoutPart) => {
    // Settle the piece before it is extruded: merge overlaps, and open by a hair (0.01 mm) so a hole that only touches
    // its outline along an edge, or a sliver of no width, is cleanly removed; then drop points that lie on a line.
    const regions = straighten(removeSmallFeatures(union(p.regions), 0.01, 0.01).regions).filter((r) => regionArea(r) > 0.01);
    if (regions.length) parts.push({ ...p, regions });
  };

  const base = lc(spec.baseColor);
  const { floorMm, deckTopMm, deckMm, notchMm } = FIT;
  const zNotch0 = deckTopMm - deckMm - notchMm, zNotch1 = deckTopMm - deckMm;
  const rimTop = deckTopMm + RIM_MM[spec.rim];
  add({ id: "h-floor", object: "housing", role: "floor", name: "Base floor", color: base, regions: housingOutline, z0: 0, z1: floorMm });
  add({ id: "h-body", object: "housing", role: "body", name: "Base body", color: base, regions: difference(housingOutline, chambers), z0: floorMm, z1: zNotch0 });
  add({ id: "h-notch", object: "housing", role: "notch", name: "Base clip band", color: base, regions: difference(housingOutline, chambersAndWindows), z0: zNotch0, z1: zNotch1 });
  add({ id: "h-deck", object: "housing", role: "deck", name: "Base deck", color: base, regions: difference(housingOutline, chambers), z0: zNotch1, z1: deckTopMm });
  add({ id: "h-rim", object: "housing", role: "rim", name: "Base rim", color: base, regions: difference(housingOutline, wells), z0: deckTopMm, z1: rimTop });
  if (tab.length) add({ id: "h-ring", object: "housing", role: "keyring", name: "Base keyring", color: base, regions: tab, z0: 0, z1: FIT.keyringMm });

  // --- the artwork: name keys put a letter on each key; a clicker's layers were placed above ------------------------
  type Placed = PlacedLayer;
  const placed: Placed[] = [...early.placed];
  const layerShapes = early.layerShapes;
  if (spec.kind === "name" && spec.name) {
    const font = fonts(spec.name.font);
    if (font) {
      for (const k of keys) {
        const t = textRegions(font, k.char!, { size: spec.name.letterSize, spacing: 0, lineGap: 0 });
        if ("error" in t) {
          errors.push(`“${k.char}”: ${t.error}`);
          continue;
        }
        placed.push({ layerId: `key${k.index}`, keyIndex: k.index, color: lc(spec.name.letterColor), regions: transformRegions(t.regions, { x: k.cx, y: k.cy }) });
      }
    }
  }

  // artwork stays a hair inside the cap's edge so the skin keeps a printable rim
  const inner = (k: KeyInfo) => offset(k.outline, -0.4, "miter");
  const artByKey = new Map<number, Map<string, Region[]>>();
  for (const k of keys) {
    const interior = inner(k);
    const mine = placed.filter((p) => p.keyIndex === k.index);
    const byColour = new Map<string, Region[]>();
    let covered: Region[] = [];
    for (let i = mine.length - 1; i >= 0; i--) {
      const p = mine[i];
      const inside = intersect(p.regions, interior);
      if (inside.length === 0) continue;
      const visible = covered.length ? difference(inside, covered) : inside;
      covered = covered.length ? union(covered, inside) : inside;
      if (visible.length) byColour.set(p.color, [...(byColour.get(p.color) ?? []), ...visible]);
    }
    // drop detail that is too fine to print
    const settled = new Map<string, Region[]>();
    let removed = 0, area = 0;
    for (const [color, regions] of byColour) {
      const merged = union(regions);
      area += totalArea(merged);
      const r = removeSmallFeatures(merged, LIMITS.minFeatureMm / 2, LIMITS.minAreaMm2);
      removed += r.removedArea;
      const trimmed = intersect(r.regions, interior);
      if (trimmed.length) settled.set(color, trimmed);
    }
    if (area > 0 && removed / area > 0.02) warnings.push(`Some very fine detail (thinner than ${LIMITS.minFeatureMm} mm) is too small to print and was left out.`);
    artByKey.set(k.index, settled);
  }
  for (const [layerId, shapes] of layerShapes) {
    const name = spec.layers.find((l) => l.id === layerId)?.name || "A layer";
    const kept = totalArea(intersect(shapes, inner(keys[0])));
    const all = totalArea(shapes);
    if (!kept) warnings.push(`“${name}” is outside the cap.`);
    else if (all > 0 && kept / all < 0.95) warnings.push(`“${name}” runs past the edge of the cap, so part of it is cut off. Make it smaller or the cap bigger.`);
  }

  // --- the caps --------------------------------------------------------------------------------------------------
  const z = FIT.capRestZ;
  const stem = tune.stem;
  type Slabs = { c1: Region[]; c2: Region[]; c3: Region[]; c4: Region[]; skin: Region[] };
  const slabs = new Map<string, Slabs>();
  const artAll = new Map<string, Region[]>();
  for (const k of keys) {
    const colour = k.color;
    const s = slabs.get(colour) ?? { c1: [], c2: [], c3: [], c4: [], skin: [] };
    slabs.set(colour, s);
    const cavity = union(k.switches.map((p) => region(boxRing(p.x, p.y, FIT.cavityMm, FIT.cavityMm, FIT.cavityCornerMm))));
    const boss = union(k.switches.map((p) => region(circleRing(p.x, p.y, FIT.bossDiameterMm / 2))));
    const cross = union(k.switches.map((p) => region(crossRing(p.x, p.y, FIT.crossSpanMm + stem, FIT.crossArmMm + stem))));
    const mouth = union(k.switches.map((p) => region(crossRing(p.x, p.y, FIT.mouthSpanMm + stem, FIT.mouthArmMm + stem))));
    const ring = difference(k.outline, cavity);
    s.c1.push(...union(ring, difference(boss, mouth)));
    s.c2.push(...union(ring, difference(boss, cross)));
    s.c3.push(...union(ring, boss));
    s.c4.push(...k.outline);
    const art = artByKey.get(k.index) ?? new Map();
    const artUnion = union([...art.values()].flat());
    s.skin.push(...(artUnion.length ? difference(k.outline, artUnion) : k.outline));
    for (const [c, r] of art) artAll.set(c, [...(artAll.get(c) ?? []), ...r]);
  }
  const multi = slabs.size > 1;
  for (const [colour, s] of slabs) {
    const tag = multi ? ` ${colour}` : "";
    const slab = (id: string, role: PartRole, name: string, regions: Region[], a: number, b: number) =>
      add({ id: `c-${id}-${colour}`, object: "cap", role, name: `${name}${tag}`, color: colour, regions, z0: z + a, z1: z + b });
    slab("ring0", "cap-ring", "Cap underside", s.c1, 0, FIT.mouthDepthMm);
    slab("ring1", "cap-boss", "Cap socket", s.c2, FIT.mouthDepthMm, FIT.crossDepthMm);
    slab("ring2", "cap-top", "Cap ceiling", s.c3, FIT.crossDepthMm, FIT.cavityDepthMm);
    slab("face", "cap-face", "Cap face", s.c4, FIT.cavityDepthMm, FIT.capBodyMm);
    slab("skin", "cap-skin", "Cap top", s.skin, FIT.capBodyMm, capTopMm);
  }
  const relief = RELIEF_MM[spec.relief];
  for (const [colour, regions] of artAll) add({ id: `art-${colour}`, object: "cap", role: "art", name: `Art ${colour}`, color: colour, regions, z0: z + FIT.capBodyMm, z1: z + capTopMm + relief });

  // --- does it all fit on the print plate? --------------------------------------------------------------------------
  const hw = bounds.maxX - bounds.minX, hh = bounds.maxY - bounds.minY;
  const cw = capSize[0], ch = capSize[1];
  const m = FIT.plateMarginMm, g = FIT.plateGapMm;
  const sideBySide = hw + g + cw + 2 * m <= FIT.plateMm && Math.max(hh, ch) + 2 * m <= FIT.plateMm;
  const stacked = Math.max(hw, cw) + 2 * m <= FIT.plateMm && hh + g + ch + 2 * m <= FIT.plateMm;
  if (!sideBySide && !stacked) errors.push("This is too big to print on one plate. Make it smaller.");

  return {
    parts, keys, switches, capOutline, housingOutline, bounds, capBounds, keyring, layerShapes, warnings, errors,
    totalHeight: totalHeightMm(spec.relief), capSize, baseSize: [hw, hh], grownFrom,
  };
}

/** Where the housing and the caps sit on the print plate (translations of their drawing coordinates), or null if they do not fit. */
export function plateLayout(layout: Layout): { housing: [number, number]; cap: [number, number] } | null {
  const m = FIT.plateMarginMm, g = FIT.plateGapMm;
  const b = layout.bounds, c = layout.capBounds;
  const hw = b.maxX - b.minX, hh = b.maxY - b.minY, cw = c.maxX - c.minX, ch = c.maxY - c.minY;
  const housing: [number, number] = [m - b.minX, m - b.minY];
  if (hw + g + cw + 2 * m <= FIT.plateMm && Math.max(hh, ch) + 2 * m <= FIT.plateMm) return { housing, cap: [m + hw + g - c.minX, m - c.minY] };
  if (Math.max(hw, cw) + 2 * m <= FIT.plateMm && hh + g + ch + 2 * m <= FIT.plateMm) return { housing, cap: [m - c.minX, m + hh + g - c.minY] };
  return null;
}
