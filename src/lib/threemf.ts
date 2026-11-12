/**
 * Reading and editing 3MF packages (Bambu Studio / Orca / PrusaSlicer projects). Generic: nothing here knows about names.
 * Pure (no I/O): works on the unzipped files.
 *
 * What a slicer project looks like: `3D/3dmodel.model` holds the plate (`<build>` items) and objects made of
 * `<components>`; the geometry usually sits in a second file (`3D/Objects/object_N.model`); and
 * `Metadata/model_settings.config` holds the slicer's own view of each object: its parts, their types (normal part,
 * negative part, modifier ...) and the filament ("extruder") each part or object prints with.
 *
 * Coordinates: "build space" is the plate (item and component transforms applied), which is also what the 3D viewer
 * shows. 3MF writes transforms as row vectors ("m00 m01 m02 m10 ... tx ty tz").
 */
import { randomUUID } from "node:crypto";
import { strFromU8, strToU8, unzipSync } from "fflate";
import { Matrix4, Vector3 } from "three";
import type { Mesh } from "./name-mesh";
import { HIDDEN_PART_NAME } from "./viewer-framing";

export type Files = Record<string, Uint8Array>;
const MAX_UNZIPPED = 120 * 1024 * 1024; // zip-bomb guard: refuse packages that expand past this
export const MAX_TRIANGLES = 3_000_000;

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

