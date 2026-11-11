/**
 * Server-side print file for a personalized item: the product's original model (STL or 3MF) plus the customer's name
 * as an extra part, rebuilt here from the saved text and slot (never from a mesh the browser sent). The name is a
 * separate part of the SAME object, so the slicer prints one object, lets the name have its own colour or filament,
 * and fuses it with the surface it is sunk into. Also checks that the name's footprint really sits on the surface.
 * Server only: reads the font files from /public/fonts.
 */
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { strFromU8, strToU8, unzipSync, zipSync } from "fflate";
import { Matrix4, Vector3 } from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  buildName, isWatertight, meshBounds, NAME_FONTS, nameSlotSchema, parseFont, slotMatrix, suggestFont, toMesh,
  type Font, type Mesh, type NameFontId, type NameSlot,
} from "./name-mesh";

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

const num = (n: number) => String(Math.round(n * 1e5) / 1e5);
const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);

function meshXml(mesh: Mesh): string {
  const v: string[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) v.push(`<vertex x="${num(mesh.positions[i])}" y="${num(mesh.positions[i + 1])}" z="${num(mesh.positions[i + 2])}"/>`);
  const t: string[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) t.push(`<triangle v1="${mesh.indices[i]}" v2="${mesh.indices[i + 1]}" v3="${mesh.indices[i + 2]}"/>`);
  return `<mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh>`;
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

// ---------------------------------------------------------------------------------------------------------------------
// Reading an existing 3MF (slicer projects such as Bambu Studio's keep geometry in a second file)
// ---------------------------------------------------------------------------------------------------------------------

type Files = Record<string, Uint8Array>;
const MAX_UNZIPPED = 120 * 1024 * 1024; // zip-bomb guard: refuse packages that expand past this
const MAX_TRIANGLES = 3_000_000;

/** Unzip a 3MF with a size cap. */
export function open3mf(data: ArrayBuffer): Files {
  const bytes = new Uint8Array(data);
  let total = 0;
  const files = unzipSync(bytes, {
    filter: (f) => {
      total += f.originalSize;
      if (total > MAX_UNZIPPED) throw new Error("The 3MF file is too large to open");
      return true;
    },
  });
  if (!files["3D/3dmodel.model"]) throw new Error("This is not a valid 3MF file (no 3D/3dmodel.model)");
  return files;
}

const attr = (tag: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];

/** 3MF's row-vector transform ("m00 m01 m02 m10 .. m22 tx ty tz") as a column-vector Matrix4. */
function parseTransform(s: string | undefined): Matrix4 {
  if (!s) return new Matrix4();
  const n = s.trim().split(/\s+/).map(Number);
  if (n.length !== 12 || n.some((x) => !Number.isFinite(x))) throw new Error("Unreadable 3MF transform");
  return new Matrix4().set(n[0], n[3], n[6], n[9], n[1], n[4], n[7], n[10], n[2], n[5], n[8], n[11], 0, 0, 0, 1);
}

type ObjectDef = { mesh?: Mesh; components: { path: string | undefined; id: string; transform: Matrix4 }[] };

function parseObjects(xml: string): Map<string, ObjectDef> {
  const out = new Map<string, ObjectDef>();
  for (const m of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const id = attr(m[1], "id");
    if (!id) continue;
    const body = m[2];
    const def: ObjectDef = { components: [] };
    if (body.includes("<mesh")) {
      const pos: number[] = [];
      for (const v of body.matchAll(/<vertex\b([^>]*)\/?>/g)) pos.push(Number(attr(v[1], "x")), Number(attr(v[1], "y")), Number(attr(v[1], "z")));
      const idx: number[] = [];
      for (const t of body.matchAll(/<triangle\b([^>]*)\/?>/g)) idx.push(Number(attr(t[1], "v1")), Number(attr(t[1], "v2")), Number(attr(t[1], "v3")));
      if (idx.length / 3 > MAX_TRIANGLES) throw new Error("The model has too many triangles");
      def.mesh = { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) };
    }
    for (const c of body.matchAll(/<component\b([^>]*?)\/?>/g)) {
      const cid = attr(c[1], "objectid");
      if (cid) def.components.push({ path: attr(c[1], "p:path"), id: cid, transform: parseTransform(attr(c[1], "transform")) });
    }
    out.set(id, def);
  }
  return out;
}

