/**
 * How much room a name has at a spot on a model. Given the model's surface (build space) and a slot frame (position,
 * facing, up), it measures, for a range of name heights, the widest name area that sits fully on the surface, so the
 * admin editor can stop the admin from entering sizes that would overflow. Server side (reads big meshes), but pure.
 *
 * It uses the same rule as `checkFit` in name-3mf.ts (nine sample points, the surface must be within FIT_TOLERANCE_MM of
 * the slot plane under each), made fast: only triangles near the area are kept, put into a 2D grid in the slot's own
 * plane, and each sample is a straight-down lookup in one grid cell instead of a ray against the whole model.
 */
import type { Matrix4 } from "three";
import { slotMatrix, type Mesh, type NameSlot, type SpaceTable } from "./name-mesh";

/** Same as `FIT_TOLERANCE_MM` in name-3mf.ts (kept here so this module has no I/O imports; a test pins them together). */
export const SPACE_TOLERANCE_MM = 0.7;
const LIFT = 20; // surfaces above the slot plane by more than this are ignored, like the ray start in checkFit
const CELL = 1.5; // mm
/** Name heights (mm) the table is measured at. */
export const SPACE_HEIGHTS = [3, 4, 5, 6, 7, 8, 10, 12, 14, 17, 20, 25, 30, 40, 50];
export const SPACE_MIN_WIDTH = 8;

type Frame = Pick<NameSlot, "position" | "normal" | "up">;

export class SurfaceProbe {
  private tris: Float64Array; // x0 y0 z0 x1 y1 z1 x2 y2 z2 per kept triangle, in the slot frame
  private cells = new Map<number, number[]>();
  private nx: number;
  private ox: number;
  private oy: number;

  /** `maxW` x `maxH` is the largest area that will be asked about. */
  constructor(mesh: Mesh, frame: Frame, private maxW: number, private maxH: number) {
    const inv: Matrix4 = slotMatrix(frame).invert();
    const e = inv.elements;
    const P = mesh.positions, I = mesh.indices;
    const hw = maxW / 2 + CELL, hh = maxH / 2 + CELL;
    this.ox = -hw;
    this.oy = -hh;
    this.nx = Math.ceil((2 * hw) / CELL) + 1;
    const kept: number[] = [];
    const v = [0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (let t = 0; t < I.length; t += 3) {
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity, minZ = Infinity;
      for (let k = 0; k < 3; k++) {
        const o = I[t + k] * 3, x = P[o], y = P[o + 1], z = P[o + 2];
        const X = e[0] * x + e[4] * y + e[8] * z + e[12];
        const Y = e[1] * x + e[5] * y + e[9] * z + e[13];
        const Z = e[2] * x + e[6] * y + e[10] * z + e[14];
        v[k * 3] = X; v[k * 3 + 1] = Y; v[k * 3 + 2] = Z;
        if (X < minX) minX = X;
        if (X > maxX) maxX = X;
        if (Y < minY) minY = Y;
        if (Y > maxY) maxY = Y;
        if (Z < minZ) minZ = Z;
      }
      if (maxX < -hw || minX > hw || maxY < -hh || minY > hh || minZ > LIFT) continue;
      const idx = kept.length / 9;
      kept.push(...v);
      const c0 = Math.max(0, Math.floor((minX - this.ox) / CELL)), c1 = Math.min(this.nx - 1, Math.floor((maxX - this.ox) / CELL));
      const r0 = Math.max(0, Math.floor((minY - this.oy) / CELL)), r1 = Math.floor((maxY - this.oy) / CELL);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        const key = r * this.nx + c;
        const list = this.cells.get(key);
        if (list) list.push(idx);
        else this.cells.set(key, [idx]);
      }
    }
    this.tris = Float64Array.from(kept);
  }

  /** Height (mm) above the slot plane of the highest surface at (u, v) that is not above the lift, or null if none. */
  heightAt(u: number, v: number): number | null {
    const c = Math.floor((u - this.ox) / CELL), r = Math.floor((v - this.oy) / CELL);
    const list = this.cells.get(r * this.nx + c);
    if (!list) return null;
    let best = -Infinity;
    const T = this.tris;
    for (const i of list) {
      const o = i * 9;
      const x0 = T[o], y0 = T[o + 1], z0 = T[o + 2], x1 = T[o + 3], y1 = T[o + 4], z1 = T[o + 5], x2 = T[o + 6], y2 = T[o + 7], z2 = T[o + 8];
      const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
      if (Math.abs(d) < 1e-12) continue; // edge-on (a vertical wall): no top surface here
      const a = ((y1 - y2) * (u - x2) + (x2 - x1) * (v - y2)) / d;
      const b = ((y2 - y0) * (u - x2) + (x0 - x2) * (v - y2)) / d;
      const g = 1 - a - b;
      if (a < 0 || b < 0 || g < 0) continue;
      const z = a * z0 + b * z1 + g * z2;
      if (z <= LIFT && z > best) best = z;
    }
    return best === -Infinity ? null : best;
  }

  /** Does an area `w` x `h` centred on the slot sit fully on the surface? (nine sample points, as checkFit) */
  fits(w: number, h: number): boolean {
    const hw = w / 2, hh = h / 2;
    for (const [x, y] of [[0, 0], [-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh], [0, -hh], [0, hh], [-hw, 0], [hw, 0]]) {
      const z = this.heightAt(x, y);
      if (z === null || Math.abs(z) > SPACE_TOLERANCE_MM) return false;
    }
    return true;
  }
}

/** Measure the room at a spot. `caps` bound the search (the widest and tallest area worth offering). */
export function measureSpace(mesh: Mesh, frame: Frame, caps: { maxW: number; maxH: number } = { maxW: 120, maxH: 50 }): SpaceTable {
  const probe = new SurfaceProbe(mesh, frame, caps.maxW, caps.maxH);
  const heights = SPACE_HEIGHTS.filter((h) => h <= caps.maxH);
  const widths: number[] = [];
  for (const h of heights) {
    if (!probe.fits(SPACE_MIN_WIDTH, h)) {
      widths.push(0);
      continue;
    }
    let lo = SPACE_MIN_WIDTH, hi = caps.maxW; // lo fits; find the largest width that does, to 0.5 mm
    if (probe.fits(hi, h)) lo = hi;
    while (hi - lo > 0.5) {
      const mid = (lo + hi) / 2;
      if (probe.fits(mid, h)) lo = mid;
      else hi = mid;
    }
    widths.push(Math.floor(lo * 2) / 2);
  }
  // Taller can never allow wider. The nine-point sampling can wobble near small features (a ring, a step), so keep the
  // table safe: each width is at most the previous one, and nothing above a height with no room.
  for (let i = 1; i < widths.length; i++) widths[i] = Math.min(widths[i], widths[i - 1]);
  return { heights, widths };
}

