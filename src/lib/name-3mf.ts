/**
 * Server-side print file for a personalized item: the product's original STL plus the customer's name as a second
 * object, written as a 3MF so the slicer can give the name its own colour or filament. Rebuilt here from the saved
 * text and slot (never from a mesh the browser sent). Server only: reads the font files from /public/fonts.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { strToU8, zipSync } from "fflate";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import {
  buildName, isWatertight, meshBounds, NAME_FONTS, parseFont, toMesh,
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

function objectXml(id: number, name: string, mesh: Mesh): string {
  const v: string[] = [];
  for (let i = 0; i < mesh.positions.length; i += 3) v.push(`<vertex x="${num(mesh.positions[i])}" y="${num(mesh.positions[i + 1])}" z="${num(mesh.positions[i + 2])}"/>`);
  const t: string[] = [];
  for (let i = 0; i < mesh.indices.length; i += 3) t.push(`<triangle v1="${mesh.indices[i]}" v2="${mesh.indices[i + 1]}" v3="${mesh.indices[i + 2]}"/>`);
  return `<object id="${id}" name="${esc(name)}" type="model"><mesh><vertices>${v.join("")}</vertices><triangles>${t.join("")}</triangles></mesh></object>`;
}

/** A 3MF package (zip) holding each part as its own object, all placed at the origin of the shared coordinate space. */
export function writeThreeMf(title: string, parts: { name: string; mesh: Mesh }[]): Uint8Array {
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${esc(title)}</metadata>` +
    `<resources>${parts.map((p, i) => objectXml(i + 1, p.name, p.mesh)).join("")}</resources>` +
    `<build>${parts.map((_, i) => `<item objectid="${i + 1}"/>`).join("")}</build></model>`;
  return zipSync({
    "[Content_Types].xml": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
        `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/></Types>`,
    ),
    "_rels/.rels": strToU8(
      `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
        `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`,
    ),
    "3D/3dmodel.model": strToU8(model),
  });
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
      report: { nameWatertight: boolean; scaledDown: boolean; widthMm: number; heightMm: number; stemMm: number; baseBounds: number[]; nameBounds: number[] };
    };

/** Base STL + the name at `slot`, as a 3MF. Refuses names that cannot be printed (see `buildName`). */
export async function buildPrintFile(o: { baseStl: ArrayBuffer; text: string; slot: NameSlot }): Promise<PrintFile> {
  const font = await loadFont(o.slot.font);
  const built = buildName(font, o.text, o.slot);
  if (!built.ok) return built;
  const base = readStlMesh(o.baseStl);
  const name = toMesh(built.geometry);
  return {
    ok: true,
    file: writeThreeMf(`Personalized: ${o.text}`, [
      { name: "Base", mesh: base },
      { name: `Name: ${o.text}`, mesh: name },
    ]),
    report: {
      nameWatertight: isWatertight(name),
      scaledDown: built.scaledDown,
      widthMm: built.widthMm,
      heightMm: built.heightMm,
      stemMm: built.stemMm,
      baseBounds: meshBounds(base),
      nameBounds: meshBounds(name),
    },
  };
}