/** The whole model flattened into one mesh in BUILD space (item and component transforms applied). `skipComponents` leaves out parts of the plate object by position (used to ignore a placeholder). */
export function threeMfSurface(files: Files, opts: { skipComponents?: number[] } = {}): { mesh: Mesh; item: { objectId: string; transform: Matrix4 } } {
  const rootXml = strFromU8(files["3D/3dmodel.model"]);
  const items = [...(/<build\b[^>]*>([\s\S]*?)<\/build>/.exec(rootXml)?.[1] ?? "").matchAll(/<item\b([^>]*?)\/?>/g)];
  if (items.length !== 1) throw new Error("Only 3MF files with a single object on the plate are supported");
  const item = { objectId: attr(items[0][1], "objectid") ?? "", transform: parseTransform(attr(items[0][1], "transform")) };

  const cache = new Map<string, Map<string, ObjectDef>>();
  const defsOf = (file: string) => {
    let d = cache.get(file);
    if (!d) {
      if (!files[file]) throw new Error(`3MF refers to a missing file: ${file}`);
      d = parseObjects(strFromU8(files[file]));
      cache.set(file, d);
    }
    return d;
  };

  const pos: number[] = [];
  const idx: number[] = [];
  const v = new Vector3();
  const walk = (file: string, id: string, m: Matrix4, depth: number) => {
    if (depth > 8) throw new Error("3MF nesting is too deep");
    const def = defsOf(file).get(id);
    if (!def) throw new Error(`3MF refers to a missing object ${id}`);
    if (def.mesh) {
      const base = pos.length / 3;
      for (let i = 0; i < def.mesh.positions.length; i += 3) {
        v.set(def.mesh.positions[i], def.mesh.positions[i + 1], def.mesh.positions[i + 2]).applyMatrix4(m);
        pos.push(v.x, v.y, v.z);
      }
      const flip = m.determinant() < 0; // a mirroring transform reverses the winding
      for (let i = 0; i < def.mesh.indices.length; i += 3) {
        const a = def.mesh.indices[i] + base, b = def.mesh.indices[i + 1] + base, c = def.mesh.indices[i + 2] + base;
        idx.push(a, flip ? c : b, flip ? b : c);
      }
      if (idx.length / 3 > MAX_TRIANGLES) throw new Error("The model has too many triangles");
    }
    def.components.forEach((c, i) => {
      if (depth === 0 && opts.skipComponents?.includes(i)) return; // e.g. the designer's placeholder text
      const target = c.path ? c.path.replace(/^\//, "") : file;
      walk(target, c.id, m.clone().multiply(c.transform), depth + 1);
    });
  };
  walk("3D/3dmodel.model", item.objectId, item.transform.clone(), 0);
  if (idx.length === 0) throw new Error("The 3MF has no geometry");
  return { mesh: { positions: Float32Array.from(pos), indices: Uint32Array.from(idx) }, item };
}

/**
 * Add the name to an existing slicer 3MF as one more part of the plate's object. `nameBuild` is in build space (where
 * the viewer and the slot live), so it is moved into the object's own space by undoing the plate item's transform.
 * Only the common layout is handled (one plate item whose object is made of components, as Bambu Studio, Orca and
 * PrusaSlicer write it); anything else is refused with a message instead of guessing.
 */
export function addNameTo3mf(files: Files, nameBuild: Mesh, label: string, filament?: number): Files {
  const { item } = threeMfSurface(files);
  let root = strFromU8(files["3D/3dmodel.model"]);

  const objRe = new RegExp(`<object\\b([^>]*\\bid="${item.objectId}"[^>]*)>([\\s\\S]*?)</object>`);
  const obj = objRe.exec(root);
  if (!obj || !obj[2].includes("<components")) {
    throw new Error("This 3MF layout is not supported yet (the plate object must be built from parts)");
  }
  const ids = [...root.matchAll(/<object\b[^>]*\bid="(\d+)"/g)].map((m) => Number(m[1]));
  const newId = Math.max(0, ...ids) + 1;

  // build space -> the plate object's own space
  const inv = item.transform.clone().invert();
  const local = Float32Array.from(nameBuild.positions);
  const p = new Vector3();
  for (let i = 0; i < local.length; i += 3) {
    p.set(local[i], local[i + 1], local[i + 2]).applyMatrix4(inv);
    local[i] = p.x; local[i + 1] = p.y; local[i + 2] = p.z;
  }
  const mesh: Mesh = { positions: local, indices: inv.determinant() < 0 ? flipWinding(nameBuild.indices) : nameBuild.indices };

  const withP = /xmlns:p="/.test(root);
  const uuid = () => (withP ? ` p:UUID="${randomUUID()}"` : "");
  const newObject = `<object id="${newId}"${uuid()} name="${esc(label)}" type="model">${meshXml(mesh)}</object>\n  `;
  // referenced objects must be defined before the object that uses them
  root = root.slice(0, obj.index) + newObject + root.slice(obj.index);
  const obj2 = objRe.exec(root)!;
  const newBody = obj2[2].replace(/<\/components>/, `<component objectid="${newId}"${uuid()} transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components>`);
  root = root.slice(0, obj2.index) + obj2[0].replace(obj2[2], newBody) + root.slice(obj2.index + obj2[0].length);

  const out: Files = { ...files, "3D/3dmodel.model": strToU8(root) };

  // Bambu Studio keeps a per-part list in Metadata/model_settings.config: add the name there so the part count matches
  const cfgPath = "Metadata/model_settings.config";
  if (files[cfgPath]) {
    let cfg = strFromU8(files[cfgPath]);
    const objCfg = new RegExp(`(<object\\s+id="${item.objectId}">[\\s\\S]*?)(</object>)`).exec(cfg);
    if (objCfg) {
      const partCount = (objCfg[1].match(/<part\b/g) ?? []).length;
      // the name takes the designer's contrasting filament if there is one, otherwise the object's own
      const objFilament = /<metadata\s+key="extruder"\s+value="(\d+)"/.exec(objCfg[1].split(/<part\b/)[0])?.[1] ?? "1";
      const part =
        `  <part id="${partCount + 1}" subtype="normal_part">\n` +
        `      <metadata key="name" value="${esc(label)}"/>\n` +
        `      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n` +
        `      <metadata key="extruder" value="${filament ?? objFilament}"/>\n` +
        `    </part>\n  `;
      cfg = cfg.replace(objCfg[0], objCfg[1] + part + objCfg[2]);
      out[cfgPath] = strToU8(cfg);
    }
  }
  return out;
}

function flipWinding(ix: Uint32Array): Uint32Array {
  const o = Uint32Array.from(ix);
  for (let i = 0; i < o.length; i += 3) [o[i + 1], o[i + 2]] = [o[i + 2], o[i + 1]];
  return o;
}

// ---------------------------------------------------------------------------------------------------------------------
// Detecting the designer's example text (Bambu Studio / Orca text element) and turning it into a slot
// ---------------------------------------------------------------------------------------------------------------------

/** Filament colours (hex) listed in a Bambu/Orca project, in filament-number order (filament 1 first). */
export function projectFilaments(files: Files): string[] {
  const f = files["Metadata/project_settings.config"];
  if (!f) return [];
  try {
    const list = (JSON.parse(strFromU8(f)) as { filament_colour?: unknown }).filament_colour;
    return Array.isArray(list) ? list.filter((c): c is string => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c)) : [];
  } catch {
    return [];
  }
}