export const attr = (tag: string, name: string) => new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(tag)?.[1];
export const esc = (s: string) => s.replace(/[<>&"']/g, (c) => `&#${c.charCodeAt(0)};`);
const num = (n: number) => String(Math.round(n * 1e5) / 1e5);

/** 3MF's row-vector transform as a column-vector Matrix4. */
export function parseTransform(s: string | undefined): Matrix4 {
  if (!s) return new Matrix4();
  const n = s.trim().split(/\s+/).map(Number);
  if (n.length !== 12 || n.some((x) => !Number.isFinite(x))) throw new Error("Unreadable 3MF transform");
  return new Matrix4().set(n[0], n[3], n[6], n[9], n[1], n[4], n[7], n[10], n[2], n[5], n[8], n[11], 0, 0, 0, 1);
}

export function meshXml(mesh: Mesh): string {
  const v: string[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) v.push(`<vertex x="${num(mesh.positions[i])}" y="${num(mesh.positions[i + 1])}" z="${num(mesh.positions[i + 2])}"/>`);
  const t: string[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) t.push(`<triangle v1="${mesh.indices[i]}" v2="${mesh.indices[i + 1]}" v3="${mesh.indices[i + 2]}"/>`);
  return `<mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh>`;
}

export function flipWinding(ix: Uint32Array): Uint32Array {
  const o = Uint32Array.from(ix);
  for (let i = 0; i < o.length; i += 3) [o[i + 1], o[i + 2]] = [o[i + 2], o[i + 1]];
  return o;
}

// ---------------------------------------------------------------------------------------------------------------------
// The model: objects, components, plate items, and the flattened surface
// ---------------------------------------------------------------------------------------------------------------------

export type ObjectDef = {
  /** "model" is solid geometry; "other" is what slicers use for negative parts and modifiers (not part of the product). */
  type: string;
  mesh?: Mesh;
  components: { path: string | undefined; id: string; transform: Matrix4 }[];
};

export function parseObjects(xml: string): Map<string, ObjectDef> {
  const out = new Map<string, ObjectDef>();
  for (const m of xml.matchAll(/<object\b([^>]*)>([\s\S]*?)<\/object>/g)) {
    const id = attr(m[1], "id");
    if (!id) continue;
    const body = m[2];
    const def: ObjectDef = { type: attr(m[1], "type") ?? "model", components: [] };
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

export type PlateItem = { objectId: string; transform: Matrix4 };

/** A flattened surface that remembers which triangles came from which plate object. */
export type SurfaceMesh = Mesh & { parts?: { objectId: string; from: number; to: number }[] };

/**
 * The plate object nearest to a point (the one whose vertices come closest), so a name placed by clicking goes into the
 * object that was clicked. null when the surface has fewer than two plate objects (no choice to make).
 */
export function plateObjectNear(surface: SurfaceMesh, point: [number, number, number]): string | null {
  if (!surface.parts || surface.parts.length < 2) return null;
  let best: string | null = null, bestD = Infinity;
  for (const part of surface.parts) {
    for (let t = part.from; t < part.to; t++) {
      for (let k = 0; k < 3; k++) {
        const o = surface.indices[t * 3 + k] * 3;
        const d = (surface.positions[o] - point[0]) ** 2 + (surface.positions[o + 1] - point[1]) ** 2 + (surface.positions[o + 2] - point[2]) ** 2;
        if (d < bestD) { bestD = d; best = part.objectId; }
      }
    }
  }
  return best;
}

/** Everything placed on the plate (`<build><item …/>`). */
export function plateItems(files: Files): PlateItem[] {
  const root = strFromU8(files["3D/3dmodel.model"]);
  return [...(/<build\b[^>]*>([\s\S]*?)<\/build>/.exec(root)?.[1] ?? "").matchAll(/<item\b([^>]*?)\/?>/g)].map((m) => ({
    objectId: attr(m[1], "objectid") ?? "",
    transform: parseTransform(attr(m[1], "transform")),
  }));
}

/** Where a component's mesh object lives: the file and id it points at. */
export function componentTarget(c: { path: string | undefined; id: string }): { file: string; id: string } {
  return { file: c.path ? c.path.replace(/^\//, "") : "3D/3dmodel.model", id: c.id };
}

/**
 * Everything on the plate flattened into one mesh in BUILD space. Only solid geometry counts: objects of another type
 * (negative parts, modifiers) are not part of the product. `skip` leaves out components of a plate object by
 * `[objectId, componentIndex]` (used to ignore a placeholder).
 */
export function threeMfSurface(files: Files, opts: { skip?: [string, number][] } = {}): { mesh: SurfaceMesh; items: PlateItem[] } {
  const items = plateItems(files);
  if (items.length === 0) throw new Error("The 3MF has nothing on the plate");
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
  const walk = (file: string, id: string, m: Matrix4, depth: number, plateId: string | null) => {
    if (depth > 8) throw new Error("3MF nesting is too deep");
    const def = defsOf(file).get(id);
    if (!def) throw new Error(`3MF refers to a missing object ${id}`);
    if (def.type !== "model" && depth > 0) return; // a negative part or modifier
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
      if (depth === 0 && opts.skip?.some(([o, k]) => o === plateId && k === i)) return;
      const t = componentTarget(c);
      walk(t.file, t.id, m.clone().multiply(c.transform), depth + 1, plateId);
    });
  };
  const parts: NonNullable<SurfaceMesh["parts"]> = [];
  for (const item of items) {
    const from = idx.length / 3;
    walk("3D/3dmodel.model", item.objectId, item.transform.clone(), 0, item.objectId);
    parts.push({ objectId: item.objectId, from, to: idx.length / 3 });
  }
  if (idx.length === 0) throw new Error("The 3MF has no geometry");
  return { mesh: { positions: Float32Array.from(pos), indices: Uint32Array.from(idx), parts }, items };
}

// ---------------------------------------------------------------------------------------------------------------------
// The slicer's own view: parts, types and filaments (Metadata/model_settings.config)
// ---------------------------------------------------------------------------------------------------------------------

const CFG = "Metadata/model_settings.config";

export type ConfigPart = {
  /** The slicer's part id (the `id` attribute), not the position. */
  id: string;
  /** Position among the object's parts, which equals the position among its components. */
  index: number;
  subtype: string;
  name: string;
  /** Filament number of the part itself, or null to follow the object. */
  extruder: number | null;
  /** The text of a slicer text element, or null for an ordinary part. */
  text: string | null;
  fontName: string;
  faceCount: number | null;
};
export type ConfigObject = { id: string; name: string; extruder: number | null; parts: ConfigPart[] };

const metaValue = (xml: string, key: string) => new RegExp(`<metadata\\s+key="${key}"\\s+value="([^"]*)"`).exec(xml)?.[1];

export function readConfigObjects(files: Files): ConfigObject[] {
  const cfg = files[CFG];
  if (!cfg) return [];
  const out: ConfigObject[] = [];
  for (const o of strFromU8(cfg).matchAll(/<object\s+id="(\d+)">([\s\S]*?)<\/object>/g)) {
    const head = o[2].split(/<part\b/)[0];
    const parts: ConfigPart[] = [...o[2].matchAll(/<part\b([^>]*)>([\s\S]*?)<\/part>/g)].map((p, index) => ({
      id: attr(p[1], "id") ?? String(index + 1),
      index,
      subtype: attr(p[1], "subtype") ?? "normal_part",
      name: metaValue(p[2], "name") ?? "",
      extruder: Number(metaValue(p[2], "extruder")) || null,
      text: /<text_info\b[^>]*\btext="([^"]*)"/.exec(p[2])?.[1] ?? null,
      fontName: /<text_info\b[^>]*\bfont_name="([^"]*)"/.exec(p[2])?.[1] ?? "",
      faceCount: Number(/face_count="(\d+)"/.exec(p[2])?.[1]) || null,
    }));
    out.push({ id: o[1], name: metaValue(head, "name") ?? "", extruder: Number(metaValue(head, "extruder")) || null, parts });
  }
  return out;
}

/** Filament colours (hex) listed in a project, in filament-number order (filament 1 first). */
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

// ---------------------------------------------------------------------------------------------------------------------
// Colour groups: the parts of the product that print in one filament, so each can be coloured on its own
// ---------------------------------------------------------------------------------------------------------------------

