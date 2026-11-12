/**
 * The print file for a clicker: a 3MF with one solid per colour piece, grouped into ONE object, all in millimetres,
 * lying flat on the bed at its centre. Colours travel two ways:
 *   - core 3MF `basematerials` (name and display colour) on each piece, which any 3MF reader shows;
 *   - `Metadata/model_settings.config` (Bambu Studio / Orca): the object's parts and the filament of each.
 * (PrusaSlicer's own extruder file addresses triangle ranges of one merged mesh, so it is not written.)
 * Filament numbers are given to the distinct colours in order of appearance, so pieces of one colour share a filament.
 * Server side (zips). Not yet opened in a slicer (see docs/clicker-designer.md).
 */
import { strToU8, zipSync } from "fflate";
import type { Mesh } from "../name-mesh";
import { esc, meshXml } from "../threemf";

export type PrintPiece = { name: string; color: string; mesh: Mesh };

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>` +
  `<Default Extension="config" ContentType="text/xml"/></Types>`;
const ROOT_RELS =
  `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Target="/3D/3dmodel.model" Id="rel0" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>`;

export type Placement = { x: number; y: number };

/** `place` is where the clicker's centre goes on the bed (default the middle of a 256 mm bed). */
export function clickerTo3mf(pieces: PrintPiece[], title: string, place: Placement = { x: 128, y: 128 }): Uint8Array {
  const colours = [...new Set(pieces.map((p) => p.color.toLowerCase()))];
  const filament = (c: string) => colours.indexOf(c.toLowerCase()) + 1;

  const meshes = pieces.map((p, i) => `<object id="${i + 1}" name="${esc(p.name)}" type="model" pid="1" pindex="${colours.indexOf(p.color.toLowerCase())}">${meshXml(p.mesh)}</object>`).join("");
  const assemblyId = pieces.length + 1;
  const model =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">` +
    `<metadata name="Title">${esc(title)}</metadata><metadata name="Designer">Darl Creates clicker designer</metadata>` +
    `<resources><basematerials id="1">${colours.map((c, i) => `<base name="Filament ${i + 1}" displaycolor="${c.toUpperCase()}FF"/>`).join("")}</basematerials>` +
    meshes +
    `<object id="${assemblyId}" name="${esc(title)}" type="model"><components>${pieces.map((_, i) => `<component objectid="${i + 1}"/>`).join("")}</components></object>` +
    `</resources><build><item objectid="${assemblyId}" transform="1 0 0 0 1 0 0 0 1 ${place.x} ${place.y} 0" printable="1"/></build></model>`;

  // Bambu Studio / Orca: the object with its parts and the filament of each
  const bambu =
    `<?xml version="1.0" encoding="UTF-8"?>\n<config>\n  <object id="${assemblyId}">\n    <metadata key="name" value="${esc(title)}"/>\n    <metadata key="extruder" value="1"/>\n` +
    pieces
      .map(
        (p, i) =>
          `    <part id="${i + 1}" subtype="normal_part">\n      <metadata key="name" value="${esc(p.name)}"/>\n      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>\n      <metadata key="extruder" value="${filament(p.color)}"/>\n    </part>\n`,
      )
      .join("") +
    `  </object>\n</config>\n`;

  // the filament colours, so a slicer that reads them shows the right swatches
  const project = JSON.stringify({ filament_colour: colours.map((c) => c.toUpperCase()), name: title }, null, 1);

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
