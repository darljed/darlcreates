/**
 * Name on a model, as geometry. Turns text + a "name slot" (where on the model the name sits) into a 3D mesh of raised
 * letters, plus the checks that decide whether it can be printed. Pure and isomorphic: the product page (live preview),
 * the admin slot editor and the server (print file) all run this same code, so what the customer sees is what is made.
 *
 * Coordinates are the model file's own (millimetres, Z up), because that is what the slicer prints. The letters are
 * raised from the surface and sunk a little into it, so a slicer merges the two shells: no boolean/CSG needed.
 * Engraved (cut-in) text is not supported; it would need a CSG library.
 */
import * as opentype from "opentype.js";
import { BufferGeometry, ExtrudeGeometry, Matrix4, ShapePath, Vector3 } from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { z } from "zod";

// ---------------------------------------------------------------------------------------------------------------------
// Fonts (heavy faces only: thin strokes do not print). Files live in /public/fonts so the browser and server share them.
// ---------------------------------------------------------------------------------------------------------------------

export const NAME_FONTS = {
  bold: { label: "Bold", file: "Poppins-ExtraBold.ttf" },
  chunky: { label: "Chunky", file: "LilitaOne-Regular.ttf" },
} as const;
export type NameFontId = keyof typeof NAME_FONTS;
export const NAME_FONT_IDS = Object.keys(NAME_FONTS) as [NameFontId, ...NameFontId[]];

export type Font = opentype.Font;
/** Parse a TrueType/OpenType file. Throws on a corrupt file. */
export function parseFont(data: ArrayBuffer): Font {
  return opentype.parse(data);
}

// ---------------------------------------------------------------------------------------------------------------------
// The slot: where the name goes. Stored in the text option's `constraints.slot` (jsonb), validated here.
// ---------------------------------------------------------------------------------------------------------------------

/** Printing limits the checks enforce. 0.4 mm nozzle: a letter stroke needs at least two lines to be sturdy. */
export const PRINT_LIMITS = { minStemMm: 0.8, minDepthMm: 0.6, maxDepthMm: 5, minCapHeightMm: 3 } as const;

const vec3 = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const unit = (v: [number, number, number]) => Math.abs(Math.hypot(...v) - 1) < 0.01;

export const nameSlotSchema = z.object({
  /** Centre of the name on the surface (mm, in the model file's coordinates). */
  position: vec3,
  /** Direction the surface faces, out of the model (unit vector). */
  normal: vec3.refine(unit, "normal must be a unit vector"),
  /** Which way is "up" for the letters, along the surface (unit vector; made perpendicular to the normal). */
  up: vec3.refine(unit, "up must be a unit vector"),
  /** Widest the name may be (mm). Longer names are scaled down to fit. */
  maxWidth: z.number().min(5).max(300),
  /** Capital-letter height wanted (mm). */
  height: z.number().min(PRINT_LIMITS.minCapHeightMm).max(60),
  /** How far the letters stand out (mm). */
  depth: z.number().min(PRINT_LIMITS.minDepthMm).max(PRINT_LIMITS.maxDepthMm),
  /** How far the letters sink into the surface so the shells overlap (mm). */
  sink: z.number().min(0).max(2),
  font: z.enum(NAME_FONT_IDS),
});
export type NameSlot = z.infer<typeof nameSlotSchema>;

/** The valid name slot stored on a text option, or null (no slot, or a damaged one). */
export function slotOf(constraints: { slot?: unknown } | null | undefined): NameSlot | null {
  const r = nameSlotSchema.safeParse(constraints?.slot);
  return r.success ? r.data : null;
}

/**
 * The name to put on an order item's model, if any: the text option that has a slot, the customer's text for it, and
 * the kind of base file (STL or 3MF; anything else cannot take a name).
 */
export function personalizedName(
  options: { id: string; type: string; constraints: { slot?: unknown } }[],
  config: Record<string, { text?: string }>,
  baseKey: string | null,
): { slot: NameSlot; text: string; kind: "stl" | "3mf" } | null {
  const kind = baseKey && /\.(stl|3mf)$/i.exec(baseKey)?.[1].toLowerCase();
  if (kind !== "stl" && kind !== "3mf") return null;
  for (const opt of options) {
    if (opt.type !== "text") continue;
    const slot = slotOf(opt.constraints);
    const text = cleanName(config[opt.id]?.text ?? "");
    if (slot && text) return { slot, text, kind };
  }
  return null;
}

export const DEFAULT_SLOT_SIZES = { maxWidth: 40, height: 6, depth: 1.2, sink: 0.4, font: "bold" } as const;

// ---------------------------------------------------------------------------------------------------------------------
// Text -> geometry
// ---------------------------------------------------------------------------------------------------------------------

const EM = 100; // font size used while shaping; scaled to millimetres afterwards

export type NameBuild =
  | { ok: false; error: string }
  | {
      ok: true;
      /** Extruded letters in model coordinates, with normals (for display). */
      geometry: BufferGeometry;
      /** Final size of the name in mm (width, capital height) and the thinnest stroke. */
      widthMm: number;
      heightMm: number;
      stemMm: number;
      /** True when the name was too wide and shrank to fit `maxWidth`. */
      scaledDown: boolean;
    };

/** Letters the font can draw, or an error naming the first one it cannot. */
export function checkText(font: Font, text: string): string | null {
  if (!text.trim()) return "Enter a name";
  for (const ch of text) {
    if (ch === " ") continue;
    if (font.charToGlyph(ch).index === 0) return `The letter "${ch}" is not available in this font`;
  }
  return null;
}