export type PartRef = { objectId: string; partId: string };
export type ColorGroup = {
  /** The filament the designer printed this group with. */
  filament: number;
  /** A readable name from the part names ("Ball", "Paddle Holder"). */
  label: string;
  parts: PartRef[];
};

const prettyPartName = (n: string) =>
  n.replace(/\.(stl|3mf|obj|step)$/i, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim() || "Part";

/** Groups of ordinary printed parts (not negative parts, modifiers or the example text) by the filament they use. `exclude` skips parts as `objectId:partId`. */
export function colorGroups(files: Files, exclude: Set<string> = new Set()): ColorGroup[] {
  const groups = new Map<number, ColorGroup>();
  for (const o of readConfigObjects(files)) {
    for (const p of o.parts) {
      if (p.subtype !== "normal_part" || p.text !== null || exclude.has(`${o.id}:${p.id}`)) continue;
      const filament = p.extruder ?? o.extruder ?? 1;
      let g = groups.get(filament);
      if (!g) groups.set(filament, (g = { filament, label: prettyPartName(p.name || o.name), parts: [] }));
      g.parts.push({ objectId: o.id, partId: p.id });
    }
  }
  const list = [...groups.values()];
  const seen = new Map<string, number>();
  for (const g of list) seen.set(g.label, (seen.get(g.label) ?? 0) + 1);
  return list.map((g) => ((seen.get(g.label) ?? 0) > 1 ? { ...g, label: `${g.label} ${g.filament}` } : g));
}

/** The name a group's meshes carry in the stored preview model, so the 3D viewer can colour them. */
export const groupMeshName = (i: number) => `dc-slot-${i}`;

/** Name given to negative parts and modifiers in the stored preview model, so the 3D viewer hides them. */
export const HIDDEN_MESH_NAME = HIDDEN_PART_NAME;

/** `<object …>` opening tag with its `name` attribute set (added when missing). */
function withObjectName(tag: string, inner: string, name: string): string {
  return /\sname="[^"]*"/.test(inner) ? tag.replace(/\sname="[^"]*"/, ` name="${name}"`) : tag.replace(inner, `${inner} name="${name}"`);
}

/**
 * Prepare the stored copy of a model for the 3D viewer: the mesh objects of each colour group get a name
 * (`dc-slot-<n>`) that the viewer reads back to colour the group, and negative parts / modifiers (objects of type
 * "other", which a slicer subtracts or ignores but the viewer would draw as solid) are named `dc-hide`. Only names
 * change; geometry and the slicer settings are untouched, so the file still prints as designed. A mesh shared by parts
 * of different groups cannot be told apart, so that group is skipped (and reported).
 */
export function annotateGroups(files: Files, groups: ColorGroup[]): { files: Files; named: number[]; skipped: number[]; hidden: number } {
  const rootXml = strFromU8(files["3D/3dmodel.model"]);
  const rootDefs = parseObjects(rootXml);
  const cfg = readConfigObjects(files);
  // which group each (file, mesh object) belongs to
  const owner = new Map<string, number | "mixed">();
  const targets: { group: number; file: string; id: string }[] = [];
  groups.forEach((g, gi) => {
    for (const ref of g.parts) {
      const plate = rootDefs.get(ref.objectId);
      const part = cfg.find((o) => o.id === ref.objectId)?.parts.find((p) => p.id === ref.partId);
      const comp = plate && part ? plate.components[part.index] : undefined;
      if (!comp) continue;
      const t = componentTarget(comp);
      const key = `${t.file}#${t.id}`;
      owner.set(key, owner.has(key) && owner.get(key) !== gi ? "mixed" : gi);
      targets.push({ group: gi, ...t });
    }
  });
  const out: Files = { ...files };
  const texts = new Map<string, string>();
  const named = new Set<number>(), skipped = new Set<number>();
  for (const t of targets) {
    if (owner.get(`${t.file}#${t.id}`) === "mixed") {
      skipped.add(t.group);
      continue;
    }
    const src = texts.get(t.file) ?? strFromU8(files[t.file]);
    const m = new RegExp(`<object\\b([^>]*\\bid="${t.id}"[^>]*)>`).exec(src);
    if (!m) continue;
    texts.set(t.file, src.replace(m[0], withObjectName(m[0], m[1], groupMeshName(t.group))));
    named.add(t.group);
  }
  let hidden = 0;
  for (const file of Object.keys(files)) {
    if (!/\.model$/.test(file)) continue;
    const src = texts.get(file) ?? strFromU8(files[file]);
    const next = src.replace(/<object\b([^>]*\btype="other"[^>]*)>/g, (m, inner: string) => {
      hidden++;
      return withObjectName(m, inner, HIDDEN_MESH_NAME);
    });
    if (next !== src) texts.set(file, next);
  }
  for (const [file, text] of texts) out[file] = strToU8(text);
  return { files: out, named: [...named].filter((g) => !skipped.has(g)), skipped: [...skipped], hidden };
}