export type DetectedName = {
  /** The example text the designer typed (for the admin to see). */
  text: string;
  /** The slicer's font for the example (only for information: we print with our own fonts). */
  fontName: string;
  /** raised = a normal part; engraved = a negative part. */
  mode: "raised" | "engraved";
  /** Ready to save as the product's name slot (font is our default; the admin may change it). */
  slot: NameSlot;
  /** Index of the placeholder among the plate object's components. */
  componentIndex: number;
  /** The project's filament colours (hex), filament 1 first, and which filament the example text and the model use. */
  filaments: string[];
  nameFilament: number | null;
  bodyFilament: number | null;
  /** Things the admin should know (size clamped, descenders, engraved not supported yet, ...). */
  notes: string[];
};

/**
 * Find a slicer text element on the plate object and read where it sits. Bambu Studio stores a text part with a
 * `<text_info text=".." font_name=".." thickness=".." embeded_depth=".."/>` entry in Metadata/model_settings.config;
 * the geometry itself is an ordinary mesh part whose transform (item x component) places it on the model. The text
 * lies on the part's local XY plane (reads along +X, up is +Y) and is extruded along +Z, so the facing, up direction,
 * size and depth all come from that mesh and transform. Returns null when there is no text element.
 */
export function detectNameSlot(files: Files): DetectedName | null {
  const cfg = files["Metadata/model_settings.config"];
  if (!cfg) return null;
  const root = strFromU8(files["3D/3dmodel.model"]);
  const { item } = threeMfSurface(files, { skipComponents: [] });
  const objCfg = new RegExp(`<object\\s+id="${item.objectId}">([\\s\\S]*?)</object>`).exec(strFromU8(cfg));
  if (!objCfg) return null;
  const parts = [...objCfg[1].matchAll(/<part\b([^>]*)>([\s\S]*?)<\/part>/g)];
  const idx = parts.findIndex((p) => /<text_info\b/.test(p[2]));
  if (idx < 0) return null;
  const part = parts[idx];
  const info = /<text_info\b([^>]*?)\/?>/.exec(part[2])![1];
  const notes: string[] = [];

  // the part list and the object's components are in the same order; the face count confirms it is the right one
  const rootDefs = parseObjects(root);
  const plate = rootDefs.get(item.objectId);
  if (!plate || plate.components.length !== parts.length) return null;
  const comp = plate.components[idx];
  const file = comp.path ? comp.path.replace(/^\//, "") : "3D/3dmodel.model";
  if (!files[file]) return null;
  const def = parseObjects(strFromU8(files[file])).get(comp.id);
  if (!def?.mesh) return null;
  const faces = Number(attr(part[2], "face_count") ?? /face_count="(\d+)"/.exec(part[2])?.[1]);
  if (faces && faces !== def.mesh.indices.length / 3) return null;

  // text mesh: bounding box in its own frame (x along the text, y up, z out of the surface)
  const P = def.mesh.positions;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < P.length; i += 3) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], P[i + k]); hi[k] = Math.max(hi[k], P[i + k]); }
  const W = item.transform.clone().multiply(comp.transform);
  const sx = new Vector3().setFromMatrixColumn(W, 0).length(), sy = new Vector3().setFromMatrixColumn(W, 1).length(), sz = new Vector3().setFromMatrixColumn(W, 2).length();
  const dir = (x: number, y: number, z: number) => new Vector3(x, y, z).transformDirection(W).normalize();
  const pos = new Vector3((lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, 0).applyMatrix4(W);
  const normal = dir(0, 0, 1), up = dir(0, 1, 0);

  const text = /\btext="([^"]*)"/.exec(info)?.[1] ?? "";
  const fontName = /font_name="([^"]*)"/.exec(info)?.[1] ?? "";
  const subtype = attr(part[1], "subtype");
  const mode = subtype === "negative_part" ? "engraved" : "raised";
  if (mode === "engraved") notes.push("The example is a negative part (engraved). Engraved names are not supported yet, so it is treated as raised.");
  if (subtype && !["normal_part", "negative_part"].includes(subtype)) notes.push(`The example's part type is "${subtype}"; expected a normal or negative part.`);

  const clamp = (v: number, a: number, b: number, what: string) => {
    const c = Math.min(b, Math.max(a, v));
    if (c !== v) notes.push(`${what} ${v.toFixed(1)} mm was adjusted to ${c.toFixed(1)} mm to stay within limits.`);
    return Math.round(c * 100) / 100;
  };
  let heightMm = (hi[1] - lo[1]) * sy;
  if (/[gjpqy]/.test(text)) {
    heightMm *= 0.78; // the example's box includes descenders; our height is the capital height
    notes.push("The example has letters with tails, so the capital height was estimated from its box.");
  }
  // filaments: the example's own colour only matters when it differs from the model's (a contrasting name)
  const filaments = projectFilaments(files);
  const ext = (xml: string) => Number(/<metadata\s+key="extruder"\s+value="(\d+)"/.exec(xml)?.[1]) || null;
  const nameFilament = ext(part[2]);
  const bodyFilament = ext(objCfg[1].split(/<part\b/)[0]);
  const contrast = nameFilament && bodyFilament && nameFilament !== bodyFilament ? filaments[nameFilament - 1] : undefined;
  const nameFont = suggestFont(fontName);

  const slot = nameSlotSchema.parse({
    position: pos.toArray().map((v) => Math.round(v * 1000) / 1000),
    normal: normal.toArray().map((v) => Math.round(v * 10000) / 10000),
    up: up.toArray().map((v) => Math.round(v * 10000) / 10000),
    maxWidth: clamp((hi[0] - lo[0]) * sx, 5, 300, "Width"),
    height: clamp(heightMm, 3, 60, "Letter height"),
    depth: clamp(Math.max(hi[2], 0) * sz, 0.6, 5, "Depth"),
    sink: 0.4,
    font: nameFont,
    // offer the closest match plus two sturdy all-rounders; the admin can change the list
    fonts: [...new Set([nameFont, "bold", "chunky"])],
    ...(contrast ? { nameColor: { hex: contrast, filament: nameFilament! } } : {}),
  });
  if (contrast) notes.push(`The example text uses filament ${nameFilament} (${contrast}), different from the model's, so the name keeps that colour.`);
  return { text, fontName, mode, slot, componentIndex: idx, filaments, nameFilament, bodyFilament, notes };
}

