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

/** Cute animals, like the ones on bracelet charms. */
export const ANIMAL_ICONS = ["cat", "bunny", "bear", "panda", "dog", "pig", "duck", "chick", "penguin", "frog", "fox", "owl", "butterfly", "bee", "ladybug", "whale", "dino", "paw", "fish", "bone"] as const;
/** Charms and simple shapes. */
export const CHARM_ICONS = ["heart", "star", "bow", "strawberry", "cherries", "cupcake", "icecream", "rainbow", "mushroom", "clover", "flower", "crown", "bolt", "moon", "sun", "cloud", "smiley", "music", "diamond", "leaf"] as const;
export const ICON_IDS = [...ANIMAL_ICONS, ...CHARM_ICONS] as const;
export type IconId = (typeof ICON_IDS)[number];
export const ICON_GROUPS: { label: string; ids: readonly IconId[] }[] = [
  { label: "Cute animals", ids: ANIMAL_ICONS },
  { label: "Charms and shapes", ids: CHARM_ICONS },
];

export const ICON_LABELS: Record<IconId, string> = {
  cat: "Cat", bunny: "Bunny", bear: "Bear", panda: "Panda", dog: "Puppy", pig: "Piggy", duck: "Duck", chick: "Chick", penguin: "Penguin", frog: "Frog", fox: "Fox", owl: "Owl",
  butterfly: "Butterfly", bee: "Bee", ladybug: "Ladybug", whale: "Whale", dino: "Dino", paw: "Paw", fish: "Fish", bone: "Bone",
  heart: "Heart", star: "Star", bow: "Bow", strawberry: "Strawberry", cherries: "Cherries", cupcake: "Cupcake", icecream: "Ice cream", rainbow: "Rainbow", mushroom: "Mushroom",
  clover: "Clover", flower: "Flower", crown: "Crown", bolt: "Lightning", moon: "Moon", sun: "Sun", cloud: "Cloud", smiley: "Smiley", music: "Music", diamond: "Diamond", leaf: "Leaf",
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
  bunny: () => difference(U(ell(0, -0.2, 0.34, 0.28), ell(-0.15, 0.22, 0.1, 0.28, 0.12), ell(0.15, 0.22, 0.1, 0.28, -0.12)), [circ(-0.12, -0.18, 0.045), circ(0.12, -0.18, 0.045), ell(0, -0.3, 0.05, 0.035), ell(-0.15, 0.2, 0.04, 0.17, 0.12), ell(0.15, 0.2, 0.04, 0.17, -0.12)]),
  bear: () => difference(U(ell(0, -0.05, 0.4, 0.36), circ(-0.3, 0.3, 0.14), circ(0.3, 0.3, 0.14)), [circ(-0.15, 0.02, 0.05), circ(0.15, 0.02, 0.05), ell(0, -0.12, 0.08, 0.055), circ(-0.3, 0.3, 0.06), circ(0.3, 0.3, 0.06)]),
  panda: () => difference(U(ell(0, -0.05, 0.4, 0.36), circ(-0.32, 0.3, 0.13), circ(0.32, 0.3, 0.13)), [...difference([ell(-0.15, 0.02, 0.1, 0.13, 0.4)], [circ(-0.14, 0.01, 0.04)]), ...difference([ell(0.15, 0.02, 0.1, 0.13, -0.4)], [circ(0.14, 0.01, 0.04)]), ell(0, -0.14, 0.07, 0.05)]),
  dog: () => difference(U(ell(0, 0, 0.32, 0.36), ell(-0.37, 0.02, 0.12, 0.3, -0.25), ell(0.37, 0.02, 0.12, 0.3, 0.25)), [circ(-0.12, 0.06, 0.045), circ(0.12, 0.06, 0.045), ell(0, -0.1, 0.09, 0.065), rect(0, -0.2, 0.035, 0.08)]),
  pig: () => difference(U(circ(0, -0.02, 0.42), poly([[-0.4, 0.14], [-0.28, 0.5], [-0.05, 0.36]]), poly([[0.4, 0.14], [0.28, 0.5], [0.05, 0.36]])), [circ(-0.16, 0.1, 0.045), circ(0.16, 0.1, 0.045), ...difference([ell(0, -0.1, 0.17, 0.12)], [circ(-0.06, -0.1, 0.035), circ(0.06, -0.1, 0.035)])]),
  duck: () => difference(U(ell(-0.05, -0.2, 0.42, 0.28), circ(0.12, 0.17, 0.24), poly([[0.3, 0.2], [0.55, 0.12], [0.3, 0.05]]), poly([[-0.45, -0.1], [-0.58, 0.08], [-0.3, -0.05]])), [circ(0.18, 0.24, 0.04)]),
  chick: () => difference(U(circ(0, -0.04, 0.42), ell(0, 0.46, 0.05, 0.1), ell(-0.09, 0.44, 0.04, 0.09, 0.6), ell(0.09, 0.44, 0.04, 0.09, -0.6), rect(-0.13, -0.5, 0.05, 0.12), rect(0.13, -0.5, 0.05, 0.12)), [circ(-0.15, 0.06, 0.045), circ(0.15, 0.06, 0.045), poly([[-0.07, -0.04], [0.07, -0.04], [0, -0.14]])]),
  penguin: () => difference(U(ell(0, 0, 0.34, 0.5), ell(-0.37, -0.08, 0.08, 0.22, 0.3), ell(0.37, -0.08, 0.08, 0.22, -0.3)), [ell(0, -0.14, 0.2, 0.3), circ(-0.1, 0.25, 0.04), circ(0.1, 0.25, 0.04)]),
  frog: () => difference(U(ell(0, -0.12, 0.46, 0.3), circ(-0.25, 0.2, 0.17), circ(0.25, 0.2, 0.17)), [circ(-0.25, 0.22, 0.065), circ(0.25, 0.22, 0.065), ...difference([circ(0, -0.1, 0.24)], [circ(0, -0.02, 0.22)])]),
  fox: () => difference(U(ell(0, 0.1, 0.4, 0.3), poly([[-0.4, 0.1], [0, -0.48], [0.4, 0.1]]), poly([[-0.48, 0.5], [-0.46, 0.08], [-0.15, 0.28]]), poly([[0.48, 0.5], [0.46, 0.08], [0.15, 0.28]])), [circ(-0.17, 0.08, 0.045), circ(0.17, 0.08, 0.045), circ(0, -0.34, 0.05)]),
  owl: () => difference(U(ell(0, -0.02, 0.38, 0.46), poly([[-0.38, 0.3], [-0.36, 0.52], [-0.12, 0.42]]), poly([[0.38, 0.3], [0.36, 0.52], [0.12, 0.42]])), [...difference([circ(-0.17, 0.12, 0.13)], [circ(-0.17, 0.12, 0.05)]), ...difference([circ(0.17, 0.12, 0.13)], [circ(0.17, 0.12, 0.05)]), poly([[-0.05, -0.04], [0.05, -0.04], [0, -0.14]])]),
  butterfly: () => difference(U(ell(-0.27, 0.15, 0.25, 0.3, 0.5), ell(0.27, 0.15, 0.25, 0.3, -0.5), ell(-0.2, -0.22, 0.18, 0.22, -0.4), ell(0.2, -0.22, 0.18, 0.22, 0.4), circ(0, 0.42, 0.06)), [rect(0, -0.05, 0.05, 0.6), circ(-0.3, 0.2, 0.06), circ(0.3, 0.2, 0.06)]),
  bee: () => difference(U(ell(0, -0.08, 0.3, 0.38), ell(-0.27, 0.33, 0.13, 0.17, 0.5), ell(0.27, 0.33, 0.13, 0.17, -0.5), poly([[-0.05, -0.42], [0.05, -0.42], [0, -0.55]])), [rect(0, 0, 0.8, 0.07), rect(0, -0.17, 0.8, 0.07), circ(-0.1, 0.14, 0.035), circ(0.1, 0.14, 0.035)]),
  ladybug: () => difference(U(circ(0, -0.04, 0.44), ell(0, 0.4, 0.2, 0.12)), [rect(0, -0.1, 0.045, 0.7), circ(-0.2, 0.1, 0.07), circ(0.2, 0.1, 0.07), circ(-0.22, -0.2, 0.06), circ(0.22, -0.2, 0.06), rect(0, 0.3, 0.6, 0.035)]),
  whale: () => difference(U(ell(-0.05, -0.08, 0.45, 0.3), poly([[0.28, -0.05], [0.5, 0.3], [0.4, 0.34], [0.24, 0.12]]), poly([[0.3, -0.06], [0.52, -0.2], [0.34, -0.18]]), circ(-0.16, 0.3, 0.05), circ(-0.08, 0.4, 0.05), circ(-0.24, 0.4, 0.05)), [circ(-0.28, -0.02, 0.04)]),
  dino: () => difference(U(ell(0, -0.1, 0.36, 0.24), ell(-0.3, 0.08, 0.1, 0.2, -0.3), ell(-0.36, 0.26, 0.15, 0.1), poly([[0.3, -0.05], [0.52, -0.22], [0.3, -0.2]]), poly([[-0.1, 0.08], [0, 0.28], [0.1, 0.08]]), poly([[0.1, 0.06], [0.2, 0.24], [0.28, 0.0]]), rect(-0.2, -0.34, 0.12, 0.2), rect(0.2, -0.34, 0.12, 0.2)), [circ(-0.34, 0.29, 0.03)]),
  bow: () => U(ell(-0.26, 0.02, 0.26, 0.22, 0.3), ell(0.26, 0.02, 0.26, 0.22, -0.3), circ(0, 0, 0.11), poly([[-0.06, -0.06], [-0.24, -0.5], [-0.04, -0.4]]), poly([[0.06, -0.06], [0.24, -0.5], [0.04, -0.4]])),
  strawberry: () => difference(U(circ(0, 0.05, 0.4), poly([[-0.4, 0.02], [0, -0.5], [0.4, 0.02]]), ell(-0.18, 0.46, 0.15, 0.07, -0.3), ell(0.18, 0.46, 0.15, 0.07, 0.3), circ(0, 0.46, 0.07)), [circ(-0.17, 0.12, 0.035), circ(0.17, 0.12, 0.035), circ(0, 0.02, 0.035), circ(-0.12, -0.2, 0.035), circ(0.12, -0.2, 0.035), circ(0, -0.32, 0.035)]),
  cherries: () => U(circ(-0.2, -0.26, 0.22), circ(0.22, -0.22, 0.22), rect(-0.1, 0.12, 0.07, 0.7, -0.3), rect(0.13, 0.15, 0.07, 0.62, 0.15), ell(0.27, 0.4, 0.17, 0.07, 0.3)),
  cupcake: () => difference(U(poly([[-0.32, -0.5], [0.32, -0.5], [0.4, -0.08], [-0.4, -0.08]]), ell(0, 0.0, 0.44, 0.17), circ(0, 0.22, 0.24), circ(0, 0.46, 0.06)), [rect(0, -0.1, 0.9, 0.04), rect(-0.12, -0.3, 0.04, 0.3), rect(0.12, -0.3, 0.04, 0.3)]),
  icecream: () => difference(U(poly([[-0.24, -0.06], [0.24, -0.06], [0, -0.5]]), circ(0, 0.2, 0.28), ell(0, -0.02, 0.32, 0.1), circ(0.1, 0.5, 0.05)), [rect(0, -0.08, 0.7, 0.035), circ(-0.08, 0.26, 0.035), circ(0.1, 0.18, 0.035)]),
  rainbow: () => union([...intersect(difference([circ(0, -0.1, 0.5)], [circ(0, -0.1, 0.38)]), [rect(0, 0.3, 1.2, 0.8)]), ...intersect(difference([circ(0, -0.1, 0.32)], [circ(0, -0.1, 0.2)]), [rect(0, 0.3, 1.2, 0.8)]), ...intersect([circ(0, -0.1, 0.14)], [rect(0, 0.3, 1.2, 0.8)])]),
  mushroom: () => difference(U(...intersect([ell(0, 0.08, 0.5, 0.42)], [rect(0, 0.25, 1.2, 0.6)]), rect(0, -0.25, 0.3, 0.38), ell(0, -0.44, 0.22, 0.07)), [circ(-0.2, 0.17, 0.07), circ(0.2, 0.2, 0.06), circ(0, 0.33, 0.055)]),
  clover: () => U(circ(-0.17, 0.17, 0.2), circ(0.17, 0.17, 0.2), circ(-0.17, -0.17, 0.2), circ(0.17, -0.17, 0.2), poly([[0.04, -0.08], [0.14, -0.5], [0.22, -0.48], [0.1, -0.04]])),
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
  leaf: () => transformRegions(intersect([circ(-0.34, 0, 0.6)], [circ(0.34, 0, 0.6)]), { rotation: 45, scale: 1.05 }),
  fish: () => difference(U(ell(-0.1, 0, 0.4, 0.27), poly([[0.18, 0.0], [0.5, 0.26], [0.42, 0], [0.5, -0.26]])), [circ(-0.3, 0.06, 0.04)]),
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
  const regions = iconRegions(id);
  const b = boundsOf(regions);
  const k = 90 / Math.max(1, b.maxX - b.minX); // wide icons are shrunk to fit the box
  return regions
    .map((r) => [r.outer, ...r.holes].map((ring) => "M" + ring.map(([x, y]) => `${(50 + x * k).toFixed(1)} ${(50 - y * k).toFixed(1)}`).join("L") + "Z").join(""))
    .join("");
}