/**
 * Change which filament parts print with, in the slicer's own part list. When every ordinary part of an object ends up
 * on the same filament the object's own filament is set too, so the slicer shows it consistently.
 */
export type FilamentAssign = { objectId: string; partId: string; filament: number };
export function setFilaments(files: Files, assigns: FilamentAssign[]): Files {
  if (!files[CFG] || assigns.length === 0) return files;
  let cfg = strFromU8(files[CFG]);
  const byObject = new Map<string, Map<string, number>>();
  for (const a of assigns) {
    if (!byObject.has(a.objectId)) byObject.set(a.objectId, new Map());
    byObject.get(a.objectId)!.set(a.partId, a.filament);
  }
  const objects = readConfigObjects(files);
  for (const [objectId, parts] of byObject) {
    cfg = cfg.replace(new RegExp(`(<object\\s+id="${objectId}">)([\\s\\S]*?)(</object>)`), (_m, open: string, body: string, close: string) => {
      let b = body.replace(/<part\b([^>]*)>([\s\S]*?)<\/part>/g, (whole: string, a: string, inner: string) => {
        const f = parts.get(attr(a, "id") ?? "");
        if (!f) return whole;
        const meta = `<metadata key="extruder" value="${f}"/>`;
        return /<metadata\s+key="extruder"/.test(inner)
          ? `<part${a}>${inner.replace(/<metadata\s+key="extruder"\s+value="\d+"\s*\/>/, meta)}</part>`
          : `<part${a}>${inner.replace(/\s*$/, "")}\n      ${meta}\n    </part>`;
      });
      const obj = objects.find((o) => o.id === objectId);
      const plain = obj?.parts.filter((p) => p.subtype === "normal_part" && p.text === null) ?? [];
      const targets = new Set(plain.map((p) => parts.get(p.id) ?? p.extruder ?? obj?.extruder ?? 1));
      if (plain.length && targets.size === 1 && plain.every((p) => parts.has(p.id))) {
        const f = [...targets][0];
        const head = b.split(/<part\b/)[0];
        const newHead = /<metadata\s+key="extruder"/.test(head)
          ? head.replace(/<metadata\s+key="extruder"\s+value="\d+"\s*\/>/, `<metadata key="extruder" value="${f}"/>`)
          : `${head}<metadata key="extruder" value="${f}"/>\n    `;
        b = newHead + b.slice(head.length);
      }
      return open + b + close;
    });
  }
  return { ...files, [CFG]: strToU8(cfg) };
}

// ---------------------------------------------------------------------------------------------------------------------
// Painted areas (Bambu Studio / Orca / PrusaSlicer colour painting) -> parts of their own
// ---------------------------------------------------------------------------------------------------------------------

type V3 = [number, number, number];
export type PaintLeaf = { state: number; tri: [V3, V3, V3] };

const mid = (p: V3, q: V3): V3 => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2, (p[2] + q[2]) / 2];

/**
 * Decode a triangle's paint string (`paint_color` in Bambu/Orca, `slic3rpe:mmu_segmentation` in PrusaSlicer) into the
 * small triangles it was cut into, each with its state (0 = unpainted, k = filament k). This is the slicer's own
 * encoding (TriangleSelector::serialize): the hex string read from its LAST character is a stream of 4-bit codes; a code
 * holds the number of split sides (low 2 bits) and, for a split triangle, which side is special (high 2 bits), followed
 * by its children in descending order; a leaf holds its state, with 0b11 meaning "3 + the next code". The split rules
 * below are the slicer's `perform_split`. null when the string cannot be read.
 */
export function paintLeaves(code: string, a: V3, b: V3, c: V3): PaintLeaf[] | null {
  const nibbles: number[] = [];
  for (let i = code.length - 1; i >= 0; i--) {
    const n = parseInt(code[i], 16);
    if (Number.isNaN(n)) return null;
    nibbles.push(n);
  }
  let at = 0;
  const leaves: PaintLeaf[] = [];
  const next = () => {
    if (at >= nibbles.length) throw new Error("short");
    return nibbles[at++];
  };
  const walk = (t: [V3, V3, V3], depth: number) => {
    if (depth > 12) throw new Error("deep");
    const c0 = next();
    const splits = c0 & 3;
    if (splits === 0) {
      let state = c0 >> 2;
      if ((c0 & 12) === 12) {
        let n = next(), runs = 0;
        while (n === 15) { runs++; n = next(); }
        state = n + 15 * runs + 3;
      }
      leaves.push({ state, tri: t });
      return;
    }
    const special = (c0 >> 2) % 3;
    const [A, B, C] = [t[special], t[(special + 1) % 3], t[(special + 2) % 3]];
    let kids: [V3, V3, V3][];
    if (splits === 1) {
      const m = mid(C, B);
      kids = [[A, B, m], [m, C, A]];
    } else if (splits === 2) {
      const m1 = mid(B, A), m2 = mid(A, C);
      kids = [[A, m1, m2], [m1, B, m2], [B, C, m2]];
    } else {
      const m1 = mid(B, A), m2 = mid(C, B), m3 = mid(A, C);
      kids = [[A, m1, m3], [m1, B, m2], [m2, C, m3], [m1, m2, m3]];
    }
    for (let i = splits; i >= 0; i--) walk(kids[i], depth + 1); // children are stored last-first
  };
  try {
    walk([a, b, c], 0);
  } catch {
    return null;
  }
  return at === nibbles.length ? leaves : null; // leftover codes mean we misread it: do not guess
}

