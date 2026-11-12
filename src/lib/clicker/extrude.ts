/**
 * Gives the flat pieces from `layout.ts` their height. One closed solid per piece (a piece may be many separate areas),
 * as a three.js geometry for the preview and as a welded mesh for the print file and the checks.
 */
import { BufferGeometry, ExtrudeGeometry, Path, Shape, Vector2 } from "three";
import { toMesh, type Mesh } from "../name-mesh";
import type { Layout, LayoutPart } from "./layout";
import type { Region } from "./poly";

/**
 * A deterministic nudge of well under a micrometre, from the point's own position. The triangulator that fills the top and
 * bottom of a piece cannot cope with many points lying exactly on one line (the bottoms of every letter on a baseline),
 * and leaves hairline gaps. Nudging each point a different tiny amount breaks the tie. Because the nudge depends only on
 * where the point is, two pieces that share an edge nudge it identically and still meet exactly.
 */
function nudge(x: number, y: number): [number, number] {
  let h = Math.imul(Math.round(x * 1000), 0x9e3779b1) ^ Math.imul(Math.round(y * 1000), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h ^= h >>> 12;
  const a = ((h & 0xffff) / 0xffff - 0.5) * 0.0016;
  const b = (((h >>> 16) & 0xffff) / 0xffff - 0.5) * 0.0016;
  return [x + a, y + b];
}
const vec = ([x, y]: [number, number]) => new Vector2(...nudge(x, y));

function shapesOf(regions: Region[]): Shape[] {
  return regions.map((r) => {
    const shape = new Shape(r.outer.map(vec));
    for (const h of r.holes) shape.holes.push(new Path(h.map(vec)));
    return shape;
  });
}

export type SolidPart = LayoutPart & { geometry: BufferGeometry };

/** A closed solid for one piece, standing on z0 and reaching z1. */
export function extrudePart(part: LayoutPart): BufferGeometry {
  const geometry = new ExtrudeGeometry(shapesOf(part.regions), { depth: part.z1 - part.z0, bevelEnabled: false, curveSegments: 1 });
  geometry.translate(0, 0, part.z0);
  return geometry;
}

export function extrudeLayout(layout: Layout): SolidPart[] {
  return layout.parts.filter((p) => p.z1 - p.z0 > 1e-6).map((p) => ({ ...p, geometry: extrudePart(p) }));
}

/** The piece as a welded, indexed mesh (what 3MF stores and what the watertight check reads). */
export const meshOfPart = (p: SolidPart): Mesh => toMesh(p.geometry);
