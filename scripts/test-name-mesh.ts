/**
 * Name on a model: slot validation, text -> raised-letter geometry (size, position, orientation, printability checks),
 * and the 3MF print file built from a real STL. No DB, no network. Run from the project root:
 *   npx tsx scripts/test-name-mesh.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { buildName, cleanName, isWatertight, meshBounds, nameSlotSchema, personalizedName, slotOf, toMesh, type NameSlot } from "../src/lib/name-mesh";
import { addNameTo3mf, buildPrintFile, checkFit, detectNameSlot, loadFont, nameProblem, open3mf, readStlMesh, stripPlaceholder, threeMfSurface, widestThatFits } from "../src/lib/name-3mf";
import { strToU8, zipSync } from "fflate";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}
const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps;

const topSlot: NameSlot = { position: [10, 10, 20], normal: [0, 0, 1], up: [0, 1, 0], maxWidth: 16, height: 5, depth: 1.2, sink: 0.4, font: "bold" };
const cubeFile = readFileSync(join(__dirname, "fixtures", "cube-20mm.stl"));
const cubeStl = cubeFile.buffer.slice(cubeFile.byteOffset, cubeFile.byteOffset + cubeFile.byteLength) as ArrayBuffer;

(async () => {
  const font = await loadFont("bold");

  console.log("\nslot validation");
  assert("a good slot passes", nameSlotSchema.safeParse(topSlot).success);
  assert("a normal that is not unit length is refused", !nameSlotSchema.safeParse({ ...topSlot, normal: [0, 0, 2] }).success);
  assert("letters thinner than 0.6 mm tall are refused", !nameSlotSchema.safeParse({ ...topSlot, depth: 0.2 }).success);
  assert("an unknown font is refused", !nameSlotSchema.safeParse({ ...topSlot, font: "comic" }).success);
  assert("NaN / Infinity positions are refused", !nameSlotSchema.safeParse({ ...topSlot, position: [NaN, 0, 0] }).success && !nameSlotSchema.safeParse({ ...topSlot, position: [Infinity, 0, 0] }).success);

  console.log("\nreading the slot back from product options");
  const opt = { id: "o1", type: "text", constraints: { maxLen: 12, slot: topSlot } };
  assert("slotOf returns a valid stored slot", slotOf(opt.constraints)?.maxWidth === 16);
  assert("slotOf ignores a damaged slot instead of throwing", slotOf({ slot: { position: "nope" } }) === null && slotOf(null) === null && slotOf({}) === null);
  assert("personalizedName finds the name for a product with a slot and an STL", personalizedName([opt], { o1: { text: "  Ana  " } }, "models/a.stl")?.text === "Ana");
  assert("no name typed -> nothing to add", personalizedName([opt], { o1: { text: " " } }, "models/a.stl") === null);
  assert("3MF bases work too, and report their kind", personalizedName([opt], { o1: { text: "Ana" } }, "models/a.3mf")?.kind === "3mf" && personalizedName([opt], { o1: { text: "Ana" } }, "models/a.STL")?.kind === "stl");
  assert("other file types cannot take a name", personalizedName([opt], { o1: { text: "Ana" } }, "models/a.obj") === null);
  assert("a color option or a text option without a slot is ignored", personalizedName([{ id: "c", type: "color", constraints: {} }, { id: "t", type: "text", constraints: {} }], { t: { text: "Ana" } }, "x.stl") === null);
  assert("nameProblem: fine name -> null; too long -> a plain message; missing letter -> names it", (await nameProblem(topSlot, "Ana")) === null && /too long/.test((await nameProblem(topSlot, "W".repeat(30))) ?? "") && /"日"/.test((await nameProblem(topSlot, "日")) ?? ""));

  console.log("\ntext rules");
  assert("spaces are collapsed and trimmed", cleanName("  Ana   Cruz ") === "Ana Cruz");
  for (const bad of ["", "   ", "日本"]) assert(`refuses ${JSON.stringify(bad)}`, !buildName(font, bad, topSlot).ok);
  assert("accented letters the font has are fine", buildName(font, "José", topSlot).ok);

  console.log("\ngeometry on a flat top face (cube top is z = 20)");
  const ana = buildName(font, "Ana", topSlot);
  assert("builds", ana.ok);
  if (!ana.ok) throw new Error("cannot continue");
  const mesh = toMesh(ana.geometry);
  const [x0, y0, z0, x1, y1, z1] = meshBounds(mesh);
  assert("sits on the surface: bottom is `sink` below it, top is `depth` above", near(z0, 19.6) && near(z1, 21.2), `z ${z0}..${z1}`);
  assert("centred on the slot horizontally", near((x0 + x1) / 2, 10, 0.1), `x ${x0}..${x1}`);
  assert("capital height is as asked (taller letters only where the font has ascenders)", near(ana.heightMm, 5, 1e-6) && y1 - y0 >= 4.9, `y ${y0}..${y1}`);
  assert("fits the max width", x1 - x0 <= topSlot.maxWidth + 1e-6 && near(x1 - x0, ana.widthMm, 0.01));
  assert("is watertight (a slicer will accept it)", isWatertight(mesh));
  assert("strokes are thick enough to print", ana.stemMm >= 0.8, `stem ${ana.stemMm.toFixed(2)}`);

  // orientation: the stem of a "b" is on the LEFT (top of the stem is at the smallest x); a "d" is the mirror image
  const stemSide = (text: string, slot: NameSlot, axis: 0 | 1, flip = 1) => {
    const g = buildName(font, text, slot);
    if (!g.ok) return NaN;
    const pos = toMesh(g.geometry).positions;
    // the stem is the tall part: take the points on the "top" axis within 5% of the max and compare to the centre
    const topAxis = slot.normal[2] === 1 ? 1 : 2; // up axis in model space for these slots
    let top = -Infinity; for (let i = 0; i < pos.length; i += 3) top = Math.max(top, pos[i + topAxis]);
    const pts: number[] = []; for (let i = 0; i < pos.length; i += 3) if (pos[i + topAxis] > top - 0.2) pts.push(pos[i + axis]);
    const mean = pts.reduce((a, b) => a + b, 0) / pts.length;
    return Math.sign((mean - slot.position[axis]) * flip);
  };
  assert("reads left to right on a top face (b has its stem on the left, d on the right)", stemSide("b", topSlot, 0) === -1 && stemSide("d", topSlot, 0) === 1);

  console.log("\ngeometry on a side wall (cube +X face is x = 20)");
  const side: NameSlot = { ...topSlot, position: [20, 10, 10], normal: [1, 0, 0], up: [0, 0, 1] };
  const sideMesh = toMesh((buildName(font, "Ana", side) as Extract<ReturnType<typeof buildName>, { ok: true }>).geometry);
  const [sx0, sy0, sz0, sx1, sy1, sz1] = meshBounds(sideMesh);
  assert("stands out of the +X face", near(sx0, 19.6) && near(sx1, 21.2), `x ${sx0}..${sx1}`);
  assert("is centred on the slot across the wall", near((sy0 + sy1) / 2, 10, 0.1) && near((sz0 + sz1) / 2, 10 + 0.0, 2.6), `y ${sy0}..${sy1} z ${sz0}..${sz1}`);
  assert("reads left to right when seen from outside (looking at the wall from +X, right is +Y)", stemSide("b", side, 1) === -1 && stemSide("d", side, 1) === 1);
  assert("an 'up' that points along the normal is repaired, not NaN", (() => { const m = buildName(font, "Ana", { ...topSlot, up: [0, 0, 1] }); return m.ok && meshBounds(toMesh(m.geometry)).every(Number.isFinite); })());

  console.log("\nlength and printability");
  const long = buildName(font, "Alexander Maximilian", topSlot);
  assert("a long name shrinks to fit the width", long.ok ? long.scaledDown && long.widthMm <= 16 + 1e-6 : true);
  assert("a name so long its strokes would be too thin is refused with a plain message", (() => { const r = buildName(font, "WWWWWWWWWWWWWWWWWWWWWWWWWWWWWW", topSlot); return !r.ok && /too long/.test(r.error); })());
  assert("a taller slot gets thicker strokes", (() => { const a = buildName(font, "Ana", topSlot), b = buildName(font, "Ana", { ...topSlot, height: 8 }); return a.ok && b.ok && b.stemMm > a.stemMm; })());
  const chunky = buildName(await loadFont("chunky"), "Ana", { ...topSlot, font: "chunky" });
  assert("the second font works too", chunky.ok && isWatertight(toMesh(chunky.geometry)));

  console.log("\nprint file (3MF) from the real cube STL");
  const base = readStlMesh(cubeStl);
  assert("the cube reads as 12 triangles and is watertight", base.indices.length / 3 === 12 && isWatertight(base));
  const pf = await buildPrintFile({ base: cubeStl, kind: "stl", text: "Ana", slot: topSlot });
  assert("builds", pf.ok);
  if (!pf.ok) throw new Error("cannot continue");
  const zip = unzipSync(pf.file);
  assert("is a 3MF package (content types, rels, model)", ["[Content_Types].xml", "_rels/.rels", "3D/3dmodel.model"].every((k) => k in zip));
  const xml = strFromU8(zip["3D/3dmodel.model"]);
  assert("in millimetres; Base and Name are parts of ONE object on the plate", xml.includes('unit="millimeter"') && (xml.match(/<object /g) ?? []).length === 3 && (xml.match(/<component /g) ?? []).length === 2 && (xml.match(/<item /g) ?? []).length === 1);
  assert("part names say which is which", xml.includes('name="Base"') && xml.includes('name="Name: Ana"'));
  const triCount = (xml.match(/<triangle /g) ?? []).length;
  assert("triangle count = base + name", triCount === base.indices.length / 3 + mesh.indices.length / 3, `${triCount}`);
  const vCount = (xml.match(/<vertex /g) ?? []).length;
  const maxIdx = Math.max(...[...xml.matchAll(/v[123]="(\d+)"/g)].map((m) => Number(m[1])));
  assert("triangle indices stay inside each object's vertex list", maxIdx < vCount);
  assert("the report says the name is watertight, in range, and sits on the cube top", pf.report.nameWatertight && pf.report.nameBounds[5] > 20 && pf.report.fit.fits, JSON.stringify(pf.report.fit.gaps));
  assert("XML special characters in the name are escaped, never raw", await (async () => {
    const r = await buildPrintFile({ base: cubeStl, kind: "stl", text: "A<&\"'", slot: topSlot });
    if (!r.ok) return false;
    const m = strFromU8(unzipSync(r.file)["3D/3dmodel.model"]);
    return !m.includes("<&") && !m.includes('A<') && m.includes("&#60;");
  })());
  assert("refuses an unprintable name instead of writing a bad file", !(await buildPrintFile({ base: cubeStl, kind: "stl", text: "W".repeat(30), slot: topSlot })).ok);

  console.log("\nfit on the surface (20 mm cube, top face at z = 20)");
  assert("a name fully on the top face fits", checkFit(base, topSlot, 16, 5).fits);
  assert("a name centred near an edge hangs over it and is reported", (() => { const r = checkFit(base, { ...topSlot, position: [18, 10, 20] }, 16, 5); return !r.fits && /not sit fully/.test(r.problem ?? "") && r.gaps.some((g) => g === null); })());
  assert("a slot floating 3 mm above the face is reported (surface not at the slot)", !checkFit(base, { ...topSlot, position: [10, 10, 23] }, 10, 4).fits);
  assert("a slot buried 3 mm inside the cube is reported", !checkFit(base, { ...topSlot, position: [10, 10, 17] }, 10, 4).fits);
  assert("widestThatFits finds the widest name that stays on the face (a name centred 6 mm from the edge can be at most 12 mm wide)", (() => { const w = widestThatFits(base, { ...topSlot, position: [14, 10, 20], maxWidth: 30 }); return w !== null && w >= 11 && w <= 14 && checkFit(base, { ...topSlot, position: [14, 10, 20] }, w, 5).fits; })());
  assert("widestThatFits gives up (null) when the spot itself is off the surface", widestThatFits(base, { ...topSlot, position: [30, 10, 20], maxWidth: 30 }) === null);
  assert("a side wall works the same way", checkFit(base, side, 12, 5).fits && !checkFit(base, { ...side, position: [20, 10, 18.5] }, 12, 5).fits);

  console.log("\nname added to a slicer 3MF (Bambu-style: plate object made of components, geometry in a second file)");
  // two 10 mm cubes as components of one "Assembly" object, placed on the plate at (128,128,5) like Bambu does
  const cubeObj = (id: number, ox: number) => {
    const v = [[0,0,0],[10,0,0],[10,10,0],[0,10,0],[0,0,10],[10,0,10],[10,10,10],[0,10,10]].map(([x, y, z]) => `<vertex x="${x + ox}" y="${y}" z="${z}"/>`).join("");
    const t = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join("");
    return `<object id="${id}" type="model"><mesh><vertices>${v}</vertices><triangles>${t}</triangles></mesh></object>`;
  };
  const bambu = () => zipSync({
    "[Content_Types].xml": strToU8("<Types/>"),
    "3D/3dmodel.model": strToU8(`<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:p="http://schemas.microsoft.com/3dmanufacturing/production/2015/06" requiredextensions="p"><resources>
 <object id="3" p:UUID="00000003-61cb-4c03-9d28-80fed5dfa1dc" type="model">
  <components>
   <component p:path="/3D/Objects/object_3.model" objectid="1" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
   <component p:path="/3D/Objects/object_3.model" objectid="2" transform="1 0 0 0 1 0 0 0 1 0 0 0" />
  </components>
 </object>
</resources><build><item objectid="3" transform="1 0 0 0 1 0 0 0 1 128 128 5" printable="1" /></build></model>`),
    "3D/Objects/object_3.model": strToU8(`<?xml version="1.0"?><model unit="millimeter" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"><resources>${cubeObj(1, 0)}${cubeObj(2, 20)}</resources></model>`),
    "Metadata/model_settings.config": strToU8(`<config>\n  <object id="3">\n    <part id="1" subtype="normal_part"></part>\n    <part id="2" subtype="normal_part"></part>\n  </object>\n</config>`),
  });
  const bambuBytes = bambu();
  const bambuBuf = bambuBytes.buffer.slice(bambuBytes.byteOffset, bambuBytes.byteOffset + bambuBytes.byteLength) as ArrayBuffer;
  const surf = threeMfSurface(open3mf(bambuBuf));
  const sb = meshBounds(surf.mesh);
  assert("the surface is read in BUILD space (item translation applied to both components)", near(sb[0], 128) && near(sb[3], 158) && near(sb[2], 5) && near(sb[5], 15), `${sb}`);
  // top of the first cube is z = 15 in build space; its top face spans x 128..138, y 128..138
  const bambuSlot: NameSlot = { ...topSlot, position: [133, 133, 15], maxWidth: 8, height: 3 };
  const bambuFit = checkFit(surf.mesh, bambuSlot, 6, 3);
  assert("a small name on the first cube's top fits", bambuFit.fits, JSON.stringify(bambuFit.gaps));
  assert("a wide name over both cubes and the gap between them does not", !checkFit(surf.mesh, { ...bambuSlot, position: [143, 133, 15] }, 25, 3).fits);
  const bambuPf = await buildPrintFile({ base: bambuBuf, kind: "3mf", text: "Al", slot: { ...bambuSlot, maxWidth: 8, height: 3 } });
  assert("builds a Bambu-style 3MF with the name", bambuPf.ok, bambuPf.ok ? "" : bambuPf.error);
  if (!bambuPf.ok) throw new Error("cannot continue");
  const out = unzipSync(bambuPf.file);
  const outRoot = strFromU8(out["3D/3dmodel.model"]);
  assert("everything else in the package is kept (the second file)", "3D/Objects/object_3.model" in out && strFromU8(out["3D/Objects/object_3.model"]).includes('id="2"'));
  assert("the name is a new object defined BEFORE the plate object, and a third component of it", outRoot.indexOf('name="Name: Al"') > -1 && outRoot.indexOf('name="Name: Al"') < outRoot.indexOf('<object id="3"') && (outRoot.match(/<component /g) ?? []).length === 3 && /objectid="4"/.test(outRoot));
  assert("production-extension UUIDs are added because the file declares that extension", (outRoot.match(/p:UUID=/g) ?? []).length >= 3);
  assert("the part list in model_settings.config gets a matching third part", (strFromU8(out["Metadata/model_settings.config"]).match(/<part /g) ?? []).length === 3 && strFromU8(out["Metadata/model_settings.config"]).includes("Name: Al"));
  // re-read the result: the name must now be part of the plate geometry, standing on the first cube's top (z 15 .. 16.2) around (133,133)
  const after = threeMfSurface(open3mf(bambuPf.file.buffer.slice(bambuPf.file.byteOffset, bambuPf.file.byteOffset + bambuPf.file.byteLength) as ArrayBuffer)).mesh;
  assert("after adding, the plate has more triangles", after.indices.length > surf.mesh.indices.length);
  const ab = meshBounds(after);
  assert("and the name sits in BUILD space where the slot said (on top of the first cube, not at the origin)", ab[5] > 16 && ab[5] < 16.5 && ab[0] >= 127.9, `${ab}`);
  assert("a 3MF whose plate has two objects is refused with a clear message", (() => {
    try { const bad = zipSync({ "3D/3dmodel.model": strToU8(`<model><resources>${cubeObj(1, 0)}${cubeObj(2, 0)}</resources><build><item objectid="1"/><item objectid="2"/></build></model>`) }); threeMfSurface(open3mf(bad.buffer.slice(bad.byteOffset, bad.byteOffset + bad.byteLength) as ArrayBuffer)); return false; } catch (e) { return /single object/.test((e as Error).message); }
  })());
  assert("a plate object that is a plain mesh (no parts) is refused rather than guessed", (() => {
    try { const plain = zipSync({ "3D/3dmodel.model": strToU8(`<model xmlns:p="x"><resources>${cubeObj(1, 0)}</resources><build><item objectid="1"/></build></model>`) }); addNameTo3mf(open3mf(plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength) as ArrayBuffer), mesh, "Name: x"); return false; } catch (e) { return /not supported yet/.test((e as Error).message); }
  })());
  assert("a file that is not a 3MF is refused", (() => { try { open3mf(new TextEncoder().encode("nope").buffer as ArrayBuffer); return false; } catch { return true; } })());

  console.log("\ndetecting the designer's example text (Bambu text element)");
  const boxObj = (id: number, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const v = [[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]].map(([x, y, z]) => `<vertex x="${x}" y="${y}" z="${z}"/>`).join("");
    const t = [[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].map(([a, b, c]) => `<triangle v1="${a}" v2="${b}" v3="${c}"/>`).join("");
    return `<object id="${id}" type="model"><mesh><vertices>${v}</vertices><triangles>${t}</triangles></mesh></object>`;
  };
  // a 20 mm cube plus a text part 10 x 4 x 1 lying on its top face (object space z = 20), the plate item rotated 90 degrees about Y
  const withText = (subtype: string, text: string, textFaces = 12) => {
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
    <part id="1" subtype="normal_part"><metadata key="name" value="Body"/><mesh_stat face_count="12"/></part>
    <part id="2" subtype="${subtype}"><metadata key="name" value="text_shape"/><text_info text="${text}" font_name="Marker Felt" thickness="1" embeded_depth="0" /><mesh_stat face_count="${textFaces}"/></part>
  </object>
</config>`),
    });
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  };
  const textFiles = open3mf(withText("normal_part", "Cams"));
  const det = detectNameSlot(textFiles);
  assert("finds the text element and reads its text and font", det?.text === "Cams" && det.fontName === "Marker Felt" && det.componentIndex === 1);
  assert("a normal part means raised letters", det?.mode === "raised" && det.notes.length === 0);
  assert("position: the text's centre on the cube top, in BUILD space after the plate rotation (object (10,10,20) -> (120,110,40))", !!det && det.slot.position.every((v, i) => near(v, [120, 110, 40][i], 0.01)), JSON.stringify(det?.slot.position));
  assert("facing and up follow the rotation (out of the top face = +X in build space; up stays +Y)", !!det && det.slot.normal.every((v, i) => near(v, [1, 0, 0][i], 0.001)) && det.slot.up.every((v, i) => near(v, [0, 1, 0][i], 0.001)), JSON.stringify([det?.slot.normal, det?.slot.up]));
  assert("size and depth come from the example's mesh (10 wide, 4 tall, 1 deep)", near(det!.slot.maxWidth, 10, 0.01) && near(det!.slot.height, 4, 0.01) && near(det!.slot.depth, 1, 0.01));
  assert("the example is a valid slot as-is", nameSlotSchema.safeParse(det!.slot).success);
  assert("a negative part is reported as engraved, with a note that it is not supported yet", (() => { const d = detectNameSlot(open3mf(withText("negative_part", "Cams"))); return d?.mode === "engraved" && /not supported yet/.test(d.notes.join(" ")); })());
  assert("an example with letters that have tails gets its height estimated, with a note", (() => { const d = detectNameSlot(open3mf(withText("normal_part", "gym"))); return !!d && d.notes.some((n) => /tails/.test(n)) && near(d.slot.height, 4 * 0.78 < 3 ? 3 : 4 * 0.78, 0.01); })());
  assert("no text element -> null", detectNameSlot(open3mf(bambuBuf)) === null);
  assert("a face count that does not match the mesh -> null (never guess)", detectNameSlot(open3mf(withText("normal_part", "Cams", 99))) === null);
  const before = threeMfSurface(textFiles).mesh;
  const cleaned = stripPlaceholder(textFiles, det!.componentIndex);
  const stripped = threeMfSurface(cleaned).mesh;
  assert("stripping removes the placeholder from the geometry (24 -> 12 triangles)", before.indices.length / 3 === 24 && stripped.indices.length / 3 === 12);
  assert("and from the plate object, the geometry file and the slicer's part list", (strFromU8(cleaned["3D/3dmodel.model"]).match(/<component /g) ?? []).length === 1 && !strFromU8(cleaned["3D/Objects/o.model"]).includes('id="2"') && !strFromU8(cleaned["Metadata/model_settings.config"]).includes("text_info"));
  assert("the cleaned model still reads and the detected spot sits on its surface (fit)", checkFit(stripped, det!.slot, det!.slot.maxWidth, det!.slot.height).fits);
  const cleanedZip = zipSync(cleaned);
  const named = await buildPrintFile({ base: cleanedZip.buffer.slice(cleanedZip.byteOffset, cleanedZip.byteOffset + cleanedZip.byteLength) as ArrayBuffer, kind: "3mf", text: "Al", slot: det!.slot });
  assert("a customer's name prints at the detected spot, and the example text is gone", named.ok && named.report.fit.fits && !strFromU8(unzipSync(named.file)["3D/3dmodel.model"]).includes("Cams"), named.ok ? "" : named.error);

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll name-mesh checks passed.");
})().catch((e) => { console.error(e); process.exit(1); });