/**
 * Rewrite the states of a paint string (see `paintLeaves`) with `f`, keeping its structure. The leaf with state k is
 * written as the slicer does (one code for 0..2, 0b11 followed by k - 3 in base 15 for larger). null if unreadable.
 */
export function mapPaintStates(code: string, f: (state: number) => number): string | null {
  const nibbles: number[] = [];
  for (let i = code.length - 1; i >= 0; i--) {
    const n = parseInt(code[i], 16);
    if (Number.isNaN(n)) return null;
    nibbles.push(n);
  }
  const out: number[] = [];
  let at = 0;
  const next = () => {
    if (at >= nibbles.length) throw new Error("short");
    return nibbles[at++];
  };
  const walk = (depth: number) => {
    if (depth > 12) throw new Error("deep");
    const c0 = next();
    if ((c0 & 3) !== 0) {
      out.push(c0);
      for (let i = 0; i <= (c0 & 3); i++) walk(depth + 1);
      return;
    }
    let state = c0 >> 2;
    if ((c0 & 12) === 12) {
      let n = next(), runs = 0;
      while (n === 15) { runs++; n = next(); }
      state = n + 15 * runs + 3;
    }
    const ns = Math.max(0, Math.round(f(state)));
    if (ns < 3) out.push(ns << 2);
    else {
      out.push(12);
      let k = ns - 3;
      while (k >= 15) { out.push(15); k -= 15; }
      out.push(k);
    }
  };
  try {
    walk(0);
  } catch {
    return null;
  }
  if (at !== nibbles.length) return null;
  return out.reverse().map((n) => n.toString(16).toUpperCase()).join("");
}

const PAINT_ATTRS = ["paint_color", "slic3rpe:mmu_segmentation"];

/** Welded triangle soup (positions rounded to 1e-5 mm so shared corners are one vertex). */
function soup() {
  const index = new Map<string, number>();
  const pos: number[] = [];
  const idx: number[] = [];
  const at = (p: V3) => {
    const key = `${p[0].toFixed(5)},${p[1].toFixed(5)},${p[2].toFixed(5)}`;
    let i = index.get(key);
    if (i === undefined) {
      i = pos.length / 3;
      index.set(key, i);
      pos.push(...p);
    }
    return i;
  };
  return {
    add: (t: [V3, V3, V3]) => idx.push(at(t[0]), at(t[1]), at(t[2])),
    mesh: (): Mesh => ({ positions: Float32Array.from(pos), indices: Uint32Array.from(idx) }),
    count: () => idx.length / 3,
  };
}

/** Part-list name of the helper parts that only exist for the 3D preview (removed again for printing). */
export const PREVIEW_PART_PREFIX = "dc-preview";

export type PaintLayer = {
  /** The filament the designer painted this area with. */
  state: number;
  /** Mesh name the 3D viewer colours. */
  partName: string;
  /** The painted slicer parts (the originals, which keep their paint codes for printing). */
  parts: PartRef[];
};

/** Mesh-object tag of a component's geometry, and where it lives. */
function meshObjectOf(files: Files, rootDefs: Map<string, ObjectDef>, objectId: string, partIndex: number) {
  const comp = rootDefs.get(objectId)?.components[partIndex];
  if (!comp) return null;
  const t = componentTarget(comp);
  return files[t.file] ? { ...t, comp } : null;
}

/**
 * A slicer lets you paint areas of a part in other filaments (the outline of a logo, a stripe). That is a per-triangle
 * code the 3D viewer cannot show and a colour picker cannot change. For the PREVIEW, each painted part is cut into
 * helper meshes: its unpainted area (taking over the part's viewer name) and one mesh per painted filament (named
 * `dc-slot-<n>`, so each can be coloured). The original mesh, with its paint intact, stays for printing but is hidden
 * in the viewer. Helper meshes are type "other" and `modifier_part` parts named `dc-preview …`: a slicer ignores them,
 * and `stripPreviewParts` removes them from every print file. They are surface shells, not solids, so they must never
 * be printed. The surface the viewer sees is identical to the original.
 * Parts whose paint cannot be read are left alone and reported. `firstIndex` numbers the `dc-slot-<n>` names.
 */