/** Normalise what the customer typed: trim and collapse repeated spaces. */
export function cleanName(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Width of a plain vertical stroke in this font ("I") at `scale`: the thinnest part we must be able to print. */
function stemOf(font: Font, scale: number): number {
  const b = font.getPath("I", 0, 0, EM).getBoundingBox();
  return (b.x2 - b.x1) * scale;
}

function pathToShapes(path: opentype.Path) {
  const sp = new ShapePath();
  for (const c of path.commands) {
    // opentype's y axis points down; flip it so the letters stand up
    if (c.type === "M") sp.moveTo(c.x, -c.y);
    else if (c.type === "L") sp.lineTo(c.x, -c.y);
    else if (c.type === "Q") sp.quadraticCurveTo(c.x1, -c.y1, c.x, -c.y);
    else if (c.type === "C") sp.bezierCurveTo(c.x1, -c.y1, c.x2, -c.y2, c.x, -c.y);
  }
  return sp.toShapes();
}

/** Rotation + translation that puts the text plane (x right, y up, z out) onto the slot. */
export function slotMatrix(slot: Pick<NameSlot, "position" | "normal" | "up">): Matrix4 {
  const n = new Vector3(...slot.normal).normalize();
  let up = new Vector3(...slot.up);
  up.addScaledVector(n, -up.dot(n)); // make "up" lie in the surface
  if (up.lengthSq() < 1e-6) up = Math.abs(n.z) < 0.9 ? new Vector3(0, 0, 1) : new Vector3(0, 1, 0); // degenerate: pick any
  up.normalize();
  const right = new Vector3().crossVectors(up, n).normalize(); // right-handed: x = y × z
  return new Matrix4().makeBasis(right, up, n).setPosition(...slot.position);
}

/**
 * Build the raised letters for `text` at `slot`. The name is centred on the slot, its capital height is `slot.height`
 * (shrunk uniformly if the name would be wider than `slot.maxWidth`), and it is refused if the thinnest stroke would
 * be too thin to print.
 */
export function buildName(font: Font, textIn: string, slot: NameSlot): NameBuild {
  const text = cleanName(textIn);
  const bad = checkText(font, text);
  if (bad) return { ok: false, error: bad };

  const capUnits = ((font.tables.os2 as { sCapHeight?: number } | undefined)?.sCapHeight ?? font.unitsPerEm * 0.7) * (EM / font.unitsPerEm);
  const path = font.getPath(text, 0, 0, EM);
  const box = path.getBoundingBox();
  const widthUnits = box.x2 - box.x1;
  if (!(widthUnits > 0)) return { ok: false, error: "Nothing to print" };

  let scale = slot.height / capUnits;
  let scaledDown = false;
  if (widthUnits * scale > slot.maxWidth) {
    scale = slot.maxWidth / widthUnits;
    scaledDown = true;
  }
  const heightMm = capUnits * scale;
  const stemMm = stemOf(font, scale);
  if (heightMm < PRINT_LIMITS.minCapHeightMm || stemMm < PRINT_LIMITS.minStemMm) {
    return { ok: false, error: "That name is too long to print clearly in the space available. Try a shorter name." };
  }

  const shapes = pathToShapes(path);
  const geometry = new ExtrudeGeometry(shapes, {
    depth: (slot.depth + slot.sink) / scale, // extruded in font units, scaled to mm below
    bevelEnabled: false,
    curveSegments: 5,
  });
  // centre: horizontally on the ink, vertically on the capital-height band (so "Ana" and "Gigi" share a baseline)
  geometry.translate(-(box.x1 + box.x2) / 2, -capUnits / 2, 0);
  geometry.scale(scale, scale, scale);
  geometry.translate(0, 0, -slot.sink);
  geometry.applyMatrix4(slotMatrix(slot));

  return { ok: true, geometry, widthMm: widthUnits * scale, heightMm, stemMm, scaledDown };
}

// ---------------------------------------------------------------------------------------------------------------------
// Meshes for printing: indexed triangles, and the checks a slicer would complain about
// ---------------------------------------------------------------------------------------------------------------------

export type Mesh = { positions: Float32Array; indices: Uint32Array };

/** Weld identical corners so the mesh is indexed (what 3MF stores, and what the watertight check needs). */
export function toMesh(geometry: BufferGeometry): Mesh {
  const g = geometry.clone();
  g.deleteAttribute("normal");
  g.deleteAttribute("uv");
  const welded = mergeVertices(g, 1e-4);
  const pos = welded.getAttribute("position");
  const index = welded.getIndex();
  const indices = index ? Uint32Array.from(index.array as ArrayLike<number>) : Uint32Array.from({ length: pos.count }, (_, i) => i);
  return { positions: Float32Array.from(pos.array as ArrayLike<number>), indices };
}

/** A mesh is watertight when every edge is shared by exactly two triangles, running in opposite directions. */
export function isWatertight(mesh: Mesh): boolean {
  const seen = new Map<string, number>();
  const { indices: ix } = mesh;
  for (let t = 0; t < ix.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = ix[t + e], b = ix[t + ((e + 1) % 3)];
      if (a === b) return false; // collapsed triangle
      seen.set(`${a}>${b}`, (seen.get(`${a}>${b}`) ?? 0) + 1);
    }
  }
  for (const [k, n] of seen) {
    const [a, b] = k.split(">");
    if (n !== 1 || seen.get(`${b}>${a}`) !== 1) return false;
  }
  return true;
}

/** Bounding box of a mesh: [minX, minY, minZ, maxX, maxY, maxZ]. */
export function meshBounds(mesh: Mesh): [number, number, number, number, number, number] {
  const b: [number, number, number, number, number, number] = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (let i = 0; i < mesh.positions.length; i += 3) {
    for (let k = 0; k < 3; k++) {
      b[k] = Math.min(b[k], mesh.positions[i + k]);
      b[k + 3] = Math.max(b[k + 3], mesh.positions[i + k]);
    }
  }
  return b;
}
