/**
 * Keeping the artwork on the key when the shape changes. Switching from one shape to another used to leave the text and
 * pictures where they were, so they could hang off the edge. This puts the artwork's middle on the key's middle and, if it is
 * still too big for the new shape, makes the whole design smaller by just enough to fit. A key that follows its artwork
 * (outline) only needs the centring. Pure.
 */
import type { Tune } from "./fit";
import { buildLayout, type FontLookup } from "./layout";
import { boundsOf, intersect, offset, totalArea, union } from "./poly";
import type { ClickerSpec } from "./spec";
import { scaleDesign } from "./state";

/** How far inside the edge the artwork must stay (mm). */
const MARGIN = 1.0;

const round1 = (n: number) => Math.round(n * 10) / 10;

export function centreAndFitArt(spec: ClickerSpec, fonts: FontLookup, tune: Tune): ClickerSpec {
  if (spec.kind !== "clicker") return spec;
  const artOf = (sp: ClickerSpec) => {
    const l = buildLayout(sp, fonts, tune);
    return { layout: l, art: union([...l.layerShapes.values()].flat()) };
  };
  const first = artOf(spec);
  if (!first.art.length) return spec;

  // 1. the middle of the artwork goes to the middle of the key
  const b = boundsOf(first.art);
  const dx = -(b.minX + b.maxX) / 2, dy = -(b.minY + b.maxY) / 2;
  const centred: ClickerSpec = { ...spec, layers: spec.layers.map((l) => ({ ...l, x: round1(l.x + dx), y: round1(l.y + dy) })) };
  if (spec.shape === "outline") return centred;

  // 2. if it still hangs over the edge, shrink the whole design (about the middle) until it fits
  const fits = (sp: ClickerSpec) => {
    const { layout, art } = artOf(sp);
    const total = totalArea(art);
    return total <= 0 || totalArea(intersect(art, offset(layout.capOutline, -MARGIN, "miter"))) / total > 0.999;
  };
  if (fits(centred)) return centred;
  let lo = 0.15, hi = 1; // lo fits (or is as small as we go), hi does not
  for (let i = 0; i < 9; i++) {
    const mid = (lo + hi) / 2;
    if (fits(scaleDesign(centred, mid))) lo = mid;
    else hi = mid;
  }
  return scaleDesign(centred, lo);
}