export function addPaintPreview(files: Files, firstIndex: number): { files: Files; layers: PaintLayer[]; notes: string[] } {
  const notes: string[] = [];
  const rootPath = "3D/3dmodel.model";
  let root = strFromU8(files[rootPath]);
  const rootDefs = parseObjects(root);
  let cfg = files[CFG] ? strFromU8(files[CFG]) : null;
  if (!cfg) return { files, layers: [], notes };
  const texts = new Map<string, string>();
  const textOf = (file: string) => texts.get(file) ?? strFromU8(files[file]);

  let nextId = 0;
  for (const f of Object.keys(files)) if (/\.model$/.test(f)) for (const m of strFromU8(files[f]).matchAll(/<object\b[^>]*\bid="(\d+)"/g)) nextId = Math.max(nextId, Number(m[1]));
  const withP = /xmlns:p="/.test(root);
  const uuid = () => (withP ? randomUUID() : "");
  const layerOf = new Map<number, PaintLayer>();
  const layerFor = (state: number) => {
    let l = layerOf.get(state);
    if (!l) layerOf.set(state, (l = { state, partName: groupMeshName(firstIndex + layerOf.size), parts: [] }));
    return l;
  };

  for (const co of readConfigObjects(files)) {
    const plate = rootDefs.get(co.id);
    if (!plate || plate.components.length !== co.parts.length) continue;
    for (const part of co.parts) {
      if (part.subtype !== "normal_part" || part.text !== null) continue;
      const mo = meshObjectOf(files, rootDefs, co.id, part.index);
      if (!mo) continue;
      const src = textOf(mo.file);
      const om = new RegExp(`(<object\\b[^>]*\\bid="${mo.id}"[^>]*>)([\\s\\S]*?)(</object>)`).exec(src);
      if (!om || !om[2].includes("<mesh") || !PAINT_ATTRS.some((a) => om[2].includes(`${a}="`))) continue;

      const verts: V3[] = [];
      for (const v of om[2].matchAll(/<vertex\b([^>]*?)\/?>/g)) verts.push([Number(attr(v[1], "x")), Number(attr(v[1], "y")), Number(attr(v[1], "z"))]);
      const baseFilament = part.extruder ?? co.extruder ?? 1;
      const base = soup();
      const painted = new Map<number, ReturnType<typeof soup>>();
      let unreadable = false;
      for (const tr of om[2].matchAll(/<triangle\b([^>]*?)\/?>/g)) {
        const tri = [attr(tr[1], "v1"), attr(tr[1], "v2"), attr(tr[1], "v3")].map((i) => verts[Number(i)]) as [V3, V3, V3];
        const code = PAINT_ATTRS.map((a) => attr(tr[1], a)).find((x) => x);
        const leaves = tri.some((p) => !p) ? null : code ? paintLeaves(code, ...tri) : [{ state: 0, tri }];
        if (!leaves) { unreadable = true; break; }
        for (const lf of leaves) {
          if (lf.state === 0 || lf.state === baseFilament) base.add(lf.tri);
          else {
            if (!painted.has(lf.state)) painted.set(lf.state, soup());
            painted.get(lf.state)!.add(lf.tri);
          }
        }
      }
      const name = part.name.replace(/\.(stl|3mf|obj|step)$/i, "") || co.name;
      if (unreadable) { notes.push(`Colour painting on "${name}" could not be read, so it is left as painted in the slicer (no preview, no colour option).`); continue; }
      if (painted.size === 0) continue;

      const plateTag = new RegExp(`(<object\\b[^>]*\\bid="${co.id}"[^>]*>)([\\s\\S]*?)(</object>)`).exec(root);
      const compTag = [...(plateTag?.[2] ?? "").matchAll(/<component\b[^>]*?\/>/g)][part.index]?.[0];
      const partBlock = new RegExp(`<part\\s+id="${part.id}"[^>]*>[\\s\\S]*?</part>`).exec(cfg);
      if (!plateTag || !compTag || !partBlock) { notes.push(`Colour painting on "${name}" could not be previewed (unexpected layout).`); continue; }

      const origName = attr(om[1], "name");
      let nextPart = Math.max(0, ...[...(new RegExp(`<object\\s+id="${co.id}">[\\s\\S]*?</object>`).exec(cfg)?.[0].matchAll(/<part\s+id="(\d+)"/g) ?? [])].map((m) => Number(m[1])));
      let newObjects = "", newComps = "", newParts = "";
      const addPiece = (mesh: Mesh, pieceName: string | undefined, label: string) => {
        const id = ++nextId;
        newObjects += `\n  <object id="${id}"${withP ? ` p:UUID="${uuid()}"` : ""}${pieceName ? ` name="${esc(pieceName)}"` : ""} type="other">${meshXml(mesh)}</object>`;
        newComps += compTag.replace(/objectid="\d+"/, `objectid="${id}"`).replace(/p:UUID="[^"]*"/, withP ? `p:UUID="${uuid()}"` : "");
        newParts += `\n    <part id="${++nextPart}" subtype="modifier_part">\n      <metadata key="name" value="${esc(`${PREVIEW_PART_PREFIX} ${label}`)}"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n    </part>`;
      };
      if (base.count() > 0) addPiece(base.mesh(), origName && origName !== HIDDEN_MESH_NAME ? origName : undefined, `${name} base`);
      for (const [state, sp] of [...painted].sort((x, y) => x[0] - y[0])) {
        const layer = layerFor(state);
        if (!layer.parts.some((r) => r.objectId === co.id && r.partId === part.id)) layer.parts.push({ objectId: co.id, partId: part.id });
        addPiece(sp.mesh(), layer.partName, `${name} painted ${state}`);
      }
      // the original keeps its paint for printing and is hidden in the viewer
      const hiddenTag = withObjectName(om[1], om[1].slice("<object".length, -1), HIDDEN_MESH_NAME);
      texts.set(mo.file, src.replace(om[0], () => hiddenTag + om[2] + om[3] + newObjects));
      root = root.replace(plateTag[0], () => plateTag[1] + plateTag[2].replace(/<\/components>/, () => `${newComps}</components>`) + plateTag[3]);
      cfg = cfg.replace(new RegExp(`(<object\\s+id="${co.id}">[\\s\\S]*)(</object>)`), (_m, a: string, z: string) => a.replace(/\s*$/, "") + newParts + "\n  " + z);
    }
  }
  if (layerOf.size === 0) return { files, layers: [], notes };
  const out: Files = { ...files, [rootPath]: strToU8(root), [CFG]: strToU8(cfg) };
  for (const [f, text] of texts) out[f] = strToU8(text);
  return { files: out, layers: [...layerOf.values()].sort((x, y) => x.state - y.state), notes };
}

