/**
 * How far a key may reach past its switches. A key rests on the stems of its switches and slides in the well; if it sticks out
 * far past them, pressing the far end tilts it and it jams, and a key whose middle is far from its switches presses unevenly.
 * These rules are checked in the layout (an error stops the order), in the designer while artwork is dragged or sized (the
 * movement stops at the limit), and on the server. Pure arithmetic on bounding boxes, so it is cheap enough to run every frame.
 */
import { FIT } from "./fit";

export type Box = { minX: number; maxX: number; minY: number; maxY: number };
type Pt = { x: number; y: number };

/** The box that holds every switch's keep-out square. */
export function switchBlock(switches: Pt[]): Box {
  const h = FIT.keepoutMm / 2;
  return {
    minX: Math.min(...switches.map((p) => p.x)) - h, maxX: Math.max(...switches.map((p) => p.x)) + h,
    minY: Math.min(...switches.map((p) => p.y)) - h, maxY: Math.max(...switches.map((p) => p.y)) + h,
  };
}

const TOL = 0.05;

export type ReachResult = { ok: boolean; reach: number; offX: number; offY: number; message: string | null };

/** Does a key with these bounds stay within the rules for these switches? */
export function reachCheck(key: Box, switches: Pt[], slack = 0): ReachResult {
  const b = switchBlock(switches);
  const reach = Math.max(b.minX - key.minX, key.maxX - b.maxX, b.minY - key.minY, key.maxY - b.maxY, 0);
  const offX = (key.minX + key.maxX) / 2 - (b.minX + b.maxX) / 2;
  const offY = (key.minY + key.maxY) / 2 - (b.minY + b.maxY) / 2;
  const many = switches.length > 1;
  let message: string | null = null;
  if (reach > FIT.maxReachMm + TOL - slack) {
    message = `The key sticks out ${reach.toFixed(0)} mm past the ${many ? "switches" : "switch"}. It can stick out at most ${FIT.maxReachMm} mm or it will not press smoothly. Move the artwork back over the ${many ? "switches" : "switch"}, make it smaller, or add another switch.`;
  } else if (Math.abs(offX) > FIT.balanceMm + TOL - slack || Math.abs(offY) > FIT.balanceMm + TOL - slack) {
    message = `The key is lopsided: its middle is ${Math.max(Math.abs(offX), Math.abs(offY)).toFixed(0)} mm away from the middle of the ${many ? "switches" : "switch"}. Move the artwork closer so the key presses evenly.`;
  }
  return { ok: message === null, reach, offX, offY, message };
}

/** The largest width and height a key centred on the origin can have, for these switches. */
export function maxKeySide(switches: Pt[]): [number, number] {
  const b = switchBlock(switches);
  return [2 * (Math.max(Math.abs(b.minX), Math.abs(b.maxX)) + FIT.maxReachMm), 2 * (Math.max(Math.abs(b.minY), Math.abs(b.maxY)) + FIT.maxReachMm)];
}

/** For a key that follows its artwork: the key is the artwork and the switch squares together, plus the border. */
export function outlineKeyBox(art: Box | null, switches: Pt[], border: number): Box {
  const b = switchBlock(switches);
  const u = art
    ? { minX: Math.min(art.minX, b.minX), maxX: Math.max(art.maxX, b.maxX), minY: Math.min(art.minY, b.minY), maxY: Math.max(art.maxY, b.maxY) }
    : b;
  return { minX: u.minX - border, maxX: u.maxX + border, minY: u.minY - border, maxY: u.maxY + border };
}

export const unionBox = (a: Box | null, b: Box | null): Box | null =>
  !a ? b : !b ? a : { minX: Math.min(a.minX, b.minX), maxX: Math.max(a.maxX, b.maxX), minY: Math.min(a.minY, b.minY), maxY: Math.max(a.maxY, b.maxY) };

export const shiftBox = (b: Box, dx: number, dy: number): Box => ({ minX: b.minX + dx, maxX: b.maxX + dx, minY: b.minY + dy, maxY: b.maxY + dy });

/**
 * How far a dragged layer may move. `others` is the box of the rest of the artwork, `mine` the dragged layer's box where it
 * started. Asked to move by (dx, dy), it returns the largest move in that direction that keeps the key within the rules; if the
 * full move is too far it slides along the limit on each axis in turn, so the layer does not stick when it hits one edge.
 */
export function clampShift(others: Box | null, mine: Box, dx: number, dy: number, switches: Pt[], border: number): { dx: number; dy: number; limited: boolean } {
  // stop a hair short of the limit (0.15 mm), so rounding the final position to 0.1 mm can never tip it over
  const ok = (x: number, y: number) => reachCheck(outlineKeyBox(unionBox(others, shiftBox(mine, x, y)), switches, border), switches, 0.15).ok;
  if (ok(dx, dy)) return { dx, dy, limited: false };
  // already outside the rules (an older design): do not move it further out
  if (!reachCheck(outlineKeyBox(unionBox(others, mine), switches, border), switches).ok) return { dx: 0, dy: 0, limited: true };
  const along = (ax: number, ay: number, ex: number, ey: number) => {
    // the biggest t in [0, 1] so that (ax + t*ex, ay + t*ey) is allowed, given (ax, ay) is
    let lo = 0, hi = 1;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (ok(ax + mid * ex, ay + mid * ey)) lo = mid;
      else hi = mid;
    }
    return lo;
  };
  const t = along(0, 0, dx, dy); // straight towards where it was asked to go
  const sx = t * dx, sy = t * dy;
  // then slide: first along x, then along y, from where it stopped
  const tx = along(sx, sy, dx - sx, 0);
  const x = sx + tx * (dx - sx);
  const ty = along(x, sy, 0, dy - sy);
  return { dx: x, dy: sy + ty * (dy - sy), limited: true };
}
