/**
 * The flat pieces of a name keychain, with their heights: the plate (with its keyring loop and hole), the name, the icon
 * and, on a bag tag, a raised frame. Each piece is one colour. The pieces use the clicker's `LayoutPart` shape, so the same
 * extruder (`extrudeLayout`), geometry cache and 3MF writer build the solids. Everything is millimetres, Y up, and the
 * result is the same in the browser (preview) and on the server (print file). Pure; the caller supplies the parsed fonts.
 */
import type { Font, NameFontId } from "../name-mesh";
import { checkText, pathToShapes } from "../name-mesh";
import type { LayoutPart } from "../clicker/layout";
import { boxRing } from "../clicker/fit";
import { boundsOf, difference, intersect, offset, regionArea, removeSmallFeatures, straighten, totalArea, transformRegions, union, type Bounds, type Region, type Ring } from "../clicker/poly";
import { circleRing, rayExit } from "../clicker/shapes";
import { iconRegions } from "./icons";
import { LIMITS, type KeychainConfig, type KeychainSpec } from "./spec";

export type FontLookup = (id: NameFontId) => Font | undefined;

export type KeychainLayout = {
  parts: LayoutPart[];
  /** The plate with its keyring loop. */
  bounds: Bounds;
  widthMm: number;
  /** The longest side of the plate (what the price follows). */
  lengthMm: number;
  totalHeight: number;
  ring: { cx: number; cy: number; holeR: number; loopR: number } | null;
  warnings: string[];
  /** Things that stop the design from being ordered. */
  errors: string[];
};

const EM = 100;
const ZERO: Bounds = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
const lc = (s: string) => s.toLowerCase();
const region = (outer: Ring): Region => ({ outer, holes: [] });

/**
 * Lines of letters as outlines, centred on the origin. The size is the height of a capital H measured from the font itself
 * (some fonts report a wrong cap height in their tables). Letters that touch are merged.
 */
export function keychainText(font: Font, text: string, opt: { size: number; spacing: number; lineGap: number }): { regions: Region[] } | { error: string } {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);
  if (lines.length === 0) return { regions: [] };
  for (const line of lines) {
    const bad = checkText(font, line);
    if (bad) return { error: bad };
  }
  const hBox = font.charToGlyph("H").getBoundingBox();
  const capUnits = (hBox.y2 - hBox.y1) > 0 ? (hBox.y2 - hBox.y1) * (EM / font.unitsPerEm) : font.unitsPerEm * 0.7 * (EM / font.unitsPerEm);
  const s = opt.size / capUnits; // millimetres per font unit at EM
  const advance = opt.size * 1.5 + opt.lineGap;
  const letterSpacing = opt.spacing / (s * EM);
  const all: Region[] = [];
  lines.forEach((line, i) => {
    const path = font.getPath(line, 0, 0, EM, { letterSpacing });
    const box = path.getBoundingBox();
    const cx = (box.x1 + box.x2) / 2;
    const baseline = -i * advance;
    for (const shape of pathToShapes(path)) {
      const { shape: outer, holes } = shape.extractPoints(6);
      const toRing = (pts: { x: number; y: number }[]): Ring => pts.map((p) => [(p.x - cx) * s, p.y * s + baseline] as [number, number]);
      all.push({ outer: toRing(outer), holes: holes.map(toRing) });
    }
  });
  return { regions: centred(union(all)) };
}

/** The regions moved so the middle of their box is the origin. */
function centred(regions: Region[]): Region[] {
  if (!regions.length) return regions;
  const b = boundsOf(regions);
  return transformRegions(regions, { x: -(b.minX + b.maxX) / 2, y: -(b.minY + b.maxY) / 2 });
}