/** Remove the preview helper parts (`addPaintPreview`) so the file prints exactly as the designer made it. */
export function stripPreviewParts(files: Files): Files {
  let out = files;
  for (const co of readConfigObjects(files)) {
    const helpers = co.parts.filter((p) => p.name.startsWith(PREVIEW_PART_PREFIX)).map((p) => p.index).sort((a, b) => b - a);
    for (const i of helpers) out = removePart(out, co.id, i);
  }
  return out;
}

export type PaintAssign = { objectId: string; partId: string; from: number; to: number };

/** Print the painted area of a part in another filament: every painted leaf with state `from` becomes `to`. */
export function recolorPaint(files: Files, assigns: PaintAssign[]): Files {
  if (assigns.length === 0) return files;
  const rootDefs = parseObjects(strFromU8(files["3D/3dmodel.model"]));
  const cfg = readConfigObjects(files);
  const out: Files = { ...files };
  for (const a of assigns) {
    const part = cfg.find((o) => o.id === a.objectId)?.parts.find((p) => p.id === a.partId);
    const mo = part ? meshObjectOf(files, rootDefs, a.objectId, part.index) : null;
    if (!mo) continue;
    const src = strFromU8(out[mo.file]);
    const re = new RegExp(`(<object\\b[^>]*\\bid="${mo.id}"[^>]*>)([\\s\\S]*?)(</object>)`);
    const m = re.exec(src);
    if (!m) continue;
    const body = m[2].replace(new RegExp(`(\\s(?:${PAINT_ATTRS.join("|")})=")([^"]*)(")`, "g"), (whole, pre: string, code: string, post: string) => {
      const mapped = mapPaintStates(code, (s) => (s === a.from ? a.to : s));
      return mapped === null ? whole : pre + mapped + post;
    });
    out[mo.file] = strToU8(src.replace(m[0], m[1] + body + m[3]));
  }
  return out;
}

/**
 * Remove one part of a plate object: its component, its mesh object (unless another component still uses it) and its
 * entry in the slicer's part list. `index` is the position among the object's components, which equals the part's.
 */
