/**
 * 2D polygons for the clicker designer: union, difference, intersection and offsetting (border widths, clearances),
 * on top of Clipper (clipper-lib), which works on whole numbers, so millimetres are scaled to micrometres.
 *
 * A `Region` is one solid area: an outer ring (counter-clockwise) with holes (clockwise), in millimetres, Y up.
 * Pure: no DOM, runs in the browser (preview) and on the server (the print file) with the same results.
 */
import ClipperLib from "clipper-lib";

export type Pt = [number, number];
export type Ring = Pt[];
export type Region = { outer: Ring; holes: Ring[] };

const SCALE = 1000; // 1 mm = 1000 units
/** How closely a rounded offset follows the true arc (micrometres). */
const ARC_TOLERANCE = 12;

type IP = { X: number; Y: number };
const toPath = (r: Ring): IP[] => r.map(([x, y]) => ({ X: Math.round(x * SCALE), Y: Math.round(y * SCALE) }));
const fromPath = (p: IP[]): Ring => p.map((q) => [q.X / SCALE, q.Y / SCALE] as Pt);

/** Signed area of a ring in mm² (positive when counter-clockwise). */
export function ringArea(r: Ring): number {
  let a = 0;
  for (let i = 0; i < r.length; i++) {
    const [x1, y1] = r[i], [x2, y2] = r[(i + 1) % r.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

export function regionArea(r: Region): number {
  return Math.abs(ringArea(r.outer)) - r.holes.reduce((s, h) => s + Math.abs(ringArea(h)), 0);
}
export const totalArea = (rs: Region[]) => rs.reduce((s, r) => s + regionArea(r), 0);

/** Outer rings counter-clockwise, holes clockwise: the winding Clipper's non-zero rule needs. */
function toPaths(regions: Region[]): IP[][] {
  const out: IP[][] = [];
  for (const r of regions) {
    const o = toPath(r.outer);
    if (!ClipperLib.Clipper.Orientation(o)) o.reverse();
    out.push(o);
    for (const h of r.holes) {
      const hp = toPath(h);
      if (ClipperLib.Clipper.Orientation(hp)) hp.reverse();
      out.push(hp);
    }
  }
  return out;
}

/** The solution tree as regions: an outline, its holes, and the islands inside those holes as regions of their own. */
function regionsOf(tree: InstanceType<typeof ClipperLib.PolyTree>): Region[] {
  const out: Region[] = [];
  const walk = (node: InstanceType<typeof ClipperLib.PolyTree>) => {
    for (const child of node.Childs()) {
      if (child.IsHole()) continue;
      const outer = fromPath(child.Contour());
      const holes: Ring[] = [];
      for (const h of child.Childs()) {
        holes.push(fromPath(h.Contour()));
        walk(h); // islands inside the hole
      }
      if (outer.length >= 3) out.push({ outer, holes: holes.filter((h) => h.length >= 3) });
    }
  };
  walk(tree);
  return out;
}

function boolean(type: number, a: Region[], b: Region[]): Region[] {
  // strictly simple: a hole never touches its outline, so every piece extrudes into a clean closed solid
  const c = new ClipperLib.Clipper(ClipperLib.Clipper.ioStrictlySimple);
  c.AddPaths(toPaths(a), ClipperLib.PolyType.ptSubject, true);
  if (b.length) c.AddPaths(toPaths(b), ClipperLib.PolyType.ptClip, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(type, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return regionsOf(tree);
}

export const union = (a: Region[], b: Region[] = []) => boolean(ClipperLib.ClipType.ctUnion, a, b);
export const difference = (a: Region[], b: Region[]) => (b.length ? boolean(ClipperLib.ClipType.ctDifference, a, b) : union(a));
export const intersect = (a: Region[], b: Region[]) => boolean(ClipperLib.ClipType.ctIntersection, a, b);

/** Grow (`delta` > 0) or shrink (`delta` < 0) every region by `delta` mm. */
export function offset(regions: Region[], delta: number, join: "round" | "miter" = "round"): Region[] {
  if (regions.length === 0 || delta === 0) return regions;
  const co = new ClipperLib.ClipperOffset(2, ARC_TOLERANCE);
  co.AddPaths(toPaths(regions), join === "round" ? ClipperLib.JoinType.jtRound : ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon);
  const tree = new ClipperLib.PolyTree();
  co.Execute(tree, delta * SCALE);
  return regionsOf(tree);
}

/**
 * Remove detail too small to print: shrink then grow back by `radius` (thin strokes and specks vanish, corners round a
 * little), and drop pieces smaller than `minArea` mm². Returns what was removed so the caller can tell the customer.
 */
export function removeSmallFeatures(regions: Region[], radius: number, minArea: number): { regions: Region[]; removedArea: number } {
  const before = totalArea(regions);
  const opened = radius > 0 ? offset(offset(regions, -radius, "miter"), radius, "miter") : regions;
  const kept = opened.filter((r) => regionArea(r) >= minArea).map((r) => ({ outer: r.outer, holes: r.holes.filter((h) => Math.abs(ringArea(h)) >= minArea) }));
  return { regions: kept, removedArea: Math.max(0, before - totalArea(kept)) };
}

export type Transform = { x?: number; y?: number; scale?: number; rotation?: number; mirror?: boolean };

/** Scale, mirror (left-right), rotate (degrees, counter-clockwise) and move. Orientation is kept (outer CCW, holes CW). */
export function transformRegions(regions: Region[], t: Transform): Region[] {
  const s = t.scale ?? 1, a = ((t.rotation ?? 0) * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
  const mx = t.mirror ? -1 : 1, dx = t.x ?? 0, dy = t.y ?? 0;
  const tp = ([x, y]: Pt): Pt => {
    const px = x * s * mx, py = y * s;
    return [px * cos - py * sin + dx, px * sin + py * cos + dy];
  };
  const fix = (r: Ring, ccw: boolean): Ring => {
    const out = r.map(tp);
    return (ringArea(out) > 0) === ccw ? out : out.reverse();
  };
  return regions.map((r) => ({ outer: fix(r.outer, true), holes: r.holes.map((h) => fix(h, false)) }));
}

export function pointInRing(p: Pt, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export const pointInRegion = (p: Pt, r: Region) => pointInRing(p, r.outer) && !r.holes.some((h) => pointInRing(p, h));

export type Bounds = { minX: number; minY: number; maxX: number; maxY: number };
export function boundsOf(regions: Region[]): Bounds {
  const b = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  for (const r of regions) for (const [x, y] of r.outer) {
    if (x < b.minX) b.minX = x;
    if (x > b.maxX) b.maxX = x;
    if (y < b.minY) b.minY = y;
    if (y > b.maxY) b.maxY = y;
  }
  return b;
}

export const pointCount = (regions: Region[]) => regions.reduce((n, r) => n + r.outer.length + r.holes.reduce((m, h) => m + h.length, 0), 0);

/**
 * Remove points that lie (almost) on the straight line between their neighbours. The triangulator that fills the top and
 * bottom of a piece silently drops exactly-collinear points while the side walls keep them, which leaves a hairline gap
 * in the solid; no collinear points, no gap. `tol` is how far (mm) a point may sit off the line and still be removed.
 */
export function straighten(regions: Region[], tol = 0.002): Region[] {
  const clean = (ring: Ring): Ring => {
    let pts = ring.slice();
    let changed = true;
    while (changed && pts.length > 3) {
      changed = false;
      for (let i = 0; i < pts.length && pts.length > 3; i++) {
        const a = pts[(i + pts.length - 1) % pts.length], b = pts[i], c = pts[(i + 1) % pts.length];
        const dx = c[0] - a[0], dy = c[1] - a[1];
        const len = Math.hypot(dx, dy);
        const dev = len < 1e-9 ? Math.hypot(b[0] - a[0], b[1] - a[1]) : Math.abs(dx * (a[1] - b[1]) - dy * (a[0] - b[0])) / len;
        // only drop a point that lies between its neighbours (not a spike that doubles back)
        const along = len < 1e-9 ? 0 : ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / (len * len);
        if (dev <= tol && along >= 0 && along <= 1) {
          pts.splice(i, 1);
          i--;
          changed = true;
        }
      }
    }
    return pts;
  };
  const out: Region[] = [];
  for (const r of regions) {
    const outer = clean(r.outer);
    if (outer.length < 3 || Math.abs(ringArea(outer)) < 1e-6) continue;
    out.push({ outer, holes: r.holes.map(clean).filter((h) => h.length >= 3 && Math.abs(ringArea(h)) > 1e-6) });
  }
  return out;
}

/**
 * Loops traced from a picture, outlines counter-clockwise and holes clockwise, as regions: the loops are merged with the
 * non-zero rule so every hole ends up inside the right outline.
 */
export function regionsFromLoops(loops: Ring[]): Region[] {
  const c = new ClipperLib.Clipper(ClipperLib.Clipper.ioStrictlySimple);
  c.AddPaths(loops.map(toPath), ClipperLib.PolyType.ptSubject, true);
  const tree = new ClipperLib.PolyTree();
  c.Execute(ClipperLib.ClipType.ctUnion, tree, ClipperLib.PolyFillType.pftNonZero, ClipperLib.PolyFillType.pftNonZero);
  return regionsOf(tree);
}
