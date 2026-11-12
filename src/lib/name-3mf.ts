/**
 * Server-side print file for a personalized item: the product's original model (STL or 3MF) plus the customer's name
 * as an extra part, rebuilt here from the saved text and slot (never from a mesh the browser sent). The name is a
 * separate part of the SAME object, so the slicer prints one object, lets the name have its own colour or filament,
 * and fuses it with the surface it is sunk into. An engraved name is added as a NEGATIVE part, which the slicer
 * subtracts from the model. Also checks that the name's footprint really sits on the surface.
 * Reading and editing the 3MF itself is generic and lives in threemf.ts. Server only: reads the font files from /public/fonts.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { strFromU8, strToU8, zipSync } from "fflate";
import { Matrix4, Vector3 } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  buildName, isWatertight, meshBounds, NAME_FONTS, nameSlotSchema, parseFont, slotMatrix, slotMaxHeight, suggestFont, toMesh,
  type Font, type Mesh, type NameFontId, type NameSlot,
} from "./name-mesh";
import {
  addPartTo3mf, componentTarget, esc, meshXml, open3mf, parseObjects, projectFilaments, readConfigObjects, recolorPaint, removePart, setFilaments, stripPreviewParts, threeMfSurface,
  type ConfigPart, type FilamentAssign, type Files, type ObjectDef, type PaintAssign, type SurfaceMesh,
} from "./threemf";

export { open3mf, projectFilaments, threeMfSurface };

const fonts = new Map<NameFontId, Promise<Font>>();
/** Parsed font, cached for the life of the server process. */
export function loadFont(id: NameFontId): Promise<Font> {
  let f = fonts.get(id);
  if (!f) {
    f = readFile(join(process.cwd(), "public", "fonts", NAME_FONTS[id].file)).then((b) =>
      parseFont(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer),
    );
    fonts.set(id, f);
  }
  return f;
}

/** Binary or ASCII STL -> indexed mesh. Throws if the file has no triangles. */
export function readStlMesh(data: ArrayBuffer): Mesh {
  const geometry = new STLLoader().parse(data);
  if (!geometry.getAttribute("position")?.count) throw new Error("The model file has no triangles");
  return toMesh(geometry);
}

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`;
const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

/**
 * A new 3MF package for an STL base: two mesh objects (Base, Name) and one object that holds both as components, so
 * the slicer sees ONE object with two parts. All in millimetres, at the origin of the shared coordinate space.
 */
export function writeThreeMf(title: string, base: Mesh, name: Mesh, nameLabel: string): Uint8Array {
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${esc(title)}</metadata><resources>` +
    `<object id="1" name="Base" type="model">${meshXml(base)}</object>` +
    `<object id="2" name="${esc(nameLabel)}" type="model">${meshXml(name)}</object>` +
    `<object id="3" name="${esc(title)}" type="model"><components><component objectid="1"/><component objectid="2"/></components></object>` +
    `</resources><build><item objectid="3"/></build></model>`;
  return zipSync(
    { "[Content_Types].xml": strToU8(CONTENT_TYPES), "_rels/.rels": strToU8(ROOT_RELS), "3D/3dmodel.model": strToU8(model) },
    { level: 1 },
  );
}

/**
 * Add the name to an existing slicer 3MF as one more part of a plate object (see `addPartTo3mf`). `nameBuild` is in
 * build space (where the viewer and the slot live). `engraved` adds it as a negative part; `objectId` picks the plate
 * object (default: the first one built from parts).
 */
export function addNameTo3mf(files: Files, nameBuild: Mesh, label: string, o: { filament?: number; engraved?: boolean; objectId?: string } = {}): Files {
  return addPartTo3mf(files, { mesh: nameBuild, label, kind: o.engraved ? "engraved" : "raised", filament: o.filament, objectId: o.objectId });
}

// ---------------------------------------------------------------------------------------------------------------------
// Detecting the designer's example text (Bambu Studio / Orca text element) and turning it into a slot
// ---------------------------------------------------------------------------------------------------------------------