/** The convex hull of some regions' points (Andrew's monotone chain), counter-clockwise. */
function hullOf(regions: Region[]): Ring {
  const pts = regions.flatMap((r) => r.outer).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Ring = [], upper: Ring = [];
  for (const p of pts) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop(); lower.push(p); }
  for (const p of [...pts].reverse()) { while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop(); upper.push(p); }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/**
 * A plate that follows the letters: gaps between letters and words are closed up and holes (the inside of an "o") are
 * filled so it is one solid shape, then it is grown by the border. Pieces too far apart to join are wrapped in one shape.
 */
function followOutline(art: Region[], border: number): Region[] {
  let joined: Region[] = [];
  for (const bridge of [1, 1.8, 3, 4.5, 7, 10]) {
    joined = union(offset(offset(art, bridge), -bridge).map((r) => ({ outer: r.outer, holes: [] })));
    if (joined.length === 1) break;
  }
  if (joined.length !== 1) joined = [region(hullOf(joined.length ? joined : art))];
  return union(offset(joined, border).map((r) => ({ outer: r.outer, holes: [] })));
}

/**
 * Drops a point that sits within `tol` mm of the one before it. Offsetting leaves the odd micrometre-sized jog on a long
 * curve, and the triangulator that fills a piece's top and bottom cannot cope with points that close together (it loses a
 * triangle and the solid is no longer closed). Four micrometres is far below anything a printer can show.
 */
function dropNear(regions: Region[], tol = 0.004): Region[] {
  const clean = (ring: Ring): Ring => {
    const out: Ring = [];
    for (const p of ring) if (!out.length || Math.hypot(p[0] - out[out.length - 1][0], p[1] - out[out.length - 1][1]) > tol) out.push(p);
    while (out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= tol) out.pop();
    return out;
  };
  return regions.map((r) => ({ outer: clean(r.outer), holes: r.holes.map(clean).filter((h) => h.length >= 3) })).filter((r) => r.outer.length >= 3);
}

/** What comes back while a font is still loading, or when there is nothing to draw. */
function nothing(error?: string): KeychainLayout {
  return { parts: [], bounds: ZERO, widthMm: 0, lengthMm: 0, totalHeight: 0, ring: null, warnings: [], errors: error ? [error] : [] };
}