/**
 * The model without the designer's example text: the placeholder component, its mesh object and its entry in
 * model_settings.config are removed, so neither the preview nor the print file shows the example.
 */
export function stripPlaceholder(files: Files, componentIndex: number): Files {
  const { item } = threeMfSurface(files);
  const rootXml = strFromU8(files["3D/3dmodel.model"]);
  const plate = parseObjects(rootXml).get(item.objectId);
  const comp = plate?.components[componentIndex];
  if (!plate || !comp) throw new Error("Placeholder text not found");
  const file = comp.path ? comp.path.replace(/^\//, "") : "3D/3dmodel.model";

  // 1) drop the <component> (the n-th one inside the plate object)
  let n = -1;
  const objRe = new RegExp(`(<object\\b[^>]*\\bid="${item.objectId}"[^>]*>)([\\s\\S]*?)(</object>)`);
  const out: Files = { ...files };
  const root2 = rootXml.replace(objRe, (_m, a, body, c) => a + body.replace(/\s*<component\b[^>]*?\/>/g, (t: string) => (++n === componentIndex ? "" : t)) + c);
  out["3D/3dmodel.model"] = strToU8(root2);

  // 2) drop the placeholder's mesh object, unless another component still uses it
  const stillUsed = plate.components.some((c, i) => i !== componentIndex && c.id === comp.id && (c.path ?? "") === (comp.path ?? ""));
  if (!stillUsed) {
    const src = strFromU8(out[file] ?? files[file]);
    out[file] = strToU8(src.replace(new RegExp(`\\s*<object\\b[^>]*\\bid="${comp.id}"[^>]*>[\\s\\S]*?</object>`), ""));
  }

  // 3) drop its part from the slicer's part list
  const cfgPath = "Metadata/model_settings.config";
  if (files[cfgPath]) {
    let k = -1;
    const cfg = strFromU8(files[cfgPath]).replace(new RegExp(`(<object\\s+id="${item.objectId}">)([\\s\\S]*?)(</object>)`), (_m, a, body, c) =>
      a + body.replace(/\s*<part\b[\s\S]*?<\/part>/g, (t: string) => (++k === componentIndex ? "" : t)) + c);
    out[cfgPath] = strToU8(cfg);
  }
  return out;
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
 * The widest name (mm, whole millimetres, never below `floor`) that still sits fully on the surface at this slot with
 * its current letter height, or null if even the floor does not fit (the spot itself is wrong).
 */
export function widestThatFits(base: Mesh, slot: NameSlot, floor = 8): number | null {
  for (let w = Math.floor(slot.maxWidth); w >= floor; w--) {
    if (checkFit(base, slot, w, slot.height).fits) return w;
  }
  return null;
}

/** Load the product's original file as one mesh in build space. */
export function readBaseSurface(data: ArrayBuffer, kind: "stl" | "3mf"): Mesh {
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

export type PrintFile =
  | { ok: false; error: string }
  | {
      ok: true;
      file: Uint8Array;
      /** What the admin should know before printing. */
      report: { nameWatertight: boolean; scaledDown: boolean; widthMm: number; heightMm: number; stemMm: number; fit: FitReport; nameBounds: number[] };
    };

/** Original model (STL or 3MF) + the name at `slot`, as a 3MF. Refuses names that cannot be printed (see `buildName`). */
export async function buildPrintFile(o: { base: ArrayBuffer; kind: "stl" | "3mf"; text: string; slot: NameSlot }): Promise<PrintFile> {
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
      const files = open3mf(o.base);
      surface = threeMfSurface(files).mesh;
      file = zipSync(addNameTo3mf(files, name, label, o.slot.nameColor?.filament), { level: 1 });
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
        fit: checkFit(surface, o.slot, built.widthMm, built.heightMm),
        nameBounds: meshBounds(name),
      },
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the model file" };
  }
}