export function removePart(files: Files, objectId: string, index: number): Files {
  const rootXml = strFromU8(files["3D/3dmodel.model"]);
  const plate = parseObjects(rootXml).get(objectId);
  const comp = plate?.components[index];
  if (!plate || !comp) throw new Error("Part not found");
  const t = componentTarget(comp);
  const out: Files = { ...files };

  let n = -1;
  const objRe = new RegExp(`(<object\\b[^>]*\\bid="${objectId}"[^>]*>)([\\s\\S]*?)(</object>)`);
  out["3D/3dmodel.model"] = strToU8(rootXml.replace(objRe, (_m, a, body, c) => a + body.replace(/\s*<component\b[^>]*?\/>/g, (x: string) => (++n === index ? "" : x)) + c));

  const stillUsed = plate.components.some((c, i) => i !== index && c.id === comp.id && (c.path ?? "") === (comp.path ?? ""));
  if (!stillUsed) {
    const src = strFromU8(out[t.file] ?? files[t.file]);
    out[t.file] = strToU8(src.replace(new RegExp(`\\s*<object\\b[^>]*\\bid="${comp.id}"[^>]*>[\\s\\S]*?</object>`), ""));
  }

  if (files[CFG]) {
    let k = -1;
    out[CFG] = strToU8(strFromU8(files[CFG]).replace(new RegExp(`(<object\\s+id="${objectId}">)([\\s\\S]*?)(</object>)`), (_m, a, body, c) =>
      a + body.replace(/\s*<part\b[\s\S]*?<\/part>/g, (x: string) => (++k === index ? "" : x)) + c));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// Adding a part (the customer's name) to a plate object
// ---------------------------------------------------------------------------------------------------------------------

/**
 * Add a mesh (in build space) to the plate as one more part of an existing plate object: raised text as an ordinary
 * part, engraved text as a NEGATIVE part (object type "other", subtype negative_part) that the slicer subtracts.
 * `objectId` picks the plate object (default: the first one built from parts). Only objects made of components are
 * supported (as Bambu Studio, Orca and PrusaSlicer write them); anything else is refused, not guessed.
 */
export function addPartTo3mf(files: Files, o: { mesh: Mesh; label: string; kind: "raised" | "engraved"; filament?: number; objectId?: string }): Files {
  const items = plateItems(files);
  let root = strFromU8(files["3D/3dmodel.model"]);
  const withComponents = (id: string) => {
    const m = new RegExp(`<object\\b([^>]*\\bid="${id}"[^>]*)>([\\s\\S]*?)</object>`).exec(root);
    return m && m[2].includes("<components") ? id : null;
  };
  const target = o.objectId ? items.find((i) => i.objectId === o.objectId) : items.find((i) => withComponents(i.objectId));
  const objectId = target && withComponents(target.objectId);
  if (!target || !objectId) throw new Error("This 3MF layout is not supported yet (the plate object must be built from parts)");

  const objRe = new RegExp(`<object\\b([^>]*\\bid="${objectId}"[^>]*)>([\\s\\S]*?)</object>`);
  const obj = objRe.exec(root)!;
  const ids = [...root.matchAll(/<object\b[^>]*\bid="(\d+)"/g)].map((m) => Number(m[1]));
  const newId = Math.max(0, ...ids) + 1;

  // build space -> the plate object's own space
  const inv = target.transform.clone().invert();
  const local = Float32Array.from(o.mesh.positions);
  const p = new Vector3();
  for (let i = 0; i < local.length; i += 3) {
    p.set(local[i], local[i + 1], local[i + 2]).applyMatrix4(inv);
    local[i] = p.x; local[i + 1] = p.y; local[i + 2] = p.z;
  }
  const mesh: Mesh = { positions: local, indices: inv.determinant() < 0 ? flipWinding(o.mesh.indices) : o.mesh.indices };

  const withP = /xmlns:p="/.test(root);
  const uuid = () => (withP ? ` p:UUID="${randomUUID()}"` : "");
  const type = o.kind === "engraved" ? "other" : "model";
  const newObject = `<object id="${newId}"${uuid()} name="${esc(o.label)}" type="${type}">${meshXml(mesh)}</object>\n  `;
  // referenced objects must be defined before the object that uses them
  root = root.slice(0, obj.index) + newObject + root.slice(obj.index);
  const obj2 = objRe.exec(root)!;
  const newBody = obj2[2].replace(/<\/components>/, `<component objectid="${newId}"${uuid()} transform="1 0 0 0 1 0 0 0 1 0 0 0"/></components>`);
  root = root.slice(0, obj2.index) + obj2[0].replace(obj2[2], newBody) + root.slice(obj2.index + obj2[0].length);

  const out: Files = { ...files, "3D/3dmodel.model": strToU8(root) };

  // Bambu Studio keeps a per-part list in Metadata/model_settings.config: add the part there so the counts match
  if (files[CFG]) {
    const cfg = strFromU8(files[CFG]);
    const objCfg = new RegExp(`(<object\\s+id="${objectId}">[\\s\\S]*?)(</object>)`).exec(cfg);
    if (objCfg) {
      const partCount = (objCfg[1].match(/<part\b/g) ?? []).length;
      const objFilament = Number(metaValue(objCfg[1].split(/<part\b/)[0], "extruder")) || 1;
      const part =
        `  <part id="${Math.max(partCount, ...[...objCfg[1].matchAll(/<part\s+id="(\d+)"/g)].map((m) => Number(m[1]))) + 1}" subtype="${o.kind === "engraved" ? "negative_part" : "normal_part"}">\n` +
        `      <metadata key="name" value="${esc(o.label)}"/>\n` +
        `      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n` +
        `      <metadata key="extruder" value="${o.filament ?? objFilament}"/>\n` +
        `    </part>\n  `;
      out[CFG] = strToU8(cfg.replace(objCfg[0], objCfg[1] + part + objCfg[2]));
    }
  }
  return out;
}
