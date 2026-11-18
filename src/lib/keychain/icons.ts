/**
 * The icon presets for a name keychain. Each icon is drawn in code from circles and polygons (no image files, no
 * tracing), centred on the origin and scaled so it is 1 unit tall (or 1.4 wide if it is a wide one). The layout scales
 * it to millimetres. Solid shapes only: the parts that look "cut out" (an eye, a mouth) are real holes that show the
 * plate underneath. To add an icon: add its id to `ICON_IDS`, a label to `ICON_LABELS` and a builder to `BUILDERS`.
 * Pure: runs in the browser (preview) and on the server (print file).
 */
import type { Region, Ring } from "../clicker/poly";
import { boundsOf, difference, intersect, transformRegions, union } from "../clicker/poly";
import { shapeRing } from "../clicker/shapes";

export const ICON_IDS = ["heart", "star", "flower", "paw", "crown", "bolt", "moon", "sun", "cloud", "smiley", "cat", "bone", "music", "diamond", "leaf", "fish"] as const;
export type IconId = (typeof ICON_IDS)[number];

export const ICON_LABELS: Record<IconId, string> = {
  heart: "Heart", star: "Star", flower: "Flower", paw: "Paw", crown: "Crown", bolt: "Lightning", moon: "Moon", sun: "Sun",
  cloud: "Cloud", smiley: "Smiley", cat: "Cat", bone: "Bone", music: "Music", diamond: "Diamond", leaf: "Leaf", fish: "Fish",
};

const TAU = Math.PI * 2;
const R = (outer: Ring): Region => ({ outer, holes: [] });
/** An ellipse (rotated by `rot` radians) as one region. 96 sides, so it stays smooth even at 20 mm. */
const ell = (cx: number, cy: number, rx: number, ry: number, rot = 0): Region =>
  R(Array.from({ length: 96 }, (_, i) => {
    const a = (i / 96) * TAU, x = rx * Math.cos(a), y = ry * Math.sin(a);
    return [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)] as [number, number];
  }));
const circ = (cx: number, cy: number, r: number) => ell(cx, cy, r, r);
const poly = (pts: [number, number][]): Region => R(pts);
/** A rectangle from its centre, rotated by `rot` radians. */
const rect = (cx: number, cy: number, w: number, h: number, rot = 0): Region =>
  R(([[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as [number, number][]).map(([x, y]) => [cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)] as [number, number]));
const U = (...r: Region[]) => union(r);

const BUILDERS: Record<IconId, () => Region[]> = {
  heart: () => [R(shapeRing("heart", 1, 0.92))],
  star: () => [R(shapeRing("star", 1, 0.96, { points: 5 }))],
  flower: () => U(...Array.from({ length: 6 }, (_, i) => circ(0.27 * Math.cos((i / 6) * TAU), 0.27 * Math.sin((i / 6) * TAU), 0.24)), circ(0, 0, 0.2)),
  paw: () => U(ell(0, -0.17, 0.3, 0.26), ell(-0.38, 0.12, 0.11, 0.16, 0.5), ell(-0.14, 0.34, 0.11, 0.16, 0.15), ell(0.14, 0.34, 0.11, 0.16, -0.15), ell(0.38, 0.12, 0.11, 0.16, -0.5)),
  crown: () => U(poly([[-0.5, -0.4], [0.5, -0.4], [0.5, 0.3], [0.25, -0.02], [0, 0.4], [-0.25, -0.02], [-0.5, 0.3]]), circ(-0.5, 0.33, 0.09), circ(0, 0.43, 0.09), circ(0.5, 0.33, 0.09)),
  bolt: () => [poly([[0, 0.5], [0.3, 0.5], [0.1, 0.1], [0.32, 0.1], [-0.12, -0.5], [-0.02, -0.02], [-0.28, -0.02]])],
  moon: () => difference([circ(0, 0, 0.5)], [circ(0.22, 0.12, 0.42)]),
  sun: () => U(circ(0, 0, 0.26), ...Array.from({ length: 8 }, (_, i) => rect(0.4 * Math.cos((i / 8) * TAU), 0.4 * Math.sin((i / 8) * TAU), 0.2, 0.1, (i / 8) * TAU))),
  cloud: () => U(circ(-0.22, -0.02, 0.25), circ(0.04, 0.1, 0.3), circ(0.28, -0.04, 0.22), rect(0.02, -0.12, 0.74, 0.26)),
  smiley: () => difference([circ(0, 0, 0.5)], [...U(circ(-0.17, 0.12, 0.07), circ(0.17, 0.12, 0.07)), ...difference([circ(0, 0.02, 0.3)], [circ(0, 0.1, 0.27)])]),
  cat: () => difference(U(ell(0, -0.06, 0.5, 0.4), poly([[-0.48, 0.12], [-0.4, 0.5], [-0.12, 0.3]]), poly([[0.48, 0.12], [0.4, 0.5], [0.12, 0.3]])), [circ(-0.18, -0.02, 0.06), circ(0.18, -0.02, 0.06)]),
  bone: () => U(rect(0, 0, 0.7, 0.2), circ(-0.4, 0.13, 0.13), circ(-0.4, -0.13, 0.13), circ(0.4, 0.13, 0.13), circ(0.4, -0.13, 0.13)),
  music: () => U(ell(-0.2, -0.32, 0.22, 0.16, 0.45), rect(-0.01, 0.08, 0.1, 0.8), poly([[-0.01, 0.48], [0.3, 0.2], [0.34, 0.02], [0.2, 0.18], [-0.01, 0.26]])),
  diamond: () => [R(shapeRing("diamond", 0.8, 1))],
  leaf: () => union([...transformRegions(intersect([circ(-0.34, 0, 0.6)], [circ(0.34, 0, 0.6)]), { rotation: 45, scale: 1.05 }), rect(-0.4, -0.4, 0.34, 0.07, Math.PI / 4)]),
  fish: () => U(ell(-0.1, 0, 0.4, 0.26), poly([[0.2, 0], [0.5, 0.26], [0.5, -0.26]])),
};

const cache = new Map<IconId, Region[]>();

/** The icon as regions, centred on the origin, 1 unit tall (never wider than 1.4). */
export function iconRegions(id: IconId): Region[] {
  const hit = cache.get(id);
  if (hit) return hit;
  const raw = union(BUILDERS[id]());
  const b = boundsOf(raw);
  const w = b.maxX - b.minX, h = b.maxY - b.minY;
  const k = Math.min(1 / h, 1.4 / w);
  const out = transformRegions(raw, { scale: k }); // scale about the origin, then centre
  const c = boundsOf(out);
  const centred = transformRegions(out, { x: -(c.minX + c.maxX) / 2, y: -(c.minY + c.maxY) / 2 });
  cache.set(id, centred);
  return centred;
}

/** SVG path data for one icon (for the picker buttons), in a 100 x 100 box, y down. */
export function iconPath(id: IconId): string {
  return iconRegions(id)
    .map((r) => [r.outer, ...r.holes].map((ring) => "M" + ring.map(([x, y]) => `${(50 + x * 90).toFixed(1)} ${(50 - y * 90).toFixed(1)}`).join("L") + "Z").join(""))
    .join("");
}
