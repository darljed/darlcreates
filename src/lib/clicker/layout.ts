/**
 * From a design to the flat pieces a clicker is printed from. The clicker is a stack of layers, each a set of areas at a
 * height, and no two pieces overlap, so a slicer can give every colour its own filament:
 *
 *   body    the whole outline, from the bottom up to the top layer                       (base colour)
 *   top     the top layer inside the border (with holes where the design is let in)      (base colour)
 *   border  a rim around the edge, optionally standing above the top                      (border colour)
 *   design  the colours of the design: flush with the top (inlay), standing on it (raised), or in the bottom of a
 *           recess (engraved)                                                            (one piece per colour)
 *
 * The keyring is a loop added to the outline with a real hole through every piece. Everything here is 2D and in
 * millimetres; `extrude.ts` gives the pieces their height. Pure, so the browser preview, the cart check and the
 * server's print file all use exactly the same result.
 */
import type { Font, NameFontId } from "../name-mesh";
import type { Bounds, Region } from "./poly";
import { boundsOf, difference, intersect, offset, regionArea, removeSmallFeatures, straighten, totalArea, transformRegions, union } from "./poly";
import { circleRing, rayExit, shapeRing } from "./shapes";
import type { ClickerSpec } from "./spec";
import { LIMITS } from "./spec";
import { textRegions } from "./text";

export type PartRole = "body" | "top" | "border" | "design" | "floor";
export type LayoutPart = {
  id: string;
  role: PartRole;
  /** Human name for slicers and the colour list ("Base", "Border", "Colour #ef4444"). */
  name: string;
  color: string;
  regions: Region[];
  z0: number;
  z1: number;
};

export type Layout = {
  parts: LayoutPart[];
  outline: Region[];
  interior: Region[];
  bounds: Bounds;
  keyring: { cx: number; cy: number; loopR: number; holeR: number } | null;
  /** Where each design layer ended up (before it is trimmed to the clicker), for selecting and dragging it. */
  layerShapes: Map<string, Region[]>;
  warnings: string[];
  /** Things that stop the design from being ordered. */
  errors: string[];
  totalHeight: number;
};

export type FontLookup = (id: NameFontId) => Font | undefined;

const lc = (s: string) => s.toLowerCase();

