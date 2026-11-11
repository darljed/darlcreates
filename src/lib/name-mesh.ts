/**
 * Name on a model, as geometry. Turns text + a "name slot" (where on the model the name sits) into a 3D mesh of raised
 * letters, plus the checks that decide whether it can be printed. Pure and isomorphic: the product page (live preview),
 * the admin slot editor and the server (print file) all run this same code, so what the customer sees is what is made.
 *
 * Coordinates are the model file's own (millimetres, Z up), because that is what the slicer prints. The letters are
 * raised from the surface and sunk a little into it, so a slicer merges the two shells: no boolean/CSG needed.
 * Engraved (cut-in) text is NOT cut here: it is a separate mesh that goes into the 3MF as a negative part, which the
 * slicer subtracts, so no CSG library is needed here either.
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
  marker: { label: "Marker", file: "PermanentMarker-Regular.ttf" },
  modern: { label: "Modern", file: "Righteous-Regular.ttf" },
  condensed: { label: "Condensed", file: "Anton-Regular.ttf" },
  script: { label: "Script", file: "Pacifico-Regular.ttf" },
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
  /**
   * Tallest the name's ink may be (mm), counting ascenders and descenders, which differ by font and name. The name is
   * scaled down until its whole outline fits `maxWidth` x `maxHeight`; that rectangle is what is checked against the
   * model's surface. Omitted (older slots): 1.5 x `height`.
   */
  maxHeight: z.number().min(PRINT_LIMITS.minCapHeightMm).max(120).optional(),
  /** raised (default): letters stand out of the surface. engraved: letters are cut into it (a negative part in the 3MF). */
  mode: z.enum(["raised", "engraved"]).optional(),
  /** The plate object (3MF object id) the name is added to, when the project has several. Omitted: the first one. */
  object: z.string().max(20).optional(),
  /** How far the letters stand out, or (engraved) cut in (mm). */
  depth: z.number().min(PRINT_LIMITS.minDepthMm).max(PRINT_LIMITS.maxDepthMm),
  /** How far the letters sink into the surface so the shells overlap (mm). */
  sink: z.number().min(0).max(2),
  /** The font used when the customer does not choose (or may not choose). */
  font: z.enum(NAME_FONT_IDS),
  /** Fonts the customer may pick from. Omitted or just the default font: no picker is shown. */
  fonts: z.array(z.enum(NAME_FONT_IDS)).min(1).max(NAME_FONT_IDS.length).optional(),
  /**
   * Set when the designer's example text was printed in a different filament than the model (a contrasting colour), or
   * when the customer chose a name colour: the name is given that filament in the slicer and drawn in that colour in
   * the preview. Omitted = same as the model. `filament` is the slicer's filament number, if known.
   */
  nameColor: z.object({ hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), filament: z.number().int().min(1).max(32).optional() }).optional(),
  /** Name colours the customer may choose from (besides "same as the product"). Omitted or empty: no choice. */
  nameColors: z
    .array(z.object({ label: z.string().trim().min(1).max(30), hex: z.string().regex(/^#[0-9a-fA-F]{6}$/), filament: z.number().int().min(1).max(32).optional() }))
    .max(12)
    .optional(),
});
export type NameSlot = z.infer<typeof nameSlotSchema>;

/** The fonts a customer can choose between for this slot (always includes the default; one entry = no choice). */
export function fontChoices(slot: Pick<NameSlot, "font" | "fonts">): NameFontId[] {
  const list = slot.fonts?.length ? [...slot.fonts] : [];
  if (!list.includes(slot.font)) list.unshift(slot.font);
  return list;
}

/** The slot with the customer's font applied, if it is one they are allowed to choose; otherwise unchanged. */
export function withFont(slot: NameSlot, requested: string | undefined): NameSlot {
  const ok = requested && (fontChoices(slot) as string[]).includes(requested) ? (requested as NameFontId) : slot.font;
  return ok === slot.font ? slot : { ...slot, font: ok };
}

/** The slot with the customer's name colour applied, if it is one of the offered colours; otherwise unchanged. */
export function withNameColor(slot: NameSlot, requestedHex: string | undefined): NameSlot {
  const hit = requestedHex ? slot.nameColors?.find((c) => c.hex.toLowerCase() === requestedHex.toLowerCase()) : undefined;
  return hit ? { ...slot, nameColor: { hex: hit.hex, ...(hit.filament ? { filament: hit.filament } : {}) } } : slot;
}

// ---------------------------------------------------------------------------------------------------------------------
// How much room there is at a spot: a table measured on the model (see name-space.ts), used to limit the admin's values
// ---------------------------------------------------------------------------------------------------------------------

/** `widths[i]` = the widest name area (mm) that sits fully on the surface when it is `heights[i]` mm tall; 0 = no room. */
export type SpaceTable = { heights: number[]; widths: number[] };

/** Widest area that fits at this height (conservative: uses the next measured height up). */
export function maxWidthFor(t: SpaceTable, height: number): number {
  const i = t.heights.findIndex((h) => h >= height - 1e-9);
  return i < 0 ? 0 : t.widths[i];
}

/** Tallest area that fits at this width. */
export function maxHeightFor(t: SpaceTable, width: number): number {
  let best = 0;
  t.heights.forEach((h, i) => {
    if (t.widths[i] >= width - 1e-9) best = h;
  });
  return best;
}

/** The largest width and the largest height that are each possible on their own at this spot. */
export function spaceLimits(t: SpaceTable): { maxWidth: number; maxHeight: number } {
  let maxHeight = 0;
  t.heights.forEach((h, i) => {
    if (t.widths[i] > 0) maxHeight = h;
  });
  return { maxWidth: Math.max(0, ...t.widths), maxHeight };
}

/**
 * Bring a requested width and height inside the measured room, keeping the one the admin just changed as large as
 * possible and shrinking the other. `changed` says which one the admin edited.
 */
export function clampToSpace(t: SpaceTable, want: { width: number; height: number }, changed: "width" | "height"): { width: number; height: number } {
  const { maxWidth, maxHeight } = spaceLimits(t);
  if (maxWidth <= 0) return { width: 0, height: 0 };
  if (changed === "width") {
    const width = Math.min(want.width, maxWidth);
    return { width, height: Math.min(want.height, maxHeightFor(t, width)) };
  }
  const height = Math.min(want.height, maxHeight);
  return { width: Math.min(want.width, maxWidthFor(t, height)), height };
}

/** A sensible font for the font name a designer used in the slicer (information only; we print with our own fonts). */
export function suggestFont(fontName: string): NameFontId {
  const n = fontName.toLowerCase();
  if (/script|cursive|pacifico|signature|calligraph/.test(n)) return "script";
  if (/marker|felt|hand|brush|sharpie|chalk/.test(n)) return "marker";
  if (/righteous|geometric|futura|avenir|gotham|modern/.test(n)) return "modern";
  if (/condensed|narrow|impact|anton|bebas/.test(n)) return "condensed";
  if (/rounded|chunky|lilita|bubble|baloo|fredoka/.test(n)) return "chunky";
  return "bold";
}

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
  config: Record<string, { text?: string; font?: string; nameColor?: string }>,
  baseKey: string | null,
): { slot: NameSlot; text: string; kind: "stl" | "3mf" } | null {
  const kind = baseKey && /\.(stl|3mf)$/i.exec(baseKey)?.[1].toLowerCase();
  if (kind !== "stl" && kind !== "3mf") return null;
  for (const opt of options) {
    if (opt.type !== "text") continue;
    const slot = slotOf(opt.constraints);
    const text = cleanName(config[opt.id]?.text ?? "");
    if (slot && text) return { slot: withNameColor(withFont(slot, config[opt.id]?.font), config[opt.id]?.nameColor), text, kind }; // the customer's font and name colour, if they chose them
  }
  return null;
}

/** The tallest ink allowed for a slot: its own setting, or 1.5 x the capital height for slots saved before it existed. */
export function slotMaxHeight(slot: Pick<NameSlot, "height" | "maxHeight">): number {
  return slot.maxHeight ?? Math.round(slot.height * 1.5 * 100) / 100;
}

/** How far an engraved name pokes out of the surface so the cut is clean (mm). */
export const ENGRAVE_OVERSHOOT_MM = 0.2;

export const DEFAULT_SLOT_SIZES = { maxWidth: 40, height: 6, maxHeight: 9, depth: 1.2, sink: 0.4, font: "bold" } as const;

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
      /** Final size of the name in mm: ink width and height (with ascenders and descenders), capital height, stroke width. */
      widthMm: number;
      inkHeightMm: number;
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

/**
 * Typical stroke width of the shaped text at `scale`: for a stroke of width w and length L the outline has area w·L and
 * perimeter 2·L, so w ≈ 2·area / perimeter. Measured on the real outlines (holes subtracted), so it follows the actual
 * letters and font. An average, not a minimum: hairline joins in a script font would not show up here.
 */
function strokeWidth(shapes: ReturnType<typeof pathToShapes>, scale: number): number {
  let area = 0, perimeter = 0;
  const ring = (pts: { x: number; y: number }[]) => {
    let a = 0, p = 0;
    for (let i = 0; i < pts.length; i++) {
      const u = pts[i], v = pts[(i + 1) % pts.length];
      a += u.x * v.y - v.x * u.y;
      p += Math.hypot(v.x - u.x, v.y - u.y);
    }
    return { a: Math.abs(a) / 2, p };
  };
  for (const s of shapes) {
    const { shape, holes } = s.extractPoints(6);
    const o = ring(shape);
    area += o.a;
    perimeter += o.p;
    for (const h of holes) {
      const r = ring(h);
      area -= r.a;
      perimeter += r.p;
    }
  }
  return perimeter > 0 ? ((2 * area) / perimeter) * scale : 0;
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
  const inkUnits = box.y2 - box.y1;
  if (!(widthUnits > 0) || !(inkUnits > 0)) return { ok: false, error: "Nothing to print" };

  // wanted size, then shrink until the whole outline (ascenders and descenders included) fits the slot's rectangle
  const wanted = slot.height / capUnits;
  const scale = Math.min(wanted, slot.maxWidth / widthUnits, slotMaxHeight(slot) / inkUnits);
  const scaledDown = scale < wanted - 1e-9;
  const heightMm = capUnits * scale;
  const shapes = pathToShapes(path);
  const stemMm = strokeWidth(shapes, scale);
  if (heightMm < PRINT_LIMITS.minCapHeightMm || stemMm < PRINT_LIMITS.minStemMm) {
    return { ok: false, error: "That name is too long to print clearly in the space available. Try a shorter name." };
  }

  // raised letters stand `depth` out and sink a little in; engraved letters go `depth` in and poke a little out, so the
  // slicer's subtraction leaves no skin
  const engraved = slot.mode === "engraved";
  const behind = engraved ? slot.depth : slot.sink;
  const geometry = new ExtrudeGeometry(shapes, {
    depth: (engraved ? slot.depth + ENGRAVE_OVERSHOOT_MM : slot.depth + slot.sink) / scale, // extruded in font units, scaled to mm below
    bevelEnabled: false,
    curveSegments: 5,
  });
  // centre the ink box on the slot, both ways, so the checked rectangle (maxWidth x maxHeight) always contains the name
  // (opentype's y points down and was flipped above, so the ink spans -y2..-y1)
  geometry.translate(-(box.x1 + box.x2) / 2, (box.y1 + box.y2) / 2, 0);
  geometry.scale(scale, scale, scale);
  geometry.translate(0, 0, -behind);
  geometry.applyMatrix4(slotMatrix(slot));

  return { ok: true, geometry, widthMm: widthUnits * scale, inkHeightMm: inkUnits * scale, heightMm, stemMm, scaledDown };
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