export type DetectedName = {
  /** The example text the designer typed (for the admin to see). */
  text: string;
  /** The slicer's font for the example (only for information: we print with our own fonts). */
  fontName: string;
  /** raised = a normal part; engraved = a negative part. */
  mode: "raised" | "engraved";
  /** Ready to save as the product's name slot (font is our default; the admin may change it). */
  slot: NameSlot;
  /** The plate object the example belongs to, and its index among that object's components. */
  objectId: string;
  componentIndex: number;
  /** The project's filament colours (hex), filament 1 first, and which filament the example text and the model use. */
  filaments: string[];
  nameFilament: number | null;
  bodyFilament: number | null;
  /** Things the admin should know (size clamped, descenders, ...). */
  notes: string[];
};

/**
 * Find a slicer text element on any plate object and read where it sits. Bambu Studio stores a text part with a
 * `<text_info text=".." font_name=".." thickness=".." embeded_depth=".."/>` entry in Metadata/model_settings.config;
 * the geometry itself is an ordinary mesh part whose transform (item x component) places it on the model. The text
 * lies on the part's local XY plane (reads along +X, up is +Y); raised text is extruded along +Z and engraved text
 * (a negative part) goes into the model along -Z. Returns null when there is no text element.
 */
export function detectNameSlot(files: Files): DetectedName | null {
  const cfgObjects = readConfigObjects(files);
  const rootDefs = parseObjects(strFromU8(files["3D/3dmodel.model"]));
  const { items } = threeMfSurface(files);
  for (const co of cfgObjects) {
    const part = co.parts.find((p) => p.text !== null);
    const item = items.find((i) => i.objectId === co.id);
    const plate = rootDefs.get(co.id);
    if (!part || !item || !plate) continue;
    // the part list and the object's components are in the same order; the face count confirms it is the right one
    if (plate.components.length !== co.parts.length) continue;
    const comp = plate.components[part.index];
    const t = componentTarget(comp);
    if (!files[t.file]) continue;
    const def = parseObjects(strFromU8(files[t.file])).get(t.id);
    if (!def?.mesh) continue;
    if (part.faceCount && part.faceCount !== def.mesh.indices.length / 3) continue;
    return describe(files, co.id, item.transform, part, comp, def.mesh, co.extruder);
  }
  return null;
}