export function buildLayout(spec: ClickerSpec, fonts: FontLookup): Layout {
  const warnings: string[] = [];
  const errors: string[] = [];
  const T = spec.thickness, D = spec.topDepth;
  const zTop0 = T - D;

  // --- outline, with the keyring loop and its hole --------------------------------------------------------------
  const ring = shapeRing(spec.shape, spec.width, spec.height, { corner: spec.corner, points: spec.points });
  const body = union([{ outer: ring, holes: [] }]);
  let outline = body;
  let keyring: Layout["keyring"] = null;
  if (spec.keyring.on) {
    const exit = rayExit(ring, spec.keyring.angle);
    if (exit) {
      const holeR = spec.keyring.hole / 2;
      const loopR = holeR + spec.keyring.wall;
      // push the hole outward until it no longer cuts into the clicker (concave shapes such as the heart's notch)
      let dist = holeR + 1.0;
      let cx = 0, cy = 0;
      for (let i = 0; i < 28; i++) {
        cx = exit.point[0] + exit.dir[0] * dist;
        cy = exit.point[1] + exit.dir[1] * dist;
        if (totalArea(intersect(body, [{ outer: circleRing(cx, cy, holeR), holes: [] }])) < 0.05) break;
        dist += 0.25;
      }
      let loop: Region[] = [{ outer: circleRing(cx, cy, loopR), holes: [] }];
      const hole: Region[] = [{ outer: circleRing(cx, cy, holeR), holes: [] }];
      if (totalArea(intersect(body, loop)) < 8) {
        // a pointed corner meets the loop at a single spot: join them with a neck of round steps from inside the clicker to the loop
        const from: [number, number] = [exit.point[0] - exit.dir[0] * 1.5, exit.point[1] - exit.dir[1] * 1.5];
        const steps = Math.max(2, Math.ceil(Math.hypot(cx - from[0], cy - from[1]) / 0.5));
        const neck = Array.from({ length: steps + 1 }, (_, i) => {
          const t = i / steps;
          return { outer: circleRing(from[0] + (cx - from[0]) * t, from[1] + (cy - from[1]) * t, loopR), holes: [] } as Region;
        });
        loop = union(loop, union(neck));
      }
      if (totalArea(intersect(body, loop)) < 2) warnings.push("The keyring loop barely touches the clicker. Move it closer or make the loop wall thicker.");
      // a notch the loop closes over (the heart's) would be a hidden hollow: fill every gap, then cut the one hole for the ring
      const joined = union(body, loop).map((r) => ({ outer: r.outer, holes: [] as Region["holes"] }));
      outline = difference(joined, hole);
      keyring = { cx, cy, loopR, holeR };
    }
  }

  // --- the border and what is inside it -------------------------------------------------------------------------
  let interior = outline;
  let borderRegions: Region[] = [];
  if (spec.border.on) {
    // thin slivers left where the border closes up (round the keyring loop) are not worth printing as top: drop them
    interior = removeSmallFeatures(offset(outline, -spec.border.width, "miter"), 0.25, 2).regions;
    borderRegions = difference(outline, interior);
    if (interior.length === 0) errors.push("The border is too wide for this size. Make it thinner or the clicker bigger.");
  }

  // --- the design: place every layer, then let the upper layers cover the lower ones -----------------------------
  type Placed = { layerId: string; color: string; regions: Region[] };
  const placed: Placed[] = [];
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
      placed.push({ layerId: layer.id, color: lc(layer.color), regions });
      layerShapes.set(layer.id, regions);
    } else {
      const all: Region[] = [];
      for (const g of layer.regions) {
        const regions = transformRegions(g.shapes, { scale: layer.size, x: layer.x, y: layer.y, rotation: layer.rotation, mirror: layer.mirror });
        if (regions.length) placed.push({ layerId: layer.id, color: lc(g.color), regions });
        all.push(...regions);
      }
      if (all.length) layerShapes.set(layer.id, all);
    }
  }

  const byColour = new Map<string, Region[]>();
  let covered: Region[] = [];
  for (let i = placed.length - 1; i >= 0; i--) {
    const p = placed[i];
    const inside = intersect(p.regions, interior);
    if (inside.length === 0) continue;
    const visible = covered.length ? difference(inside, covered) : inside;
    covered = covered.length ? union(covered, inside) : inside;
    if (visible.length) byColour.set(p.color, [...(byColour.get(p.color) ?? []), ...visible]);
  }
  for (const [layerId, shapes] of layerShapes) {
    if (!totalArea(intersect(shapes, interior))) warnings.push(`“${spec.layers.find((l) => l.id === layerId)?.name || "A layer"}” is outside the clicker.`);
  }

  // drop detail that is too fine to print
  let removed = 0, designArea = 0;
  const designByColour = new Map<string, Region[]>();
  for (const [color, regions] of byColour) {
    const merged = union(regions);
    designArea += totalArea(merged);
    const r = removeSmallFeatures(merged, LIMITS.minFeatureMm / 2, LIMITS.minAreaMm2);
    removed += r.removedArea;
    // rounding in the opening can leave an edge a micrometre outside the clicker: trim it back so pieces meet exactly
    const trimmed = intersect(r.regions, interior);
    if (trimmed.length) designByColour.set(color, trimmed);
  }
  if (designArea > 0 && removed / designArea > 0.02) warnings.push(`Some very fine detail (thinner than ${LIMITS.minFeatureMm} mm) is too small to print and was left out.`);
  const allDesign = union([...designByColour.values()].flat());

  // --- the pieces -----------------------------------------------------------------------------------------------
  const parts: LayoutPart[] = [];
  const base = lc(spec.baseColor);
  const add = (p: LayoutPart) => {
    // Settle the piece before it is extruded: merge overlaps, and open by a hair (0.01 mm) so a hole that only touches
    // its outline along an edge, or a sliver of no width, is cleanly removed; then drop points that lie on a line.
    const regions = straighten(removeSmallFeatures(union(p.regions), 0.01, 0.01).regions).filter((r) => regionArea(r) > 0.01);
    if (regions.length) parts.push({ ...p, regions });
  };
  add({ id: "body", role: "body", name: "Base", color: base, regions: outline, z0: 0, z1: zTop0 });

  const raised = spec.mode === "raised";
  const engraved = spec.mode === "engraved";
  add({ id: "top", role: "top", name: "Base top", color: base, regions: raised || !allDesign.length ? interior : difference(interior, allDesign), z0: zTop0, z1: T });
  if (spec.border.on) add({ id: "border", role: "border", name: "Border", color: lc(spec.border.color), regions: borderRegions, z0: zTop0, z1: T + spec.border.height });

  let engraveDepth = spec.engraveDepth;
  if (engraved && engraveDepth > D - 0.4) {
    engraveDepth = Math.max(0.2, D - 0.4);
    warnings.push(`The engraving was made ${engraveDepth.toFixed(1)} mm deep so a floor is left under it.`);
  }
  for (const [color, regions] of designByColour) {
    if (raised) add({ id: `design-${color}`, role: "design", name: `Colour ${color}`, color, regions, z0: T, z1: T + spec.embossHeight });
    else if (engraved) add({ id: `design-${color}`, role: "floor", name: `Colour ${color}`, color, regions, z0: zTop0, z1: T - engraveDepth });
    else add({ id: `design-${color}`, role: "design", name: `Colour ${color}`, color, regions, z0: zTop0, z1: T });
  }

  const totalHeight = Math.max(T + (raised ? spec.embossHeight : 0), T + (spec.border.on ? spec.border.height : 0));
  return { parts, outline, interior, bounds: boundsOf(outline), keyring, layerShapes, warnings, errors, totalHeight };
}