export function buildKeychainLayout(spec: KeychainSpec, fonts: FontLookup): KeychainLayout {
  const warnings: string[] = [];
  const font = fonts(spec.font);
  const subText = spec.style === "tag" ? spec.sub.trim() : "";
  const subFont = subText ? fonts("bold") : undefined;
  if (!font || (subText && !subFont)) return nothing(); // still loading in the browser
  if (!spec.text.trim()) return nothing("Type a name.");

  // --- the letters, the icon and the small line, each in its place ---------------------------------------------
  const t = keychainText(font, spec.text, { size: spec.size, spacing: spec.spacing, lineGap: spec.lineGap });
  if ("error" in t) return nothing(t.error);
  let text = t.regions;
  if (text.length === 0) return nothing("Type a name.");
  let tb = boundsOf(text);

  let sub: Region[] = [];
  if (subText && subFont) {
    const s = keychainText(subFont, subText, { size: spec.subSize, spacing: 0, lineGap: 0 });
    if ("error" in s) return nothing(`Small line: ${s.error}`);
    const sb = boundsOf(s.regions);
    // under the name, centred, with a gap that grows a little with the letters
    sub = transformRegions(s.regions, { x: -(sb.minX + sb.maxX) / 2, y: tb.minY - Math.max(2.2, spec.size * 0.3) - sb.maxY });
  }

  let icon: Region[] = [];
  if (spec.style === "icon") {
    const iconH = Math.max(4, (tb.maxY - tb.minY) * spec.iconScale);
    const ic = transformRegions(iconRegions(spec.icon), { scale: iconH });
    const ib = boundsOf(ic);
    const gap = Math.max(1.8, spec.size * 0.18);
    const cy = (tb.minY + tb.maxY) / 2;
    const x = spec.iconSide === "left" ? tb.minX - gap - ib.maxX : tb.maxX + gap - ib.minX;
    icon = transformRegions(ic, { x, y: cy });
  }

  // centre the whole design on the origin
  const all0 = union([...text, ...sub, ...icon]);
  const ab = boundsOf(all0);
  const shift = { x: -(ab.minX + ab.maxX) / 2, y: -(ab.minY + ab.maxY) / 2 };
  text = transformRegions(text, shift);
  sub = transformRegions(sub, shift);
  icon = transformRegions(icon, shift);
  tb = boundsOf(text);

  // drop detail that is too fine to print
  const min = LIMITS.minFeatureMm / 2;
  const settle = (regions: Region[]): Region[] => {
    if (!regions.length) return regions;
    const merged = union(regions);
    const r = removeSmallFeatures(merged, min, 0.15);
    if (totalArea(merged) > 0 && r.removedArea / totalArea(merged) > 0.02) warnings.push(`Some very fine detail (thinner than ${LIMITS.minFeatureMm} mm) is too small to print and was left out. A bolder font prints better.`);
    return r.regions;
  };
  text = settle(union(text, sub));
  icon = settle(icon);
  const art = union(text, icon);
  if (art.length === 0) return nothing("Nothing to print. Try a bolder font or bigger letters.");

  // --- the plate ------------------------------------------------------------------------------------------------
  const frame = spec.style === "tag" ? LIMITS.frameMm : 0;
  const expand = spec.border + frame;
  const ab2 = boundsOf(art);
  const w = ab2.maxX - ab2.minX + 2 * expand, h = ab2.maxY - ab2.minY + 2 * expand;
  let outline: Region[];
  const cw = ab2.maxX - ab2.minX, ch = ab2.maxY - ab2.minY, mx = (ab2.minX + ab2.maxX) / 2, my = (ab2.minY + ab2.maxY) / 2;
  if (spec.plate === "follow") outline = followOutline(art, expand);
  else if (spec.plate === "rounded") outline = [region(boxRing(mx, my, w, h, Math.min(expand, h / 2)))]; // the letters' box grown by the border: every corner keeps the full border
  else {
    // a pill: the round ends would cut off the corners of the letters' box, so it is made a little longer, just enough that
    // the corners keep at least a millimetre of plate (and clear the frame)
    const r = h / 2;
    const keep = frame + 1;
    const inner = ch / 2 + expand - keep;
    const dx = Math.sqrt(Math.max(0, inner * inner - (ch / 2) * (ch / 2)));
    outline = [region(boxRing(mx, my, 2 * (cw / 2 - dx + r), h, r))];
  }
  outline = union(outline);

  // --- the keyring: a loop of plate with one real hole ---------------------------------------------------------
  let ring: KeychainLayout["ring"] = null;
  let tab: Region[] = [];
  if (spec.ring.pos !== "none") {
    const biggest = outline.slice().sort((a, b) => regionArea(b) - regionArea(a))[0];
    const angle = spec.ring.pos === "left" ? 180 : spec.ring.pos === "right" ? 0 : 90;
    const exit = biggest ? rayExit(biggest.outer, angle) : null;
    if (exit) {
      const holeR = spec.ring.hole / 2;
      const loopR = holeR + spec.ring.wall;
      let dist = holeR + 1.0;
      let cx = 0, cy = 0;
      for (let i = 0; i < 40; i++) {
        cx = exit.point[0] + exit.dir[0] * dist;
        cy = exit.point[1] + exit.dir[1] * dist;
        // keep a full ring of plate round the hole, and the hole clear of the plate's own edge
        if (totalArea(intersect(outline, [region(circleRing(cx, cy, holeR + 1.2))])) < 0.05) break;
        dist += 0.25;
      }
      let loop: Region[] = [region(circleRing(cx, cy, loopR))];
      if (totalArea(intersect(outline, loop)) < 8) {
        // the loop meets the plate at one spot: join them with a neck of round steps from inside the plate
        const from: [number, number] = [exit.point[0] - exit.dir[0] * 1.5, exit.point[1] - exit.dir[1] * 1.5];
        const steps = Math.max(2, Math.ceil(Math.hypot(cx - from[0], cy - from[1]) / 0.5));
        loop = union(loop, union(Array.from({ length: steps + 1 }, (_, i) => region(circleRing(from[0] + ((cx - from[0]) * i) / steps, from[1] + ((cy - from[1]) * i) / steps, loopR)))));
      }
      tab = loop; // overlaps the plate, so the two merge into one piece (shapes that only share an edge are not merged reliably)
      ring = { cx, cy, holeR, loopR };
    }
  }
  const plate = ring ? difference(union(outline, tab), [region(circleRing(ring.cx, ring.cy, ring.holeR))]) : outline;
  const bounds = boundsOf(plate);

  // --- the pieces -----------------------------------------------------------------------------------------------
  const parts: LayoutPart[] = [];
  const add = (p: LayoutPart) => {
    const regions = straighten(dropNear(removeSmallFeatures(union(p.regions), 0.03, 0.01).regions)).filter((r) => regionArea(r) > 0.01);
    if (regions.length) parts.push({ ...p, regions });
  };
  const z1 = spec.baseMm, z2 = spec.baseMm + spec.textMm;
  add({ id: "k-plate", object: "housing", role: "floor", name: "Plate", color: lc(spec.baseColor), regions: plate, z0: 0, z1 });
  if (frame) add({ id: "k-frame", object: "housing", role: "rim", name: "Frame", color: lc(spec.frameColor), regions: difference(outline, offset(outline, -frame)), z0: z1, z1: z2 });
  add({ id: "k-text", object: "housing", role: "art", name: "Name", color: lc(spec.textColor), regions: text, z0: z1, z1: z2 });
  if (icon.length) add({ id: "k-icon", object: "housing", role: "art", name: "Icon", color: lc(spec.iconColor), regions: icon, z0: z1, z1: z2 });

  return { parts, bounds, widthMm: bounds.maxX - bounds.minX, lengthMm: Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY), totalHeight: z2, ring, warnings, errors: [] };
}