function describe(
  files: Files,
  objectId: string,
  itemTransform: Matrix4,
  part: ConfigPart,
  comp: ObjectDef["components"][number],
  mesh: Mesh,
  bodyFilament: number | null,
): DetectedName {
  const notes: string[] = [];
  // text mesh: bounding box in its own frame (x along the text, y up, z out of the surface)
  const P = mesh.positions;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  const W = itemTransform.clone().multiply(comp.transform);
  const sx = new Vector3().setFromMatrixColumn(W, 0).length(), sy = new Vector3().setFromMatrixColumn(W, 1).length(), sz = new Vector3().setFromMatrixColumn(W, 2).length();
  const dir = (x: number, y: number, z: number) => new Vector3(x, y, z).transformDirection(W).normalize();
  const pos = new Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0).applyMatrix4(W);
  const normal = dir(0, 0, 1), up = dir(0, 1, 0);

  const text = part.text ?? "";
  const fontName = part.fontName;
  const mode = part.subtype === "negative_part" ? "engraved" : "raised";
  if (!["normal_part", "negative_part"].includes(part.subtype)) notes.push(`The example's part type is "${part.subtype}"; expected a normal or negative part.`);

  const clamp = (v: number, a: number, b: number, what: string) => {
    const c = Math.min(b, Math.max(a, v));
    if (c !== v) notes.push(`${what} ${v.toFixed(1)} mm was adjusted to ${c.toFixed(1)} mm to stay within limits.`);
    return Math.round(c * 100) / 100;
  };
  const inkHeight = (hi[1] - lo[1]) * sy;
  let heightMm = inkHeight;
  if (/[gjpqy]/.test(text)) {
    heightMm *= 0.78; // the example's box includes descenders; our height is the capital height
    notes.push("The example has letters with tails, so the capital height was estimated from its box.");
  }
  // filaments: the example's own colour only matters when it differs from the model's (a contrasting name)
  const filaments = projectFilaments(files);
  const nameFilament = part.extruder;
  const contrast = mode === "raised" && nameFilament && bodyFilament && nameFilament !== bodyFilament ? filaments[nameFilament - 1] : undefined;
  const nameFont = suggestFont(fontName);
  const depthLocal = mode === "engraved" ? Math.max(-lo[2], 0) : Math.max(hi[2], 0);

  const slot = nameSlotSchema.parse({
    position: pos.toArray().map((v) => Math.round(v * 1000) / 1000),
    normal: normal.toArray().map((v) => Math.round(v * 10000) / 10000),
    up: up.toArray().map((v) => Math.round(v * 10000) / 10000),
    maxWidth: clamp((hi[0] - lo[0]) * sx, 5, 300, "Width"),
    height: clamp(heightMm, 3, 60, "Letter height"),
    maxHeight: clamp(inkHeight, 3, 120, "Name area height"), // the designer's example box: everything inside it is known to sit on the surface
    depth: clamp(depthLocal * sz, 0.6, 5, "Depth"),
    sink: 0.4,
    font: nameFont,
    // offer the closest match plus two sturdy all-rounders; the admin can change the list
    fonts: [...new Set([nameFont, "bold", "chunky"])],
    ...(mode === "engraved" ? { mode: "engraved" } : {}),
    object: objectId,
    ...(contrast ? { nameColor: { hex: contrast, filament: nameFilament! } } : {}),
  });
  if (mode === "engraved") notes.push("The example is a negative part, so the name is engraved (cut into the model) to the same depth.");
  if (contrast) notes.push(`The example text uses filament ${nameFilament} (${contrast}), different from the model's, so the name keeps that colour.`);
  return { text, fontName, mode, slot, objectId, componentIndex: part.index, filaments, nameFilament, bodyFilament, notes };
}

/**
 * The model without the designer's example text: the placeholder component, its mesh object and its entry in
 * model_settings.config are removed, so neither the preview nor the print file shows the example.
 */
export function stripPlaceholder(files: Files, objectId: string, componentIndex: number): Files {
  return removePart(files, objectId, componentIndex);
}

// ---------------------------------------------------------------------------------------------------------------------
// Does the name sit on the surface?
// ---------------------------------------------------------------------------------------------------------------------

/** Distance from `origin` along unit `dir` to the first triangle hit (Möller–Trumbore), or null. */
function firstHit(mesh: Mesh, origin: Vector3, dir: Vector3): number | null {
  const { positions: P, indices: I } = mesh;
  let best = Infinity;
  const e1 = new Vector3(), e2 = new Vector3(), h = new Vector3(), s = new Vector3(), q = new Vector3();
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  for (let t = 0; t < I.length; t += 3) {
    a.fromArray(P, I[t] * 3); b.fromArray(P, I[t + 1] * 3); c.fromArray(P, I[t + 2] * 3);
    e1.subVectors(b, a); e2.subVectors(c, a);
    h.crossVectors(dir, e2);
    const det = e1.dot(h);
    if (Math.abs(det) < 1e-12) continue;
    const f = 1 / det;
    s.subVectors(origin, a);
    const u = f * s.dot(h);
    if (u < 0 || u > 1) continue;
    q.crossVectors(s, e1);
    const v = f * dir.dot(q);
    if (v < 0 || u + v > 1) continue;
    const d = f * e2.dot(q);
    if (d > 1e-6 && d < best) best = d;
  }
  return best === Infinity ? null : best;
}

export type FitReport = {
  fits: boolean;
  /** Plain-language reason when it does not fit. */
  problem: string | null;
  /** For each tested point (centre, four corners, four edge midpoints): mm the surface is below (+) or above (−) the slot plane; null = no surface there. */
  gaps: (number | null)[];
};

/** How far the surface may be off the slot plane under the name before we call it floating or buried (mm). */
export const FIT_TOLERANCE_MM = 0.7;

