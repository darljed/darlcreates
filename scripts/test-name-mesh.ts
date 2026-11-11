/**
 * Name on a model: slot validation, text -> raised-letter geometry (size, position, orientation, printability checks),
 * and the 3MF print file built from a real STL. No DB, no network. Run from the project root:
 *   npx tsx scripts/test-name-mesh.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { strFromU8, unzipSync } from "fflate";
import { buildName, cleanName, fontChoices, isWatertight, meshBounds, NAME_FONT_IDS, nameSlotSchema, personalizedName, slotMaxHeight, slotOf, suggestFont, toMesh, withFont, withNameColor, type Mesh, type NameSlot } from "../src/lib/name-mesh";
import { colorName } from "../src/lib/color-name";
import { SPACE_TOLERANCE_MM, SurfaceProbe, measureSpace } from "../src/lib/name-space";
import { clampToSpace, maxHeightFor, maxWidthFor, spaceLimits } from "../src/lib/name-mesh";
import { normalizeSelection, type ProductOptionInput } from "../src/lib/pricing";
import { summarizeConfig } from "../src/lib/config-summary";
import { addNameTo3mf, buildColoredFile, buildPrintFile, checkFit, engraveProblem, wallThickness, detectNameSlot, loadFont, nameProblem, open3mf, readStlMesh, stripPlaceholder, threeMfSurface, fitScale, shrinkSlot, FIT_TOLERANCE_MM } from "../src/lib/name-3mf";
import { strToU8, zipSync } from "fflate";
import { withText } from "./fixtures/bambu-text-3mf";
import { annotateGroups, colorGroups, plateObjectNear, readConfigObjects, setFilaments } from "../src/lib/threemf";
import { defaultPartSelection, filamentAssignments, partColorsFor, wholeModelColor } from "../src/lib/part-colors";
import { prepareMultiPart, HIDDEN_PART_NAME } from "../src/lib/viewer-framing";
import { Group, Mesh as ThreeMesh, MeshStandardMaterial, BoxGeometry } from "three";

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
  assert("an unknown font is refused", !nameSlotSchema.safeParse({ ...topSlot, font: "wingdings" }).success);
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

  console.log("\nfonts");
  for (const id of NAME_FONT_IDS) {
    const r = buildName(await loadFont(id), "Ana", { ...topSlot, font: id, height: 7 });
    assert(`${id}: builds "Ana", watertight, printable strokes`, r.ok && isWatertight(toMesh(r.geometry)) && r.stemMm >= 0.8, r.ok ? `stroke ${r.stemMm.toFixed(2)}` : r.error);
  }
  console.log("\nthe whole outline stays inside the slot rectangle (ascenders and descenders included)");
  {
    const boxSlot: NameSlot = { ...topSlot, maxWidth: 24, height: 8, maxHeight: 10 };
    for (const id of NAME_FONT_IDS) {
      let worst = 0, widest = 0, printable = 0;
      for (const t of ["Maria", "Gypsy", "Jay", "Phoebe", "Cams", "Bjorg"]) {
        const r = buildName(await loadFont(id), t, { ...boxSlot, font: id });
        if (!r.ok) continue; // refused as unprintable is fine; what is built must fit
        printable++;
        const m = toMesh(r.geometry), [x0, y0, , x1, y1] = meshBounds(m);
        worst = Math.max(worst, y1 - y0, 0);
        widest = Math.max(widest, x1 - x0);
        if (Math.abs((y0 + y1) / 2 - 10) > 0.05 || Math.abs((x0 + x1) / 2 - 10) > 0.05) worst = 99; // centred on the slot, both ways
      }
      assert(`${id}: every name that builds is at most 24 x 10 mm and centred (widest ${widest.toFixed(1)}, tallest ${worst.toFixed(1)}, ${printable}/6 printable)`, printable > 0 && worst <= 10.001 && widest <= 24.001);
    }
  }
  assert("tails make the ink taller than the capital letters (Script, Gypsy vs Maria), which is why the rectangle is measured on the ink", await (async () => {
    const f = await loadFont("script");
    const loose: NameSlot = { ...topSlot, font: "script", maxWidth: 80, height: 8, maxHeight: 60 };
    const g = buildName(f, "Gypsy", loose), m = buildName(f, "Maria", loose);
    return g.ok && m.ok && g.inkHeightMm > m.inkHeightMm + 1.5 && g.inkHeightMm > g.heightMm * 1.3;
  })());
  assert("older slots without maxHeight get 1.5 x the capital height", slotMaxHeight({ height: 6 }) === 9 && slotMaxHeight({ height: 6, maxHeight: 7 }) === 7);
  assert("there are six fonts to choose from", NAME_FONT_IDS.length === 6);
  assert("fontChoices: no list = just the default; the default is always included", fontChoices({ font: "bold" }).join() === "bold" && fontChoices({ font: "bold", fonts: ["chunky", "marker"] }).join() === "bold,chunky,marker");
  assert("withFont applies an offered font and ignores one that is not offered", withFont({ ...topSlot, fonts: ["bold", "chunky"] }, "chunky").font === "chunky" && withFont({ ...topSlot, fonts: ["bold", "chunky"] }, "script").font === "bold" && withFont(topSlot, "chunky").font === "bold" && withFont(topSlot, undefined).font === "bold");
  assert("suggestFont maps a designer's font name to the closest of ours", suggestFont("Marker Felt") === "marker" && suggestFont("Brush Script MT") === "script" && suggestFont("Arial Narrow") === "condensed" && suggestFont("Arial") === "bold");
  assert("personalizedName uses the customer's font when allowed", (() => { const o = { id: "o1", type: "text", constraints: { slot: { ...topSlot, fonts: ["bold", "chunky"] } } }; return personalizedName([o], { o1: { text: "Ana", font: "chunky" } }, "a.stl")?.slot.font === "chunky" && personalizedName([o], { o1: { text: "Ana", font: "script" } }, "a.stl")?.slot.font === "bold"; })());
  assert("a hostile font name in a cart selection is dropped by normalizeSelection", (() => {
    const opt: ProductOptionInput = { id: "t", type: "text", label: "Name", required: false, priceDeltaCents: 0, constraints: { slot: { ...topSlot, fonts: ["bold", "chunky"] } }, values: [] };
    const keep = normalizeSelection([opt], { t: { text: "Ana", font: "chunky" } }, () => true).config.t;
    const drop = normalizeSelection([opt], { t: { text: "Ana", font: "../../etc/passwd" } }, () => true).config.t;
    const none = normalizeSelection([{ ...opt, constraints: { slot: topSlot } }], { t: { text: "Ana", font: "chunky" } }, () => true).config.t;
    return keep.font === "chunky" && drop.font === undefined && none.font === undefined;
  })());
  const palette: NameSlot = { ...topSlot, nameColors: [{ label: "Red", hex: "#FF0000", filament: 3 }, { label: "Green", hex: "#00ff00" }] };
  assert("withNameColor applies an offered colour (any letter case), with its filament if known, and ignores others", (() => {
    const red = withNameColor(palette, "#ff0000"), green = withNameColor(palette, "#00FF00");
    return red.nameColor?.hex === "#FF0000" && red.nameColor.filament === 3 && green.nameColor?.hex === "#00ff00" && green.nameColor.filament === undefined && withNameColor(palette, "#123456") === palette && withNameColor(palette, undefined) === palette;
  })());
  assert("personalizedName hands the chosen name colour to the print file", personalizedName([{ id: "o1", type: "text", constraints: { slot: palette } }], { o1: { text: "Ana", nameColor: "#FF0000" } }, "a.stl")?.slot.nameColor?.filament === 3);
  assert("normalizeSelection keeps an offered name colour (as the slot spells it) and drops others, including junk", (() => {
    const opt: ProductOptionInput = { id: "t", type: "text", label: "Name", required: false, priceDeltaCents: 0, constraints: { slot: palette }, values: [] };
    const keep = normalizeSelection([opt], { t: { text: "Ana", nameColor: "#ff0000" } }, () => true).config.t;
    const other = normalizeSelection([opt], { t: { text: "Ana", nameColor: "#123456" } }, () => true).config.t;
    const none = normalizeSelection([{ ...opt, constraints: { slot: topSlot } }], { t: { text: "Ana", nameColor: "#FF0000" } }, () => true).config.t;
    return keep.nameColor === "#FF0000" && other.nameColor === undefined && none.nameColor === undefined;
  })());
  assert("the cart summary names the font and the name colour", (() => {
    const opt: ProductOptionInput = { id: "t", type: "text", label: "Name", required: false, priceDeltaCents: 0, constraints: { slot: { ...palette, fonts: ["bold", "chunky"] } }, values: [] };
    return summarizeConfig([opt], { t: { text: "Ana", font: "chunky", nameColor: "#FF0000" } })[0].value === "Ana (Chunky font, Red name)" && summarizeConfig([opt], { t: { text: "Ana" } })[0].value === "Ana";
  })());
  assert("colorName: plain names for filament colours", colorName("#FF0000") === "Red" && colorName("#F95D73") === "Pink" && colorName("#000000") === "Black" && colorName("#FFFFFF") === "White" && colorName("#F7E6DE") === "Cream" && colorName("#0077A5") === "Blue" && colorName("#22C55E") === "Green" && colorName("zzz") === "zzz");

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
  assert("fitScale: a rectangle that already fits is 1; one hanging over the edge shrinks proportionally until it fits", (() => {
    const edge = { ...topSlot, position: [14, 10, 20] as [number, number, number], maxWidth: 30, maxHeight: 10 }; // 6 mm from the edge: at most 12 wide
    const k = fitScale(base, edge);
    const smaller = k ? shrinkSlot(edge, k) : null;
    return fitScale(base, topSlot) === 1 && !!k && k < 1 && !!smaller && smaller.maxWidth <= 12.5 && smaller.maxWidth >= 9 && smaller.maxHeight! < 10 && checkFit(base, smaller, smaller.maxWidth, smaller.maxHeight!).fits;
  })());
  assert("fitScale gives up (null) when the spot itself is off the surface", fitScale(base, { ...topSlot, position: [30, 10, 20], maxWidth: 30 }) === null);
  assert("a side wall works the same way", checkFit(base, side, 12, 5).fits && !checkFit(base, { ...side, position: [20, 10, 18.5] }, 12, 5).fits);

  console.log("\nroom at a spot (limits for the admin editor)");
  const cubeTable = measureSpace(base, topSlot);
  assert("centred on the 20 mm cube top: 19 to 20 mm wide for any height up to 17 mm, nothing at 25 mm and above", cubeTable.heights.every((h, i) => (h <= 17 ? cubeTable.widths[i] >= 19 && cubeTable.widths[i] <= 20 : h >= 25 ? cubeTable.widths[i] === 0 : true)), JSON.stringify(cubeTable));
  const edgeTable = measureSpace(base, { ...topSlot, position: [14, 10, 20] });
  assert("6 mm from the edge: no wider than 12 (+ tolerance) at any height, and never wider when taller", Math.max(...edgeTable.widths) <= 13 && edgeTable.widths.every((w, i) => i === 0 || w <= edgeTable.widths[i - 1]), JSON.stringify(edgeTable.widths));
  assert("off the model: no room anywhere", spaceLimits(measureSpace(base, { ...topSlot, position: [40, 10, 20] })).maxWidth === 0);
  assert("every width the table allows really passes checkFit", edgeTable.heights.every((h, i) => !edgeTable.widths[i] || checkFit(base, { ...topSlot, position: [14, 10, 20] }, edgeTable.widths[i], h).fits));
  assert("the fast probe agrees with checkFit on random rectangles (cube, several spots)", (() => {
    let n = 0, same = 0;
    for (const pos of [[10, 10, 20], [14, 10, 20], [4, 4, 20], [16, 16, 20], [10, 10, 25]] as [number, number, number][]) {
      const probe = new SurfaceProbe(base, { ...topSlot, position: pos }, 60, 40);
      for (const [w, h] of [[8, 3], [12, 6], [20, 5], [20, 20], [26, 8], [30, 30], [10, 12]]) {
        n++;
        if (probe.fits(w, h) === checkFit(base, { ...topSlot, position: pos }, w, h).fits) same++;
      }
    }
    return n === same;
  })());
  assert("the tolerance in name-space matches the one in checkFit", SPACE_TOLERANCE_MM === FIT_TOLERANCE_MM);
  const sp = { heights: [3, 5, 8, 12], widths: [30, 24, 16, 0] };
  assert("maxWidthFor / maxHeightFor read the table conservatively", maxWidthFor(sp, 5) === 24 && maxWidthFor(sp, 6) === 16 && maxWidthFor(sp, 13) === 0 && maxHeightFor(sp, 24) === 5 && maxHeightFor(sp, 25) === 3 && maxHeightFor(sp, 31) === 0);
  assert("clampToSpace: widening shrinks the height to fit; making taller shrinks the width; nothing fits = 0", (() => {
    const a = clampToSpace(sp, { width: 40, height: 8 }, "width"); // width capped at 30, then height at most 3
    const b = clampToSpace(sp, { width: 30, height: 20 }, "height"); // height capped at 8, then width at most 16
    const none = clampToSpace({ heights: [3], widths: [0] }, { width: 10, height: 5 }, "width");
    return a.width === 30 && a.height === 3 && b.height === 8 && b.width === 16 && none.width === 0 && none.height === 0;
  })());

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
  const bambuSlot: NameSlot = { ...topSlot, position: [133, 133, 15], maxWidth: 9, height: 4 };
  const bambuFit = checkFit(surf.mesh, bambuSlot, 7, 4);
  assert("a small name on the first cube's top fits", bambuFit.fits, JSON.stringify(bambuFit.gaps));
  assert("a wide name over both cubes and the gap between them does not", !checkFit(surf.mesh, { ...bambuSlot, position: [143, 133, 15] }, 25, 3).fits);
  const bambuPf = await buildPrintFile({ base: bambuBuf, kind: "3mf", text: "Al", slot: bambuSlot });
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
  assert("a plate with two objects reads as one surface (24 triangles) and a negative part (type other) is left out of it", (() => {
    const two = zipSync({ "3D/3dmodel.model": strToU8(`<model><resources>${cubeObj(1, 0)}${cubeObj(2, 0)}</resources><build><item objectid="1"/><item objectid="2"/></build></model>`) });
    const surface = threeMfSurface(open3mf(two.buffer.slice(two.byteOffset, two.byteOffset + two.byteLength) as ArrayBuffer));
    const neg = zipSync({ "3D/3dmodel.model": strToU8(`<model><resources>${cubeObj(1, 0)}<object id="3" type="model"><components><component objectid="1"/><component objectid="2"/></components></object>${cubeObj(2, 0).replace('type="model"', 'type="other"')}</resources><build><item objectid="3"/></build></model>`) });
    return surface.mesh.indices.length / 3 === 24 && surface.items.length === 2 && threeMfSurface(open3mf(neg.buffer.slice(neg.byteOffset, neg.byteOffset + neg.byteLength) as ArrayBuffer)).mesh.indices.length / 3 === 12;
  })());
  assert("a plate object that is a plain mesh (no parts) is refused rather than guessed", (() => {
    try { const plain = zipSync({ "3D/3dmodel.model": strToU8(`<model xmlns:p="x"><resources>${cubeObj(1, 0)}</resources><build><item objectid="1"/></build></model>`) }); addNameTo3mf(open3mf(plain.buffer.slice(plain.byteOffset, plain.byteOffset + plain.byteLength) as ArrayBuffer), mesh, "Name: x"); return false; } catch (e) { return /not supported yet/.test((e as Error).message); }
  })());
  assert("a file that is not a 3MF is refused", (() => { try { open3mf(new TextEncoder().encode("nope").buffer as ArrayBuffer); return false; } catch { return true; } })());

  console.log("\ndetecting the designer's example text (Bambu text element)");
  const textFiles = open3mf(withText("normal_part", "Cams"));
  const det = detectNameSlot(textFiles);
  assert("finds the text element and reads its text and font", det?.text === "Cams" && det.fontName === "Marker Felt" && det.componentIndex === 1);
  assert("a normal part means raised letters", det?.mode === "raised" && det.notes.length === 0);
  assert("position: the text's centre on the cube top, in BUILD space after the plate rotation (object (10,10,20) -> (120,110,40))", !!det && det.slot.position.every((v, i) => near(v, [120, 110, 40][i], 0.01)), JSON.stringify(det?.slot.position));
  assert("facing and up follow the rotation (out of the top face = +X in build space; up stays +Y)", !!det && det.slot.normal.every((v, i) => near(v, [1, 0, 0][i], 0.001)) && det.slot.up.every((v, i) => near(v, [0, 1, 0][i], 0.001)), JSON.stringify([det?.slot.normal, det?.slot.up]));
  assert("size and depth come from the example's mesh (10 wide, 4 tall, 1 deep)", near(det!.slot.maxWidth, 10, 0.01) && near(det!.slot.height, 4, 0.01) && near(det!.slot.depth, 1, 0.01));
  assert("the example is a valid slot as-is", nameSlotSchema.safeParse(det!.slot).success);
  const eng = detectNameSlot(open3mf(withText("negative_part", "Cams", 12, { engraved: true })));
  assert("a negative part is reported as engraved: slot mode engraved, depth = how far the example goes into the model (1.5), pointing out of the face", eng?.mode === "engraved" && eng.slot.mode === "engraved" && near(eng.slot.depth, 1.5, 0.01) && eng.slot.normal.every((v, i) => near(v, [1, 0, 0][i], 0.001)), JSON.stringify(eng?.slot));
  const twoObj = open3mf(withText("normal_part", "Cams", 12, { second: true }));
  const det2 = detectNameSlot(twoObj);
  assert("with two objects on the plate the text is found on the right one and the slot remembers it", det2?.objectId === "3" && det2.slot.object === "3" && threeMfSurface(twoObj).items.length === 2);
  assert("a name added to a chosen plate object lands in that object's part list (not the other's)", (() => {
    const out = addNameTo3mf(twoObj, mesh, "Name: x", { objectId: "4" });
    const cfg = strFromU8(out["Metadata/model_settings.config"]);
    const second = /<object id="4">[\s\S]*?<\/object>/.exec(cfg)![0];
    return second.includes("Name: x") && !/<object id="3">[\s\S]*?<\/object>/.exec(cfg)![0].includes("Name: x");
  })());
  assert("an example with letters that have tails gets its height estimated, with a note", (() => { const d = detectNameSlot(open3mf(withText("normal_part", "gym"))); return !!d && d.notes.some((n) => /tails/.test(n)) && near(d.slot.height, 4 * 0.78 < 3 ? 3 : 4 * 0.78, 0.01); })());
  assert("the font name is mapped to the closest of our fonts, and a short list is offered", det?.slot.font === "marker" && det.slot.fonts?.join() === "marker,bold,chunky");
  const sameColour = detectNameSlot(open3mf(withText("normal_part", "Cams", 12, { filaments: ["#F95D73", "#00FF00"] })));
  assert("example in the same filament as the model: the name follows the model (no own colour)", sameColour?.slot.nameColor === undefined && sameColour?.filaments.length === 2 && sameColour?.nameFilament === 1 && sameColour?.bodyFilament === 1);
  const contrast = detectNameSlot(open3mf(withText("normal_part", "Cams", 12, { textExt: 2, filaments: ["#F95D73", "#00FF00"] })));
  assert("example in a different filament: the name keeps that colour and filament number", contrast?.slot.nameColor?.hex === "#00FF00" && contrast.slot.nameColor.filament === 2 && /filament 2/.test(contrast.notes.join(" ")));
  assert("a damaged project_settings.config is ignored, not fatal", (() => { const f = open3mf(withText("normal_part", "Cams")); f["Metadata/project_settings.config"] = strToU8("{not json"); return detectNameSlot(f)?.filaments.length === 0; })());
  assert("no text element -> null", detectNameSlot(open3mf(bambuBuf)) === null);
  assert("a face count that does not match the mesh -> null (never guess)", detectNameSlot(open3mf(withText("normal_part", "Cams", 99))) === null);
  const before = threeMfSurface(textFiles).mesh;
  const cleaned = stripPlaceholder(textFiles, det!.objectId, det!.componentIndex);
  const stripped = threeMfSurface(cleaned).mesh;
  assert("stripping removes the placeholder from the geometry (24 -> 12 triangles)", before.indices.length / 3 === 24 && stripped.indices.length / 3 === 12);
  assert("and from the plate object, the geometry file and the slicer's part list", (strFromU8(cleaned["3D/3dmodel.model"]).match(/<component /g) ?? []).length === 1 && !strFromU8(cleaned["3D/Objects/o.model"]).includes('id="2"') && !strFromU8(cleaned["Metadata/model_settings.config"]).includes("text_info"));
  assert("the cleaned model still reads and the detected spot sits on its surface (fit)", checkFit(stripped, det!.slot, det!.slot.maxWidth, det!.slot.height).fits);
  const cleanedZip = zipSync(cleaned);
  const pfColour = await buildPrintFile({ base: cleanedZip.buffer.slice(cleanedZip.byteOffset, cleanedZip.byteOffset + cleanedZip.byteLength) as ArrayBuffer, kind: "3mf", text: "Al", slot: { ...det!.slot, font: "bold", nameColor: { hex: "#00FF00", filament: 2 } } });
  assert("the added part is assigned to the name's own filament in the slicer's part list", pfColour.ok && /Name: Al[\s\S]*?key="extruder" value="2"/.test(strFromU8(unzipSync(pfColour.file)["Metadata/model_settings.config"])));
  const pfSame = await buildPrintFile({ base: cleanedZip.buffer.slice(cleanedZip.byteOffset, cleanedZip.byteOffset + cleanedZip.byteLength) as ArrayBuffer, kind: "3mf", text: "Al", slot: { ...det!.slot, font: "bold" } });
  assert("without an own colour the added part uses the object's filament", pfSame.ok && /Name: Al[\s\S]*?key="extruder" value="1"/.test(strFromU8(unzipSync(pfSame.file)["Metadata/model_settings.config"])));
  const named = await buildPrintFile({ base: cleanedZip.buffer.slice(cleanedZip.byteOffset, cleanedZip.byteOffset + cleanedZip.byteLength) as ArrayBuffer, kind: "3mf", text: "Al", slot: { ...det!.slot, font: "bold" } });
  assert("a customer's name prints at the detected spot, and the example text is gone", named.ok && named.report.fit.fits && !strFromU8(unzipSync(named.file)["3D/3dmodel.model"]).includes("Cams"), named.ok ? "" : named.error);


  console.log("\nengraved names (negative parts)");
  const engSlot: NameSlot = { ...topSlot, mode: "engraved", sink: 0, depth: 1.2 };
  const engBuilt = buildName(font, "Ana", engSlot);
  assert("an engraved name spans from `depth` below the surface to a little above it (clean cut)", engBuilt.ok && (() => { const b = meshBounds(toMesh(engBuilt.geometry)); return near(b[2], 20 - 1.2, 0.01) && near(b[5], 20.2, 0.01); })());
  assert("and is watertight like a raised one", engBuilt.ok && isWatertight(toMesh(engBuilt.geometry)));
  assert("an engraved slot needs no sink, and the mode is validated", nameSlotSchema.safeParse(engSlot).success && !nameSlotSchema.safeParse({ ...engSlot, mode: "carved" }).success);
  assert("an STL cannot take an engraved name (nothing to subtract with)", await (async () => { const r = await buildPrintFile({ base: cubeStl, kind: "stl", text: "Ana", slot: engSlot }); return !r.ok && /3MF/.test(r.error); })());
  assert("wall behind the name on the 20 mm cube is 20 mm; a 1.2 mm cut leaves plenty", near(wallThickness(base, topSlot, 12, 5) ?? 0, 20, 0.05) && engraveProblem(base, engSlot, 12, 5) === null);
  const boxMesh = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Mesh => ({
    positions: Float32Array.from([[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0],[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]].flat()),
    indices: Uint32Array.from([[0,2,1],[0,3,2],[4,5,6],[4,6,7],[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]].flat()),
  });
  const plate2 = boxMesh(0, 30, 0, 30, 0, 1.5); // a 1.5 mm plate
  const thinSlot: NameSlot = { ...engSlot, position: [15, 15, 1.5], depth: 1.2 };
  assert("a 1.5 mm plate is too thin for a 1.2 mm cut (needs 0.8 mm left): refused with the depth that would work", (() => { const p = engraveProblem(plate2, thinSlot, 10, 4); return !!p && /only 1.5 mm thick/.test(p) && /0\.7 mm or less/.test(p); })());
  assert("a 0.6 mm cut in that plate is fine", engraveProblem(plate2, { ...thinSlot, depth: 0.6 }, 10, 4) === null);
  assert("raised names are never checked for wall", engraveProblem(plate2, { ...thinSlot, mode: undefined }, 10, 4) === null);
  assert("an open mesh (nothing behind the name) cannot be judged and says so", /closed solid/.test(engraveProblem({ positions: Float32Array.from([0,0,0, 30,0,0, 30,30,0]), indices: Uint32Array.from([0,1,2]) }, { ...thinSlot, position: [15, 5, 0.5] }, 4, 2) ?? ""));
  {
    const two = open3mf(withText("normal_part", "Cams", 12, { second: true, engraved: false }));
    const withNeg = open3mf(withText("negative_part", "Cams", 12, { engraved: true }));
    const out = addNameTo3mf(withNeg, toMesh((engBuilt as { geometry: Parameters<typeof toMesh>[0] }).geometry), "Name: Ana", { engraved: true, objectId: "3" });
    const model = strFromU8(out["3D/3dmodel.model"]), cfg = strFromU8(out["Metadata/model_settings.config"]);
    assert("an engraved name is added as a NEGATIVE part: object type other + subtype negative_part", /name="Name: Ana" type="other"/.test(model) && /subtype="negative_part">\s*<metadata key="name" value="Name: Ana"/.test(cfg));
    assert("and it is left out of the product surface (the slicer subtracts it)", threeMfSurface(out).mesh.indices.length / 3 === threeMfSurface(withNeg).mesh.indices.length / 3);
    const raised = addNameTo3mf(two, toMesh((engBuilt as { geometry: Parameters<typeof toMesh>[0] }).geometry), "Name: Ana", { objectId: "3" });
    assert("a raised name is an ordinary part", /name="Name: Ana" type="model"/.test(strFromU8(raised["3D/3dmodel.model"])));
  }
  assert("plateObjectNear: with two objects on the plate, a click goes to the nearest; with one there is nothing to choose", (() => {
    const f = open3mf(withText("normal_part", "Cams", 12, { second: true }));
    const surf = threeMfSurface(f).mesh;
    return plateObjectNear(surf, [100, 100, 40]) === "3" && plateObjectNear(surf, [302, 3, 3]) === "4" && plateObjectNear(threeMfSurface(open3mf(withText("normal_part", "Cams"))).mesh, [0, 0, 0]) === null;
  })());

  console.log("\nparts coloured on their own (colour groups)");
  const multi = open3mf(withText("normal_part", "Cams", 12, { second: true, filaments: ["#F95D73", "#00FF00", "#0000FF"] }));
  const groups = colorGroups(multi);
  assert("ordinary parts are grouped by filament (the example text is not a part): Body on 1, Lid on 3", groups.length === 2 && groups[0].label === "Body" && groups[0].filament === 1 && groups[1].label === "Lid" && groups[1].filament === 3, JSON.stringify(groups));
  assert("a negative part (the engraved example) is not a group: only the body is", colorGroups(open3mf(withText("negative_part", "Cams", 12, { engraved: true }))).map((g) => g.label).join() === "Body");
  const ann = annotateGroups(multi, groups);
  assert("each group's mesh is named for the viewer, only names change", ann.named.join() === "0,1" && strFromU8(ann.files["3D/Objects/o.model"]).includes('name="dc-slot-0"') && strFromU8(ann.files["3D/Objects/o.model"]).includes('name="dc-slot-1"') && threeMfSurface(ann.files).mesh.indices.length === threeMfSurface(multi).mesh.indices.length);
  assert("negative parts are named dc-hide so the preview does not draw them", annotateGroups(open3mf(withText("negative_part", "Cams", 12, { engraved: true })), []).hidden === 1);
  assert("the viewer colours named parts, hides dc-hide and leaves the rest on the product colour", (() => {
    const mk = (name: string) => { const m = new ThreeMesh(new BoxGeometry(1, 1, 1), new MeshStandardMaterial({ name: "default" })); m.name = name; return m; };
    const g = new Group(); const a = mk("dc-slot-0"), b = mk("dc-slot-1"), c = mk("other"), h = mk(HIDDEN_PART_NAME); g.add(a, b, c, h);
    const out = prepareMultiPart(g, "#ff0000", (m) => m.name === "default", { "dc-slot-0": "#00ff00" });
    const col = (n: string) => ((out.getObjectByName(n) as ThreeMesh).material as MeshStandardMaterial).color.getHexString();
    return col("dc-slot-0") === "00ff00" && col("dc-slot-1") === "ff0000" && col("other") === "ff0000" && out.getObjectByName(HIDDEN_PART_NAME)!.visible === false;
  })());
  const re = setFilaments(multi, [{ objectId: "4", partId: "1", filament: 2 }, { objectId: "3", partId: "1", filament: 3 }]);
  const cfgObjs = readConfigObjects(re);
  assert("setFilaments changes the part (and the object when all its ordinary parts agree), nothing else", cfgObjs.find((o) => o.id === "4")!.parts[0].extruder === 2 && cfgObjs.find((o) => o.id === "4")!.extruder === 2 && cfgObjs.find((o) => o.id === "3")!.parts[0].extruder === 3 && cfgObjs.find((o) => o.id === "3")!.parts[1].extruder === 1);
  const coloured = buildColoredFile(zipSync(multi).buffer.slice(0) as ArrayBuffer, [{ objectId: "4", partId: "1", filament: 2 }]);
  assert("a colours-only print file (no name) reads back with the new filament", readConfigObjects(open3mf(coloured.buffer.slice(coloured.byteOffset, coloured.byteOffset + coloured.byteLength) as ArrayBuffer)).find((o) => o.id === "4")!.parts[0].extruder === 2);
  const colOpt = (id: string, partName: string, objectId: string, defaultHex: string): ProductOptionInput => ({
    id, type: "color", label: `${partName} colour`, required: true, priceDeltaCents: 0,
    constraints: { partName, parts: [{ objectId, partId: "1" }], filaments: { "#F95D73": 1, "#00FF00": 2, "#0000FF": 3 }, defaultHex },
    values: [{ id: `${id}a`, label: "Pink", value: "#F95D73", priceDeltaCents: 0 }, { id: `${id}b`, label: "Green", value: "#00FF00", priceDeltaCents: 0 }, { id: `${id}c`, label: "Blue", value: "#0000FF", priceDeltaCents: 0 }],
  });
  const partOpts = [colOpt("c0", "dc-slot-0", "3", "#F95D73"), colOpt("c1", "dc-slot-1", "4", "#0000FF")];
  assert("part options start on the designer's colours", JSON.stringify(defaultPartSelection(partOpts)) === JSON.stringify({ c0: { valueId: "c0a" }, c1: { valueId: "c1c" } }));
  assert("the viewer gets mesh name -> chosen hex (default when nothing is chosen)", JSON.stringify(partColorsFor(partOpts, { c1: { valueId: "c1b" } })) === JSON.stringify({ "dc-slot-0": "#F95D73", "dc-slot-1": "#00FF00" }));
  assert("the print file gets filament numbers per slicer part", JSON.stringify(filamentAssignments(partOpts, { c0: { valueId: "c0c" }, c1: { valueId: "c1b" } })) === JSON.stringify([{ objectId: "3", partId: "1", filament: 3 }, { objectId: "4", partId: "1", filament: 2 }]));
  assert("an option that colours the whole model sets the single-colour look; part options do not", wholeModelColor([...partOpts, { ...colOpt("w", "", "3", ""), constraints: {} }], { w: { valueId: "wb" }, c0: { valueId: "c0c" } }) === "#00FF00");
  assert("an engraved name drops any name colour the client sent", (() => {
    const o: ProductOptionInput = { id: "t", type: "text", label: "Name", required: false, priceDeltaCents: 0, values: [], constraints: { slot: { font: "bold", mode: "engraved", nameColors: [{ hex: "#FF0000" }] } } };
    return normalizeSelection([o], { t: { text: "Ana", nameColor: "#FF0000" } }, () => false).config.t.nameColor === undefined;
  })());

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll name-mesh checks passed.");
})().catch((e) => { console.error(e); process.exit(1); });
