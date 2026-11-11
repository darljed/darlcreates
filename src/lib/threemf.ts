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

/** Groups of ordinary printed parts (not negative parts, modifiers or the example text) by the filament they use. */
export function colorGroups(files: Files): ColorGroup[] {
  const groups = new Map<number, ColorGroup>();
  for (const o of readConfigObjects(files)) {
    for (const p of o.parts) {
      if (p.subtype !== "normal_part" || p.text !== null) continue;
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