/**
 * Check the area a name of up to `widthMm` × `heightMm` would cover: the surface must be under every sample point,
 * close to the slot plane. Catches a name hanging over an edge, sitting over a hole, or starting inside a wall.
 */
export function checkFit(base: Mesh, slot: NameSlot, widthMm: number, heightMm: number): FitReport {
  const m = slotMatrix(slot);
  const n = new Vector3(...slot.normal).normalize();
  const hw = widthMm / 2, hh = heightMm / 2;
  const pts: [number, number][] = [[0, 0], [-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh], [0, -hh], [0, hh], [-hw, 0], [hw, 0]];
  const LIFT = 20; // start the ray this far above the slot plane
  const gaps = pts.map(([x, y]) => {
    const on = new Vector3(x, y, 0).applyMatrix4(m);
    const d = firstHit(base, on.clone().addScaledVector(n, LIFT), n.clone().negate());
    return d === null ? null : Math.round((d - LIFT) * 100) / 100;
  });
  const missing = gaps.filter((g) => g === null).length;
  const off = gaps.filter((g) => g !== null && Math.abs(g) > FIT_TOLERANCE_MM).length;
  const fits = missing === 0 && off === 0;
  return {
    fits,
    gaps,
    problem: fits
      ? null
      : `A name this big would not sit fully on the surface here (${missing ? `${missing} of ${pts.length} points are over empty space` : `${off} of ${pts.length} points are on a different level`}). Reduce "Widest name" or "Letter height", or move the spot.`,
  };
}

/**
 * How much the slot's rectangle (widest x tallest name) has to shrink, as a factor from 1 down to 0.4, to sit fully on
 * the surface; 1 = it already fits, null = it does not fit even at 40 % (the spot itself is wrong).
 */
export function fitScale(base: Mesh, slot: NameSlot): number | null {
  const h = slotMaxHeight(slot);
  for (let k = 1; k >= 0.4 - 1e-9; k -= 0.05) {
    if (checkFit(base, slot, slot.maxWidth * k, h * k).fits) return Math.round(k * 100) / 100;
  }
  return null;
}

/** The same slot with its rectangle shrunk by `k` (see `fitScale`), to one decimal place. */
export function shrinkSlot(slot: NameSlot, k: number): NameSlot {
  const r = (v: number) => Math.floor(v * k * 10) / 10;
  return { ...slot, maxWidth: r(slot.maxWidth), maxHeight: r(slotMaxHeight(slot)) };
}

/** Thinnest wall the slicer can print behind an engraving (mm): the name's depth plus this must fit in the wall. */
export const MIN_WALL_BEHIND_MM = 0.8;

/**
 * How thick the model is behind the name area: from the slot plane straight into the model to the first surface on the
 * far side, at the nine sample points of a `widthMm` × `heightMm` area; the thinnest is returned. null when nothing is
 * behind a point (open mesh), which cannot be judged. An engraving must be at least `MIN_WALL_BEHIND_MM` shallower.
 */
export function wallThickness(base: Mesh, slot: NameSlot, widthMm: number, heightMm: number): number | null {
  const m = slotMatrix(slot);
  const n = new Vector3(...slot.normal).normalize();
  const hw = widthMm / 2, hh = heightMm / 2;
  const pts: [number, number][] = [[0, 0], [-hw, -hh], [hw, -hh], [-hw, hh], [hw, hh], [0, -hh], [0, hh], [-hw, 0], [hw, 0]];
  const START = 0.8; // begin this far inside the model, past any surface roughness at the plane
  let thin: number | null = null;
  for (const [x, y] of pts) {
    const on = new Vector3(x, y, 0).applyMatrix4(m);
    const d = firstHit(base, on.clone().addScaledVector(n, -START), n.clone().negate());
    if (d === null) return null;
    thin = Math.min(thin ?? Infinity, d + START);
  }
  return thin === null ? null : Math.round(thin * 100) / 100;
}

