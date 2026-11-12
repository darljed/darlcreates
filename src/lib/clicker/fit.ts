/**
 * The mechanical numbers of a switch clicker, in one place. A clicker is two printed objects around a real MX keyboard
 * switch:
 *
 *   housing  floor, a 14 mm chamber for the switch (with four clip windows just under the deck), the deck the switch
 *            sits in, and a rim around the well the cap travels in
 *   cap      a pressable top: a cavity underneath, a round boss with a cross socket for the switch stem, a skin on top
 *            and the coloured artwork inlaid in that skin
 *
 * The values below come from measuring a clicker that prints and clicks well (the 40 x 55 mm sample). They are
 * estimates for YOUR printer and filament: print the fit test, then adjust `Tune` (millimetres, plus loosens, minus
 * tightens). Everything here is millimetres. Pure.
 */
import type { Pt, Ring } from "./poly";

export const FIT = {
  /** The base reaches this far beyond the cap on every side: rim wall plus clearance. */
  insetMm: 2.5,
  /** Gap between the cap's edge and the rim wall (the cap slides in this well). */
  clearMm: 0.5,

  // --- housing, heights from the bottom ---
  floorMm: 1.2,
  /** The chamber for the switch body and its pins runs from the floor up to the deck top. */
  deckTopMm: 10,
  /** The deck the switch's clips hold on to (below it are the clip windows). */
  deckMm: 1.3,
  notchMm: 1.5,
  /** Standard MX plate cutout. */
  pocketMm: 14.0,
  notchWidthMm: 6.7,
  notchDepthMm: 2.0,
  /** The keyring loop is a flat tab this thick. */
  keyringMm: 3,

  // --- cap, heights from its underside ---
  capBodyMm: 5.4,
  capSkinMm: 0.6,
  /** Hollow under the cap (room for the top of the switch) and how deep it goes. */
  cavityMm: 12.2,
  cavityDepthMm: 4.2,
  cavityCornerMm: 0.6,
  /** The boss that holds the cross socket. */
  bossDiameterMm: 5.6,
  /** The cross socket for the stem, its depth from the underside, and the wider mouth that guides the stem in. */
  crossSpanMm: 4.0,
  crossArmMm: 1.35,
  crossDepthMm: 4.0,
  mouthSpanMm: 4.6,
  mouthArmMm: 1.65,
  mouthDepthMm: 0.4,

  /**
   * Where the cap's underside sits (above the housing's bottom) when the key is up. 16.6 mm is the layout of the sample
   * clicker that prints and clicks well; it gives the full 4 mm of travel (the cap stops 2.6 mm above the deck) and a total
   * height of 22.6 mm. It depends on how far your switches' stems stand up, so check it with the fit test.
   */
  capRestZ: 16.6,
  travelMm: 4.0,

  /** The switch must fit inside the cap's outline: this square (the flange plus a little) has to lie within it. */
  keepoutMm: 15,

  // --- name keys ---
  keyMm: 18,
  keyGapMm: 3.6,
  keyCornerMm: 3,

  // --- printing ---
  plateMm: 256,
  plateMarginMm: 6,
  plateGapMm: 6,
  wallLoopsBase: 3,
  wallLoopsCap: 1,
} as const;

/** The rim heights above the deck (mm). Flush reaches the top of the key when it is up. */
export const RIM_IDS = ["low", "standard", "high", "flush"] as const;
export type RimId = (typeof RIM_IDS)[number];
/** Flush = the top of the key when it is up: (stem top - socket depth) + the cap's height. */
export const RIM_MM: Record<RimId, number> = { low: 4, standard: 8, high: 11, flush: FIT.capRestZ + FIT.capBodyMm + FIT.capSkinMm - FIT.deckTopMm };
export const RIM_LABELS: Record<RimId, string> = { low: "Low", standard: "Standard", high: "High", flush: "Flush with the key" };

/** How far the artwork stands above the cap's skin. */
export const RELIEF_IDS = ["flat", "low", "high"] as const;
export type ReliefId = (typeof RELIEF_IDS)[number];
export const RELIEF_MM: Record<ReliefId, number> = { flat: 0, low: 0.6, high: 1.2 };
export const RELIEF_LABELS: Record<ReliefId, string> = { flat: "Flat", low: "Raised 0.6 mm", high: "Raised 1.2 mm" };

/** Fit adjustments for the owner's printer and filament, in mm: positive loosens, negative tightens. */
export type Tune = { pocket: number; stem: number; gap: number };
export const DEFAULT_TUNE: Tune = { pocket: 0, stem: 0, gap: 0 };

/** Total height of a clicker with its key up (base bottom to the top of the artwork). */
export const totalHeightMm = (relief: ReliefId) => FIT.capRestZ + FIT.capBodyMm + FIT.capSkinMm + RELIEF_MM[relief];
export const capTopMm = FIT.capBodyMm + FIT.capSkinMm;

// --- small ring builders ---------------------------------------------------------------------------------------------

export function boxRing(cx: number, cy: number, w: number, h: number, corner = 0): Ring {
  const r = Math.max(0, Math.min(corner, w / 2, h / 2));
  if (r < 0.01) return [[cx - w / 2, cy - h / 2], [cx + w / 2, cy - h / 2], [cx + w / 2, cy + h / 2], [cx - w / 2, cy + h / 2]];
  const steps = Math.max(3, Math.ceil((r * Math.PI) / 2 / 0.3));
  const out: Ring = [];
  const corners: [number, number, number][] = [
    [cx + w / 2 - r, cy - h / 2 + r, -Math.PI / 2],
    [cx + w / 2 - r, cy + h / 2 - r, 0],
    [cx - w / 2 + r, cy + h / 2 - r, Math.PI / 2],
    [cx - w / 2 + r, cy - h / 2 + r, Math.PI],
  ];
  for (const [ox, oy, a0] of corners) for (let i = 0; i <= steps; i++) {
    const a = a0 + ((Math.PI / 2) * i) / steps;
    out.push([ox + r * Math.cos(a), oy + r * Math.sin(a)]);
  }
  return out;
}

/** A plus-shaped ring (the stem's cross): `span` end to end, `arm` wide. Twelve corners, counter-clockwise. */
export function crossRing(cx: number, cy: number, span: number, arm: number): Ring {
  const s = span / 2, a = arm / 2;
  const p: Pt[] = [[a, -s], [a, -a], [s, -a], [s, a], [a, a], [a, s], [-a, s], [-a, a], [-s, a], [-s, -a], [-a, -a], [-a, -s]];
  return p.map(([x, y]) => [x + cx, y + cy] as Pt);
}