/** Why a built keychain cannot be ordered with these settings (too long), or null. */
export function layoutProblem(layout: KeychainLayout, cfg: Pick<KeychainConfig, "maxLengthMm">): string | null {
  if (layout.errors.length) return layout.errors[0];
  if (layout.lengthMm > cfg.maxLengthMm + 0.05) return `The keychain can be at most ${cfg.maxLengthMm} mm long. This one is ${Math.round(layout.lengthMm)} mm. Make the letters smaller or the name shorter.`;
  return null;
}

// ---------------------------------------------------------------------------------------------------------------------
// A flat picture (SVG) of the keychain from above, for the cart, orders and the admin
// ---------------------------------------------------------------------------------------------------------------------

const num = (n: number) => (Math.round(n * 100) / 100).toString();
const pathOf = (regions: Region[]) => regions.map((r) => [r.outer, ...r.holes].map((ring) => "M" + ring.map(([x, y]) => `${num(x)} ${num(y)}`).join("L") + "Z").join("")).join("");

export function keychainToSvg(layout: KeychainLayout, opts: { margin?: number; title?: string } = {}): string {
  const m = opts.margin ?? 2;
  const b = layout.bounds;
  const w = b.maxX - b.minX + m * 2, h = b.maxY - b.minY + m * 2;
  const paints = layout.parts
    .slice()
    .sort((a, c) => a.z0 - c.z0)
    .map((p) => `<path d="${pathOf(p.regions)}" fill="${p.color}" fill-rule="evenodd" stroke="rgba(0,0,0,${p.z0 === 0 ? 0.22 : 0.3})" stroke-width="0.14"/>`)
    .join("");
  const title = opts.title ? `<title>${opts.title.replace(/[<>&"]/g, "")}</title>` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(b.minX - m)} ${num(-b.maxY - m)} ${num(w)} ${num(h)}" role="img">${title}<g transform="scale(1 -1)">${paints}</g></svg>`;
}