/** Plain-language reason an engraving of this depth does not leave enough wall behind it, or null. */
export function engraveProblem(base: Mesh, slot: NameSlot, widthMm: number, heightMm: number): string | null {
  if (slot.mode !== "engraved") return null;
  const wall = wallThickness(base, slot, widthMm, heightMm);
  if (wall === null) return "Could not tell how thick the model is behind the name. Check that the model is a closed solid.";
  if (slot.depth + MIN_WALL_BEHIND_MM > wall + 1e-9) {
    const ok = Math.floor((wall - MIN_WALL_BEHIND_MM) * 10) / 10;
    return `The model is only ${wall} mm thick behind the name. An engraving that deep would break through: set the depth to ${Math.max(ok, 0)} mm or less, or choose a thicker spot.`;
  }
  return null;
}

/** Load the product's original file as one mesh in build space. */
export function readBaseSurface(data: ArrayBuffer, kind: "stl" | "3mf"): SurfaceMesh {
  return kind === "stl" ? readStlMesh(data) : threeMfSurface(open3mf(data)).mesh;
}

/** Plain-language reason a name cannot be made at this slot (letters the font lacks, too long to print), or null. */
export async function nameProblem(slot: NameSlot, text: string): Promise<string | null> {
  const r = buildName(await loadFont(slot.font), text, slot);
  if (r.ok) {
    r.geometry.dispose();
    return null;
  }
  return r.error;
}

/** The base 3MF with the customer's part colours applied (which filament each part prints with); no name. */
export function buildColoredFile(base: ArrayBuffer, colors: FilamentAssign[], paint: PaintAssign[] = []): Uint8Array {
  return zipSync(forPrinting(open3mf(base), colors, paint), { level: 1 });
}

/** A stored model ready to print: preview helper parts removed, the customer's part colours and painted-area colours applied. */
function forPrinting(files: Files, colors: FilamentAssign[], paint: PaintAssign[]): Files {
  return recolorPaint(setFilaments(stripPreviewParts(files), colors), paint);
}

export type PrintFile =
  | { ok: false; error: string }
  | {
      ok: true;
      file: Uint8Array;
      /** What the admin should know before printing. */
      report: { nameWatertight: boolean; scaledDown: boolean; widthMm: number; heightMm: number; stemMm: number; fit: FitReport; nameBounds: number[] };
    };

/** Original model (STL or 3MF) + the name at `slot`, as a 3MF. Refuses names that cannot be printed (see `buildName`). */
export async function buildPrintFile(o: { base: ArrayBuffer; kind: "stl" | "3mf"; text: string; slot: NameSlot; colors?: FilamentAssign[]; paint?: PaintAssign[] }): Promise<PrintFile> {
  if (o.slot.mode === "engraved" && o.kind !== "3mf") return { ok: false, error: "Engraved names need a 3MF slicer project (an STL has no way to cut a part out)" };
  const font = await loadFont(o.slot.font);
  const built = buildName(font, o.text, o.slot);
  if (!built.ok) return built;
  const name = toMesh(built.geometry);
  const label = `Name: ${o.text}`;
  try {
    let file: Uint8Array;
    let surface: Mesh;
    if (o.kind === "stl") {
      surface = readStlMesh(o.base);
      file = writeThreeMf(`Personalized: ${o.text}`, surface, name, label);
    } else {
      const files = forPrinting(open3mf(o.base), o.colors ?? [], o.paint ?? []); // the customer's colours, then the name
      surface = threeMfSurface(files).mesh;
      file = zipSync(addNameTo3mf(files, name, label, { filament: o.slot.nameColor?.filament, engraved: o.slot.mode === "engraved", objectId: o.slot.object }), { level: 1 });
    }
    return {
      ok: true,
      file,
      report: {
        nameWatertight: isWatertight(name),
        scaledDown: built.scaledDown,
        widthMm: built.widthMm,
        heightMm: built.heightMm,
        stemMm: built.stemMm,
        fit: checkFit(surface, o.slot, built.widthMm, built.inkHeightMm),
        nameBounds: meshBounds(name),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the model file" };
  }
}
