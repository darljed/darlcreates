/**
 * Text as outlines for a clicker: lines of letters from one of the bundled fonts, centred on the origin, in millimetres
 * (Y up). Letters that touch or overlap are merged, so each colour prints as clean areas. Pure; the caller supplies the
 * parsed font (the browser and the server load the same files).
 */
import type { Font } from "../name-mesh";
import { checkText, pathToShapes } from "../name-mesh";
import type { Region, Ring } from "./poly";
import { union } from "./poly";

const EM = 100;

export type TextOptions = { size: number; spacing: number; lineGap: number };

/** The text's outlines, or an error naming the first letter the font cannot draw. */
export function textRegions(font: Font, text: string, opt: TextOptions): { regions: Region[] } | { error: string } {
  const lines = text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l, i, all) => l || i < all.length - 1);
  if (lines.every((l) => !l)) return { regions: [] };
  for (const line of lines) {
    const bad = line ? checkText(font, line) : null;
    if (bad) return { error: bad };
  }

  const capUnits = ((font.tables.os2 as { sCapHeight?: number } | undefined)?.sCapHeight ?? font.unitsPerEm * 0.7) * (EM / font.unitsPerEm);
  const s = opt.size / capUnits; // millimetres per font unit at EM
  const advance = opt.size * 1.5 + opt.lineGap;
  const letterSpacing = opt.spacing / (s * EM); // opentype wants it as a fraction of the font size

  const all: Region[] = [];
  lines.forEach((line, i) => {
    if (!line) return;
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
  if (all.length === 0) return { regions: [] };

  const merged = union(all);
  // centre the whole block on the origin
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const r of merged) for (const [x, y] of r.outer) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const dx = -(minX + maxX) / 2, dy = -(minY + maxY) / 2;
  const move = (ring: Ring): Ring => ring.map(([x, y]) => [x + dx, y + dy] as [number, number]);
  return { regions: merged.map((r) => ({ outer: move(r.outer), holes: r.holes.map(move) })) };
}
