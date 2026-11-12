/**
 * The print file for a clicker: a 3MF with TWO objects, the base and the cap(s), each made of one solid per colour piece,
 * all in millimetres, already positioned on the build plate (nothing to arrange in the slicer). Colours travel two ways:
 *   - core 3MF `basematerials` (name and display colour) on each piece, which any 3MF reader shows;
 *   - `Metadata/model_settings.config` (Bambu Studio / Orca): each object's parts, the filament of each part, and the wall
 *     count the print needs (3 for the base, 1 for the thin cap).
 * Filament numbers are given to the distinct colours in order of appearance, so pieces of one colour share a filament.
 * Server side (zips). Not yet opened in a slicer (see docs/clicker-designer.md).
 */
import { strToU8, zipSync } from "fflate";
import type { Mesh } from "../name-mesh";
import { esc, meshXml } from "../threemf";

export type PrintPiece = { name: string; color: string; mesh: Mesh };
export type PrintObject = { name: string; wallLoops: number; pieces: PrintPiece[] };

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
  `<Default Extension="config" ContentType="text/xml"/></Types>`;
const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

/** A copy of the mesh moved by (dx, dy, dz). */
export function moveMesh(mesh: Mesh, dx: number, dy: number, dz: number): Mesh {
  const p = new Float32Array(mesh.positions.length);
  for (let i = 0; i < p.length; i += 3) {
    p[i] = mesh.positions[i] + dx;
    p[i + 1] = mesh.positions[i + 1] + dy;
    p[i + 2] = mesh.positions[i + 2] + dz;
  }
  return { positions: p, indices: mesh.indices };
}

export function clickerTo3mf(objects: PrintObject[], title: string): Uint8Array {
  const all = objects.flatMap((o) => o.pieces);
  const colours = [...new Set(all.map((p) => p.color.toLowerCase()))];
  const filament = (c: string) => colours.indexOf(c.toLowerCase()) + 1;

  // ids: every piece first (1..n), then one assembly object per print object
  let next = 1;
  const meshXmlParts: string[] = [];
  const assemblies: { id: number; o: PrintObject; ids: number[] }[] = [];
  const pieceIds = new Map<PrintPiece, number>();
  for (const o of objects) for (const p of o.pieces) {
    const id = next++;
    pieceIds.set(p, id);
    meshXmlParts.push(`<object id="${id}" name="${esc(p.name)}" type="model" pid="1" pindex="${colours.indexOf(p.color.toLowerCase())}">${meshXml(p.mesh)}</object>`);
  }
  for (const o of objects) assemblies.push({ id: next++, o, ids: o.pieces.map((p) => pieceIds.get(p)!) });

  const model =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${esc(title)}</metadata><metadata name="Designer">Darl Creates clicker designer</metadata>` +
    `<resources><basematerials id="1">${colours.map((c, i) => `<base name="Filament ${i + 1}" displaycolor="${c.toUpperCase()}FF"/>`).join("")}</basematerials>` +
    meshXmlParts.join("") +
    assemblies.map((a) => `<object id="${a.id}" name="${esc(a.o.name)}" type="model"><components>${a.ids.map((i) => `<component objectid="${i}"/>`).join("")}</components></object>`).join("") +
    `</resources><build>${assemblies.map((a) => `<item objectid="${a.id}" transform="1 0 0 0 1 0 0 0 1 0 0 0" printable="1"/>`).join("")}</build></model>`;

  // Bambu Studio / Orca: each object with its parts, the filament of each, and the walls it needs
  const bambu =
    `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n` +
    assemblies
      .map(
        (a) =>
          `  <object id="${a.id}">\n    <metadata key="name" value="${esc(a.o.name)}"/>\n    <metadata key="extruder" value="${filament(a.o.pieces[0]?.color ?? colours[0])}"/>\n    <metadata key="wall_loops" value="${a.o.wallLoops}"/>\n` +
          a.o.pieces
            .map(
              (p) =>
                `    <part id="${pieceIds.get(p)}" subtype="normal_part">\n      <metadata key="name" value="${esc(p.name)}"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n      <metadata key="extruder" value="${filament(p.color)}"/>\n    </part>\n`,
            )
            .join("") +
          `  </object>\n`,
      )
      .join("") +
    `  <plate>\n    <metadata key="plater_id" value="1"/>\n    <metadata key="plater_name" value=""/>\n    <metadata key="locked" value="false"/>\n` +
    assemblies.map((a, i) => `    <model_instance>\n      <metadata key="object_id" value="${a.id}"/>\n      <metadata key="instance_id" value="0"/>\n      <metadata key="identify_id" value="${1001 + i}"/>\n    </model_instance>\n`).join("") +
    `  </plate>\n</config>\n`;

  // the filament colours, so a slicer that reads them shows the right swatches
  const project = JSON.stringify({ filament_colour: colours.map((c) => c.toUpperCase()), filament_type: colours.map(() => "PLA"), name: title }, null, 1);

  return zipSync(
    {
      "[Content_Types].xml": strToU8(CONTENT_TYPES),
      "_rels/.rels": strToU8(ROOT_RELS),
      "3D/3dmodel.model": strToU8(model),
      "Metadata/model_settings.config": strToU8(bambu),
      "Metadata/project_settings.config": strToU8(project),
    },
    { level: 1 },
  );
}
