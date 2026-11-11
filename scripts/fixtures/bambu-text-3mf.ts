/**
 * Test fixture: a tiny Bambu Studio style 3MF with a text element. A 20 mm cube plus a 10 x 4 x 1 mm text part lying
 * on its top face (object space z = 20), the plate item rotated 90 degrees about Y and moved to (100, 100, 50), with
 * `Metadata/model_settings.config` carrying the `text_info` entry and, optionally, `project_settings.config` filaments.
 * Expected detection in build space: position (120, 110, 40), facing +X, up +Y, 10 x 4 mm, 1 mm deep.
 */
import { strToU8, zipSync } from "fflate";

export const boxObj = (id: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
  const v = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]].map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("");
  const t = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join("");
  return `<object id="${id}" type="model"><mesh><vertices>${v}</vertices><triangles>${t}</triangles></mesh></object>`;
};
// a 20 mm cube plus a text part 10 x 4 x 1 lying on its top face (object space z = 20), the plate item rotated 90 degrees about Y
export const withText = (subtype: string, text: string, textFaces = 12, extra: { textExt?: number; filaments?: string[] } = {}) => {
  const bytes = zipSync({
    "3D/3dmodel.model": strToU8(`<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"><resources>
 <object id="3" type="model"><components>
<component p:path="/3D/Objects/o.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0"/>
<component p:path="/3D/Objects/o.model" objectid="2" transform="1 0 0 0 1 0 0 0 1 10 10 20"/>
 </components></object>
</resources><build><item objectid="3" transform="0 0 -1 0 1 0 1 0 0 100 100 50" printable="1"/></build></model>`),
    "3D/Objects/o.model": strToU8(`<model><resources>${boxObj(1, 0, 20, 0, 20, 0, 20)}${boxObj(2, -5, 5, -2, 2, 0, 1)}</resources></model>`),
    "Metadata/model_settings.config": strToU8(`<config>
<object id="3">
  <metadata key="extruder" value="1"/>
  <part id="1" subtype="normal_part"><metadata key="name" value="Body"/><mesh_stat face_count="12"/></part>
  <part id="2" subtype="${subtype}"><metadata key="name" value="text_shape"/><metadata key="extruder" value="${extra.textExt ?? 1}"/><text_info text="${text}" font_name="Marker Felt" thickness="1" embeded_depth="0" /><mesh_stat face_count="${textFaces}"/></part>
</object>
</config>`),
    ...(extra.filaments ? { "Metadata/project_settings.config": strToU8(JSON.stringify({ filament_colour: extra.filaments })) } : {}),
  });
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
};
