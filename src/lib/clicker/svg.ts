/**
 * A flat picture of a clicker design as SVG, drawn from the same pieces the printer gets. Used where a 3D view would be
 * too heavy: the cart, the order pages, the admin. Pure; the caller gives it the fonts for any text.
 */
import type { Font } from "../name-mesh";
import { buildLayout, type Layout } from "./layout";
import type { Region } from "./poly";
import type { ClickerSpec } from "./spec";
import type { NameFontId } from "../name-mesh";

const num = (n: number) => (Math.round(n * 100) / 100).toString();

function pathOf(regions: Region[]): string {
  return regions
    .map((r) => [r.outer, ...r.holes].map((ring) => "M" + ring.map(([x, y]) => `${num(x)} ${num(y)}`).join("L") + "Z").join(""))
    .join("");
}

/** SVG markup for the layout, centred in a square-ish box with a small margin. The pieces are painted bottom to top. */
export function layoutToSvg(layout: Layout, opts: { margin?: number; className?: string; title?: string } = {}): string {
  const m = opts.margin ?? 2;
  const b = layout.bounds;
  const w = b.maxX - b.minX + m * 2, h = b.maxY - b.minY + m * 2;
  // SVG's y runs down, ours runs up: flip once on the group
  const paints = layout.parts
    .slice()
    .sort((a, c) => a.z0 - c.z0 || a.z1 - c.z1)
    .map((p) => `<path d="${pathOf(p.regions)}" fill="${p.color}" fill-rule="evenodd"${p.role === "body" ? "" : ` stroke="rgba(0,0,0,.28)" stroke-width="0.12"`}/>`)
    .join("");
  const title = opts.title ? `<title>${opts.title.replace(/[<>&"]/g, "")}</title>` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${num(b.minX - m)} ${num(-b.maxY - m)} ${num(w)} ${num(h)}"` +
    `${opts.className ? ` class="${opts.className}"` : ""} role="img">${title}<g transform="scale(1 -1)">${paints}</g></svg>`
  );
}

export function designToSvg(spec: ClickerSpec, fonts: (id: NameFontId) => Font | undefined, opts: { margin?: number; className?: string; title?: string } = {}): string {
  return layoutToSvg(buildLayout(spec, fonts), opts);
}
