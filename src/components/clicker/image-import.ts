/**
 * Reading a customer's picture in the browser. A photo or logo (PNG, JPG, WebP, GIF) is drawn small on a canvas and
 * handed to the tracer as pixels; an SVG is read as vector shapes and grouped by fill colour. Nothing is uploaded: the
 * picture never leaves the browser, only the outlines drawn from it are saved with the design.
 */
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import type { Region, Ring } from "@/lib/clicker/poly";
import { union } from "@/lib/clicker/poly";
import { nearestHex, simplifyLoop, type Pixels, type Traced } from "@/lib/clicker/trace";

export const MAX_PICTURE_BYTES = 8 * 1024 * 1024;
export const MAX_SVG_BYTES = 2 * 1024 * 1024;
/** The longest side the picture is read at: enough for a clean outline, quick to trace. */
const RASTER_SIDE = 360;

export const RASTER_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function readRaster(file: File): Promise<Pixels> {
  if (!RASTER_TYPES.includes(file.type)) throw new Error("Use a PNG, JPG, WebP or GIF picture, or an SVG.");
  if (file.size > MAX_PICTURE_BYTES) throw new Error("That picture is over 8 MB. Choose a smaller one.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("We couldn't read that picture. Try a PNG or JPG.");
  }
  const scale = Math.min(1, RASTER_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale)), h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Your browser can't read pictures here.");
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  const { data } = ctx.getImageData(0, 0, w, h);
  return { width: w, height: h, data };
}

const hexOf = (c: { r: number; g: number; b: number }) =>
  "#" + [c.r, c.g, c.b].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, "0")).join("");

/** Shapes of an SVG, grouped by fill colour (matched to the filaments on offer), scaled so the longest side is 1. */
export async function readSvg(file: File, palette: string[]): Promise<Traced> {
  if (file.size > MAX_SVG_BYTES) throw new Error("Choose an SVG smaller than 2 MB.");
  const text = await file.text();
  let data: ReturnType<SVGLoader["parse"]>;
  try {
    data = new SVGLoader().parse(text);
  } catch {
    throw new Error("This file could not be read as an SVG.");
  }
  const byColour = new Map<string, Ring[][]>(); // colour -> shapes, each shape = [outer, ...holes]
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const path of data.paths) {
    const fill = (path.userData as { style?: { fill?: string } } | undefined)?.style?.fill;
    if (!fill || fill === "none") continue; // outlines drawn only as strokes are not shapes
    const colour = nearestHex(hexOf(path.color), palette).toLowerCase();
    for (const shape of SVGLoader.createShapes(path)) {
      const { shape: outer, holes } = shape.extractPoints(10);
      const toRing = (pts: { x: number; y: number }[]): Ring => pts.map((p) => [p.x, -p.y] as [number, number]); // SVG's y runs down
      const rings = [toRing(outer), ...holes.map(toRing)];
      for (const [x, y] of rings[0]) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
      byColour.set(colour, [...(byColour.get(colour) ?? []), rings]);
    }
  }
  if (!byColour.size || !isFinite(minX)) throw new Error("There are no drawable shapes in this file.");
  const longest = Math.max(maxX - minX, maxY - minY) || 1;
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  const norm = (r: Ring): Ring => r.map(([x, y]) => [(x - cx) / longest, (y - cy) / longest] as [number, number]);

  const groups: Traced["groups"] = [];
  let points = 0;
  for (const [color, shapes] of byColour) {
    const regions: Region[] = shapes.map(([outer, ...holes]) => ({ outer: simplifyLoop(norm(outer), 0.0012), holes: holes.map((h) => simplifyLoop(norm(h), 0.0012)) }));
    const merged = union(regions.filter((r) => r.outer.length >= 3));
    points += merged.reduce((n, r) => n + r.outer.length + r.holes.reduce((m, h) => m + h.length, 0), 0);
    if (merged.length) groups.push({ color, shapes: merged });
  }
  return { groups, fitWidth: (maxX - minX) / longest, fitHeight: (maxY - minY) / longest, points };
}
