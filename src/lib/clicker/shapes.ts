/**
 * The outlines a clicker can have. Each shape is built in a unit box and stretched to the width and height asked for, so
 * every shape fills exactly width x height and is centred on the origin. Rings are counter-clockwise, in millimetres.
 * Pure.
 */
import type { Pt, Ring } from "./poly";
import { ringArea } from "./poly";

export const SHAPE_IDS = ["circle", "square", "rounded", "pill", "hexagon", "octagon", "diamond", "star", "heart", "shield", "flower", "squircle"] as const;
export type ShapeId = (typeof SHAPE_IDS)[number];

export const SHAPE_LABELS: Record<ShapeId, string> = {
  circle: "Circle",
  square: "Square",
  rounded: "Rounded",
  pill: "Pill",
  hexagon: "Hexagon",
  octagon: "Octagon",
  diamond: "Diamond",
  star: "Star",
  heart: "Heart",
  shield: "Shield",
  flower: "Flower",
  squircle: "Soft square",
};

/** Shapes that use the "points" setting. */
export const SHAPES_WITH_POINTS: ShapeId[] = ["star", "flower"];
/** Shapes that use the "corner" setting. */
export const SHAPES_WITH_CORNER: ShapeId[] = ["square", "rounded"];

export type ShapeOptions = { corner: number; points: number };

const TAU = Math.PI * 2;

/** Normalise a ring to fill [-0.5, 0.5] in both directions and run counter-clockwise. */
function unit(ring: Ring): Ring {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const sx = maxX - minX || 1, sy = maxY - minY || 1;
  const out = ring.map(([x, y]) => [(x - minX) / sx - 0.5, (y - minY) / sy - 0.5] as Pt);
  return ringArea(out) > 0 ? out : out.reverse();
}

/** Points around an arc from angle a0 to a1 (radians), centre (cx, cy), radius r; `steps` segments. */
function arc(cx: number, cy: number, r: number, a0: number, a1: number, steps: number): Ring {
  const out: Ring = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + ((a1 - a0) * i) / steps;
    out.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return out;
}

function roundedBox(w: number, h: number, radius: number): Ring {
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (r < 0.01) return [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const steps = Math.max(4, Math.ceil((r * Math.PI) / 2 / 0.5));
  return [
    ...arc(w / 2 - r, -h / 2 + r, r, -Math.PI / 2, 0, steps),
    ...arc(w / 2 - r, h / 2 - r, r, 0, Math.PI / 2, steps),
    ...arc(-w / 2 + r, h / 2 - r, r, Math.PI / 2, Math.PI, steps),
    ...arc(-w / 2 + r, -h / 2 + r, r, Math.PI, (3 * Math.PI) / 2, steps),
  ];
}

/** Round shapes get as many sides as their size needs (about a 0.4 mm chord), at least 48. */
const roundSides = (w: number, h: number) => Math.min(160, Math.max(48, Math.ceil((Math.PI * (w + h)) / 2 / 0.4)));

/** The outline of a shape as a ring of width x height millimetres centred on the origin. */
export function shapeRing(id: ShapeId, w: number, h: number, opt: Partial<ShapeOptions> = {}): Ring {
  const corner = opt.corner ?? 4;
  const points = Math.max(3, Math.round(opt.points ?? (id === "star" ? 5 : 8)));
  let unitRing: Ring;
  switch (id) {
    case "circle": {
      const n = roundSides(w, h);
      unitRing = Array.from({ length: n }, (_, i) => [Math.cos((i / n) * TAU), Math.sin((i / n) * TAU)] as Pt);
      break;
    }
    case "square":
    case "rounded":
      // the corner is a real radius in millimetres, so build it at full size and scale to the unit box afterwards
      return roundedBox(w, h, id === "square" ? Math.min(corner, 1.5) : corner);
    case "pill":
      return roundedBox(w, h, Math.min(w, h) / 2);
    case "hexagon":
      unitRing = Array.from({ length: 6 }, (_, i) => [Math.cos(TAU / 12 + (i / 6) * TAU + Math.PI / 6), Math.sin(TAU / 12 + (i / 6) * TAU + Math.PI / 6)] as Pt);
      break;
    case "octagon":
      unitRing = Array.from({ length: 8 }, (_, i) => [Math.cos(TAU / 16 + (i / 8) * TAU), Math.sin(TAU / 16 + (i / 8) * TAU)] as Pt);
      break;
    case "diamond":
      unitRing = [[0, -1], [1, 0], [0, 1], [-1, 0]];
      break;
    case "star": {
      const inner = 0.5;
      unitRing = Array.from({ length: points * 2 }, (_, i) => {
        const a = Math.PI / 2 + (i / (points * 2)) * TAU;
        const r = i % 2 === 0 ? 1 : inner;
        return [r * Math.cos(a), r * Math.sin(a)] as Pt;
      });
      break;
    }
    case "heart": {
      const n = 96;
      unitRing = Array.from({ length: n }, (_, i) => {
        const t = (i / n) * TAU;
        return [16 * Math.sin(t) ** 3, 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)] as Pt;
      });
      break;
    }
    case "shield": {
      // flat top; each side is a curve from the top corner to the tip at the bottom
      const side: Ring = Array.from({ length: 25 }, (_, i) => {
        const t = i / 24;
        return [(1 - t) * (1 - t) + 2 * (1 - t) * t, (1 - t) * (1 - t) - 0.7 * (1 - t) * t - t * t] as Pt;
      });
      const left = side.slice(0, -1).reverse().map(([x, y]) => [-x, y] as Pt);
      unitRing = [[-1, 1], [1, 1], ...side.slice(1), ...left.slice(0, -1)];
      break;
    }
    case "flower": {
      const n = roundSides(w, h) * 2;
      unitRing = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * TAU;
        const r = 0.86 + 0.14 * Math.cos(points * a);
        return [r * Math.cos(a), r * Math.sin(a)] as Pt;
      });
      break;
    }
    case "squircle": {
      const n = roundSides(w, h);
      unitRing = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * TAU, c = Math.cos(a), s = Math.sin(a);
        return [Math.sign(c) * Math.abs(c) ** 0.5, Math.sign(s) * Math.abs(s) ** 0.5] as Pt; // |x|^4 + |y|^4 = 1
      });
      break;
    }
  }
  return unit(unitRing).map(([x, y]) => [x * w, y * h] as Pt);
}

/** The point where a ray from the centre at `angleDeg` leaves the ring (the farthest crossing), or null. */
export function rayExit(ring: Ring, angleDeg: number): { point: Pt; dir: Pt } | null {
  const a = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(a), dy = Math.sin(a);
  let best = -1;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i], [x2, y2] = ring[(i + 1) % ring.length];
    const ex = x2 - x1, ey = y2 - y1;
    const den = dx * ey - dy * ex;
    if (Math.abs(den) < 1e-12) continue;
    const t = (x1 * ey - y1 * ex) / den; // along the ray
    const u = (x1 * dy - y1 * dx) / den; // along the edge
    if (t > 0 && u >= 0 && u <= 1 && t > best) best = t;
  }
  return best < 0 ? null : { point: [dx * best, dy * best], dir: [dx, dy] };
}

/** A circle as a counter-clockwise ring. */
export function circleRing(cx: number, cy: number, r: number): Ring {
  const n = Math.min(160, Math.max(32, Math.ceil((TAU * r) / 0.35)));
  return Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * TAU), cy + r * Math.sin((i / n) * TAU)] as Pt);
}
