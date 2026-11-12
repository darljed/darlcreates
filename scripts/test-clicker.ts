/**
 * Clicker designer (mechanical switch clicker): schema, shapes, 2D geometry, the housing and cap pieces (every piece a
 * closed solid, pieces that meet without overlapping, matching the measurements of a clicker that prints well), name keys,
 * the 4-colour limit, picture tracing, text, keyring, price rules, validation, the two-object 3MF print file laid out on
 * the plate, the cart/order integration and (with the database) several designs added to a cart at once.
 * No browser. Run: npx tsx scripts/test-clicker.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { strFromU8, unzipSync } from "fflate";
import { like } from "drizzle-orm";
import { isWatertight, meshBounds, NAME_FONT_IDS, type Font } from "../src/lib/name-mesh";
import { loadFont } from "../src/lib/name-3mf";
import { difference, intersect, offset, ringArea, totalArea, union, type Region } from "../src/lib/clicker/poly";
import { SHAPE_IDS, SHAPE_LABELS, shapeRing, rayExit } from "../src/lib/clicker/shapes";
import {
  checkAgainstConfig, clickerColours, clickerConfigOf, clickerPriceDeltaCents, clickerSpecSchema, DEFAULT_CLICKER_CONFIG, defaultSpec, designSummary, LIMITS, nameKeys, newId,
  sizeTierCents, switchCount, switchesApart, switchPattern, type ClickerSpec, type ImageLayer, type TextLayer,
} from "../src/lib/clicker/spec";
import { BORDER_MM, FIT, RELIEF_IDS, RIM_IDS, RIM_MM, totalHeightMm } from "../src/lib/clicker/fit";
import { buildLayout, plateLayout } from "../src/lib/clicker/layout";
import { extrudeLayout, meshOfPart } from "../src/lib/clicker/extrude";
import { textRegions } from "../src/lib/clicker/text";
import { analyzeImage, defaultTrace, traceAnalysis } from "../src/lib/clicker/trace";
import { scaleDesign } from "../src/lib/clicker/state";
import { designToSvg } from "../src/lib/clicker/svg";
import { buildClickerPrint, buildFitTest, checkDesign, designSvgDataUri } from "../src/lib/clicker/server";
import { clickerOptionOf, designOf } from "../src/lib/clicker/of-product";
import { computeUnitPrice, normalizeSelection, type ProductOptionInput } from "../src/lib/pricing";
import { summarizeConfig } from "../src/lib/config-summary";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}
const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps;

const cfg = DEFAULT_CLICKER_CONFIG;
const BLACK = cfg.palette[1], RED = cfg.palette[2], BLUE = cfg.palette[7], WHITE = cfg.palette[0], GREEN = cfg.palette[5];

const square = (cx: number, cy: number, s: number): Region => ({ outer: [[cx - s / 2, cy - s / 2], [cx + s / 2, cy - s / 2], [cx + s / 2, cy + s / 2], [cx - s / 2, cy + s / 2]], holes: [] });
/** A picture layer made of squares, in the layer's own units (longest side = 1). */
const imageLayer = (over: Partial<ImageLayer> & { groups: { color: string; shapes: Region[] }[] }): ImageLayer => ({
  id: newId("i"), kind: "image", name: "Picture", x: 0, y: 0, rotation: 0, mirror: false, visible: true, size: 20,
  regions: over.groups.map((g) => ({ id: newId("g"), color: g.color, shapes: g.shapes })),
  ...Object.fromEntries(Object.entries(over).filter(([k]) => k !== "groups")),
});
const textLayer = (over: Partial<TextLayer> = {}): TextLayer => ({ id: newId("t"), kind: "text", name: "Text", x: 0, y: 0, rotation: 0, mirror: false, visible: true, text: "Hi", font: "bold", size: 8, spacing: 0, lineGap: 1, color: BLACK, ...over });

(async () => {
  const loaded = new Map<string, Font>();
  for (const id of NAME_FONT_IDS) loaded.set(id, await loadFont(id));
  const fonts = (id: string) => loaded.get(id);

  console.log("\nthe design schema");
  const base = defaultSpec(cfg);
  const plain = clickerSpecSchema.parse({ ...base, shape: "circle", layers: [textLayer({ text: "Hi", color: RED })], baseColor: WHITE, capColor: BLACK });
  const nameSpec = (over: Partial<NonNullable<ClickerSpec["name"]>> = {}, top: Partial<ClickerSpec> = {}) => clickerSpecSchema.parse({ ...defaultSpec(cfg, "name"), ...top, name: { ...defaultSpec(cfg, "name").name!, ...over } });
  assert("the default clicker and the default name keys are valid", clickerSpecSchema.safeParse(base).success && clickerSpecSchema.safeParse(defaultSpec(cfg, "name")).success);
  assert("an older (version 1) design is refused, not misread", !clickerSpecSchema.safeParse({ ...base, v: 1 }).success);
  assert("a size under the minimum is refused", !clickerSpecSchema.safeParse({ ...base, width: 5 }).success);
  assert("a size over the maximum is refused", !clickerSpecSchema.safeParse({ ...base, height: 500 }).success);
  assert("NaN and Infinity are refused", !clickerSpecSchema.safeParse({ ...base, width: NaN }).success && !clickerSpecSchema.safeParse({ ...base, corner: Infinity }).success);
  assert("an unknown shape, no switch, a huge border, an unknown rim, relief or colour is refused", [{ shape: "dragon" }, { switches: [] }, { border: 99 }, { rim: "huge" }, { relief: "deep" }, { capColor: "red" }].every((o) => !clickerSpecSchema.safeParse({ ...base, ...o }).success));
  assert("name keys without letters are refused", !clickerSpecSchema.safeParse({ ...defaultSpec(cfg, "name"), name: undefined }).success && !clickerSpecSchema.safeParse({ ...defaultSpec(cfg, "name"), name: { ...defaultSpec(cfg, "name").name!, text: "" } }).success);
  assert("two layers with one id are refused", !clickerSpecSchema.safeParse({ ...base, layers: [{ ...textLayer(), id: "a" }, { ...textLayer(), id: "a" }] }).success);
  assert("more layers than the limit are refused", !clickerSpecSchema.safeParse({ ...base, layers: Array.from({ length: LIMITS.maxLayers + 1 }, () => textLayer()) }).success);
  assert("too many outline points over all pictures are refused", (() => {
    const big: Region = { outer: Array.from({ length: 5000 }, (_, i) => [Math.cos(i) * 0.4, Math.sin(i) * 0.4] as [number, number]), holes: [] };
    return !clickerSpecSchema.safeParse({ ...base, layers: [imageLayer({ groups: [{ color: RED, shapes: [big, big, big, big] }] })] }).success;
  })());
  assert("unknown keys are dropped, not kept", !("evil" in (clickerSpecSchema.parse({ ...base, evil: "<script>" }) as object)));

  console.log("\nshapes");
  for (const id of SHAPE_IDS) {
    const ring = shapeRing(id, 40, 30, { corner: 5, points: 6 });
    const xs = ring.map((p) => p[0]), ys = ring.map((p) => p[1]);
    const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys);
    assert(`${SHAPE_LABELS[id]}: fills 40 × 30 mm, counter-clockwise, centred`, near(w, 40, 0.05) && near(h, 30, 0.05) && ringArea(ring) > 0 && near((Math.max(...xs) + Math.min(...xs)) / 2, 0, 0.05) && near((Math.max(...ys) + Math.min(...ys)) / 2, 0, 0.05), `${w.toFixed(2)}x${h.toFixed(2)} area ${ringArea(ring).toFixed(1)}`);
  }
  assert("a ray from the centre leaves a circle at its radius", (() => { const e = rayExit(shapeRing("circle", 40, 40), 30); return !!e && near(Math.hypot(...e.point), 20, 0.1); })());

  console.log("\n2D geometry");
  const a: Region[] = [square(0, 0, 10)], b: Region[] = [square(5, 0, 10)];
  assert("union, difference and intersection add up", near(totalArea(union(a, b)), 150, 0.01) && near(totalArea(difference(a, b)), 50, 0.01) && near(totalArea(intersect(a, b)), 50, 0.01));
  assert("shrinking a 10 mm square by 1 mm leaves 8 mm; growing makes 12 mm", near(totalArea(offset(a, -1, "miter")), 64, 0.05) && near(totalArea(offset(a, 1, "miter")), 144, 0.05));
  assert("a hole stays a hole through a union", (() => { const ring = difference([square(0, 0, 10)], [square(0, 0, 4)]); const u = union(ring, [square(20, 0, 2)]); return u.length === 2 && u.some((r) => r.holes.length === 1); })());

  console.log("\ntext");
  const hello = textRegions(fonts("bold")!, "Hello", { size: 8, spacing: 0, lineGap: 1 });
  assert("text comes back as outlines about as tall as asked", "regions" in hello && hello.regions.length > 0 && (() => { const ys = hello.regions.flatMap((r) => r.outer.map((p) => p[1])); return Math.max(...ys) - Math.min(...ys) > 7 && Math.max(...ys) - Math.min(...ys) < 12; })());
  const w1 = "regions" in hello ? hello.regions.flatMap((r) => r.outer.map((p) => p[0])) : [0];
  const big = textRegions(fonts("bold")!, "Hello", { size: 16, spacing: 0, lineGap: 1 });
  assert("doubling the size doubles the width", "regions" in big && near(Math.max(...big.regions.flatMap((r) => r.outer.map((p) => p[0]))) - Math.min(...big.regions.flatMap((r) => r.outer.map((p) => p[0]))), 2 * (Math.max(...w1) - Math.min(...w1)), 0.3));
  assert("a letter the font cannot draw names the letter", (() => { const r = textRegions(fonts("bold")!, "日本", { size: 8, spacing: 0, lineGap: 0 }); return "error" in r && /"日"/.test(r.error); })());
  assert("two lines are taller than one, and blank text is nothing", (() => {
    const one = textRegions(fonts("bold")!, "Hi", { size: 8, spacing: 0, lineGap: 1 }), two = textRegions(fonts("bold")!, "Hi\nHi", { size: 8, spacing: 0, lineGap: 1 }), none = textRegions(fonts("bold")!, "   ", { size: 8, spacing: 0, lineGap: 1 });
    const h = (r: typeof one) => ("regions" in r ? (() => { const ys = r.regions.flatMap((q) => q.outer.map((p) => p[1])); return Math.max(...ys) - Math.min(...ys); })() : 0);
    return h(two) > h(one) * 1.8 && "regions" in none && none.regions.length === 0;
  })());
  assert("letter spacing widens the text", (() => {
    const tight = textRegions(fonts("bold")!, "Hello", { size: 8, spacing: 0, lineGap: 0 }), loose = textRegions(fonts("bold")!, "Hello", { size: 8, spacing: 2, lineGap: 0 });
    const wd = (r: typeof tight) => ("regions" in r ? (() => { const xs = r.regions.flatMap((q) => q.outer.map((p) => p[0])); return Math.max(...xs) - Math.min(...xs); })() : 0);
    return wd(loose) > wd(tight) + 5;
  })());


  console.log("\nprice and rules");
  assert("size tiers: the first tier that is big enough applies", sizeTierCents(30, cfg.sizeTiers) === 0 && sizeTierCents(45, cfg.sizeTiers) === 0 && sizeTierCents(46, cfg.sizeTiers) === 4000 && sizeTierCents(80, cfg.sizeTiers) === 8000 && sizeTierCents(99, cfg.sizeTiers) === 8000);
  assert("the base, the cap and one artwork colour: only the third colour is charged", clickerColours(plain).length === 3 && clickerPriceDeltaCents(plain, cfg) === cfg.extraColourCents);
  assert("two colours cost nothing extra", clickerPriceDeltaCents({ ...plain, layers: [] }, cfg) === 0);
  assert("a bigger cap costs more", clickerPriceDeltaCents({ ...plain, width: 50, height: 50 }, cfg) === cfg.extraColourCents + 4000);
  assert("each switch after the first adds the owner's price; name keys use the key price instead", (() => { const two = { ...plain, switches: switchPattern(2) }, three = { ...plain, switches: switchPattern(3) }; return clickerPriceDeltaCents(two, cfg) === cfg.extraColourCents + cfg.extraSwitchCents && clickerPriceDeltaCents(three, cfg) === cfg.extraColourCents + 2 * cfg.extraSwitchCents && clickerPriceDeltaCents(nameSpec({ text: "ABC" }), cfg) === 2 * cfg.keyCents + cfg.extraColourCents; })());
  assert("more switches than the owner allows are refused", checkAgainstConfig({ ...plain, switches: switchPattern(5) }, { ...cfg, maxSwitches: 4 }) !== null && checkAgainstConfig({ ...plain, switches: switchPattern(4) }, { ...cfg, maxSwitches: 4 }) === null);
  assert("owner prices for the keyring and pictures apply only when used", (() => { const c = { ...cfg, keyringCents: 500, imageCents: 700 }; const sq = imageLayer({ groups: [{ color: RED, shapes: [square(0, 0, 1)] }] }); return clickerPriceDeltaCents({ ...plain, layers: [] }, c) === 0 && clickerPriceDeltaCents({ ...plain, layers: [], keyring: { ...plain.keyring, on: true } }, c) === 500 && clickerPriceDeltaCents({ ...plain, layers: [sq] }, c) === 700 + cfg.extraColourCents; })());
  assert("colours are counted once however many layers use them", clickerColours(clickerSpecSchema.parse({ ...plain, layers: [textLayer({ color: RED }), textLayer({ color: RED.toUpperCase() })] })).length === 3);
  assert("a printer holds at most the owner's number of colours (4): base + cap + three more is refused, with the number in the message", (() => {
    const five = clickerSpecSchema.parse({ ...plain, layers: [textLayer({ color: RED }), textLayer({ color: BLUE }), textLayer({ color: GREEN })] });
    const msg = checkAgainstConfig(five, cfg) ?? "";
    const four = clickerSpecSchema.parse({ ...plain, layers: [textLayer({ color: RED }), textLayer({ color: BLUE })] });
    return clickerColours(five).length === 5 && /at most 4 colours/.test(msg) && checkAgainstConfig(four, cfg) === null;
  })());
  assert("the base and the cap can share a colour to leave room for the artwork", clickerColours(clickerSpecSchema.parse({ ...plain, capColor: WHITE, layers: [textLayer({ color: RED }), textLayer({ color: BLUE }), textLayer({ color: GREEN })] })).length === 4);
  assert("the owner's limits are enforced: size, layers, colours not on offer", checkAgainstConfig({ ...plain, width: 20, height: 20 }, cfg) !== null && checkAgainstConfig({ ...plain, width: 95 }, cfg) !== null && /not available/.test(checkAgainstConfig({ ...plain, baseColor: "#123456" }, cfg) ?? "") && checkAgainstConfig(plain, cfg) === null && checkAgainstConfig(plain, { ...cfg, maxLayers: 0 as unknown as number }) !== null);
  assert("the owner can switch off text, pictures and name keys", checkAgainstConfig(plain, { ...cfg, allowText: false }) !== null && checkAgainstConfig({ ...plain, layers: [imageLayer({ groups: [{ color: RED, shapes: [square(0, 0, 1)] }] })] }, { ...cfg, allowImages: false }) !== null && checkAgainstConfig(nameSpec(), { ...cfg, allowName: false }) !== null);
  assert("name keys: the price grows by key, the key limit holds, spaces are not keys", clickerPriceDeltaCents(nameSpec({ text: "A" }), cfg) === cfg.extraColourCents && clickerPriceDeltaCents(nameSpec({ text: "ABC" }), cfg) === 2 * cfg.keyCents + cfg.extraColourCents && checkAgainstConfig(nameSpec({ text: "ABCDEFGHI" }), { ...cfg, maxKeys: 8 }) !== null && nameKeys({ text: "A B  C" }).length === 3 && switchCount(nameSpec({ text: "AB" })) === 2);
  assert("the cart line reads in plain words", /^40 × 40 mm circle clicker, Cherry MX switch, 3 colours, flat design, “Hi”$/.test(designSummary(plain)) && /^Name keys “HEY”, 3 Cherry MX switches, 3 colours$/.test(designSummary(nameSpec())), designSummary(plain) + " | " + designSummary(nameSpec()));

  console.log("\nthe housing and the cap match the sample clicker");
  const sample = clickerSpecSchema.parse({ ...base, shape: "rounded", width: 50, height: 33, corner: 5, layers: [textLayer({ text: "Hi", color: RED, size: 8 })] });
  const ls = buildLayout(sample, fonts);
  const byId = (id: string) => ls.parts.find((p) => p.id.startsWith(id));
  assert("a 50 × 33 mm cap sits in a base 5 mm bigger all round (the sample: 55.07 × 37.91)", near(ls.baseSize[0], 55, 0.1) && near(ls.baseSize[1], 38, 0.1) && near(ls.capSize[0], 50, 0.01) && near(ls.capSize[1], 33, 0.01));
  assert("total height is 22.6 mm with a flat design, 1.2 mm more for high relief", near(ls.totalHeight, 22.6, 0.01) && near(totalHeightMm("high"), 23.8, 0.01));
  assert("the base levels are the sample's: floor 1.2, clip band 7.2 to 8.7, deck at 10, rim 8 mm above it", near(byId("h-floor")!.z1, 1.2) && near(byId("h-body")!.z1, 7.2) && near(byId("h-notch")!.z1, 8.7) && near(byId("h-deck")!.z1, 10) && near(byId("h-rim")!.z1, 18));
  const outlineArea = totalArea(ls.housingOutline);
  assert("the switch chamber is 14 × 14 mm through the body and the deck, with four clip windows in the band between", near(totalArea(byId("h-body")!.regions), outlineArea - 196, 0.5) && near(totalArea(byId("h-deck")!.regions), outlineArea - 196, 0.5) && near(totalArea(byId("h-notch")!.regions), outlineArea - 196 - 4 * FIT.notchWidthMm * FIT.notchDepthMm, 1));
  assert("the cap is solid on top and hollow underneath, with a cross socket in a round boss", (() => {
    const cap = totalArea(ls.capOutline), cav = FIT.cavityMm ** 2;
    const underside = totalArea(ls.parts.find((p) => p.role === "cap-ring")!.regions), socket = totalArea(ls.parts.find((p) => p.role === "cap-boss")!.regions), ceiling = totalArea(ls.parts.find((p) => p.role === "cap-top")!.regions), face = totalArea(ls.parts.find((p) => p.role === "cap-face")!.regions);
    const boss = Math.PI * (FIT.bossDiameterMm / 2) ** 2, cross = 2 * FIT.crossSpanMm * FIT.crossArmMm - FIT.crossArmMm ** 2;
    return near(face, cap, 0.2) && near(ceiling, cap - cav + boss, 1) && near(socket, cap - cav + boss - cross, 1) && underside < socket;
  })());
  assert("the cap is raised to its resting height: it starts 16.6 mm above the base bottom and ends at 22.6", near(Math.min(...ls.parts.filter((p) => p.object === "cap").map((p) => p.z0)), 16.6) && near(Math.max(...ls.parts.filter((p) => p.object === "cap").map((p) => p.z1)), 22.6));
  assert("the artwork is inlaid in the cap's skin: the skin has the artwork cut out and the artwork fills the cut", (() => {
    const skin = ls.parts.find((p) => p.role === "cap-skin")!, art = ls.parts.find((p) => p.role === "art")!;
    return near(totalArea(skin.regions) + totalArea(art.regions), totalArea(ls.capOutline), 0.3) && near(art.z0, skin.z0) && near(art.z1, skin.z1);
  })());
  assert("the rim comes in four heights; flush is level with the top of the key", RIM_IDS.every((r) => near(buildLayout({ ...sample, rim: r }, fonts).parts.find((p) => p.role === "rim")!.z1, FIT.deckTopMm + RIM_MM[r])) && near(RIM_MM.flush, 12.6, 0.01));
  assert("high relief makes the artwork stand 1.2 mm above the skin; low 0.6", near(buildLayout({ ...sample, relief: "high" }, fonts).parts.find((p) => p.role === "art")!.z1, 22.6 + 1.2) && near(buildLayout({ ...sample, relief: "low" }, fonts).parts.find((p) => p.role === "art")!.z1, 22.6 + 0.6));
  assert("the printer's fit settings change the parts: a looser pocket, a looser stem, a wider gap", (() => {
    const t = (tune: { pocket: number; stem: number; gap: number }) => buildLayout(sample, fonts, tune);
    const a = t({ pocket: 0, stem: 0, gap: 0 }), b = t({ pocket: 0.2, stem: 0, gap: 0 }), c = t({ pocket: 0, stem: 0.2, gap: 0 }), d = t({ pocket: 0, stem: 0, gap: 0.2 });
    const area = (l: typeof a, role: string) => totalArea(l.parts.find((p) => p.role === role)!.regions);
    return area(b, "body") < area(a, "body") - 5 && area(c, "cap-boss") < area(a, "cap-boss") - 0.5 && area(d, "rim") < area(a, "rim") - 1;
  })());

  console.log("\nthe switch always fits: small caps are grown");
  const growProblems: string[] = [];
  for (const shape of SHAPE_IDS) {
    const l = buildLayout(clickerSpecSchema.parse({ ...base, shape, width: LIMITS.minSizeMm, height: LIMITS.minSizeMm, layers: [] }), fonts);
    const keep: Region[] = [{ outer: [[-7.5, -7.5], [7.5, -7.5], [7.5, 7.5], [-7.5, 7.5]], holes: [] }];
    if (totalArea(difference(keep, l.capOutline)) > 0.05) growProblems.push(`${shape}: the 15 mm switch square is not inside the cap`);
    const chamber = totalArea(intersect(l.housingOutline, [{ outer: [[-7, -7], [7, -7], [7, 7], [-7, 7]], holes: [] }]));
    if (chamber < 195.9) growProblems.push(`${shape}: the chamber does not fit in the base`);
  }
  assert("on every shape at the smallest size the 15 mm square is inside the cap and the 14 mm chamber inside the base", growProblems.length === 0, growProblems.join(" | "));
  assert("a cap that had to grow says so; one that did not, stays quiet", buildLayout(clickerSpecSchema.parse({ ...base, shape: "heart", width: 24, height: 24, layers: [] }), fonts).warnings.some((w) => /so the switch fits/.test(w)) && !buildLayout(sample, fonts).warnings.some((w) => /so the switch fits/.test(w)));

  console.log("\nevery shape, rim, relief and keyring setting builds closed solids that fit together");
  let combos = 0;
  const bad: string[] = [];
  const check = (spec: ClickerSpec, label: string, deep: boolean) => {
    const layout = buildLayout(spec, fonts);
    const solids = extrudeLayout(layout);
    combos++;
    const open = solids.filter((s) => !isWatertight(meshOfPart(s))).map((s) => s.id);
    const zs = solids.every((s) => { const bb = meshBounds(meshOfPart(s)); return near(bb[2], s.z0, 0.01) && near(bb[5], s.z1, 0.01); });
    let overlap = 0;
    if (deep) {
      // no two pieces share volume: where their heights overlap, their areas must not
      for (let i = 0; i < layout.parts.length; i++) for (let j = i + 1; j < layout.parts.length; j++) {
        const a = layout.parts[i], b = layout.parts[j];
        if (Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > 1e-6) overlap += totalArea(intersect(a.regions, b.regions));
      }
    }
    if (open.length || !zs || overlap > 0.2 || layout.errors.length) bad.push(`${label} open=${open} z=${zs} overlap=${overlap.toFixed(2)} err=${layout.errors}`);
  };
  for (const shape of SHAPE_IDS) for (const keyring of [true, false]) check(clickerSpecSchema.parse({ ...base, shape, keyring: { ...base.keyring, on: keyring }, layers: [textLayer({ text: "Hi", size: 7, color: RED }), imageLayer({ x: 8, y: -6, size: 8, groups: [{ color: BLUE, shapes: [square(0, 0, 0.8)] }] })] }), `${shape}/ring:${keyring}`, true);
  for (const shape of ["circle", "heart", "star"] as const) for (const rim of RIM_IDS) for (const relief of RELIEF_IDS) check(clickerSpecSchema.parse({ ...base, shape, rim, relief }), `${shape}/${rim}/${relief}`, false);
  assert(`${combos} combinations: every piece is a closed solid at its height, and no two pieces share volume`, bad.length === 0, "\n    " + bad.slice(0, 4).join("\n    "));

  console.log("\nlayers, order and colours");
  const twoLayers = clickerSpecSchema.parse({
    ...base, keyring: { ...base.keyring, on: false }, shape: "square", width: 40, height: 40, corner: 0, capColor: WHITE,
    layers: [imageLayer({ size: 20, groups: [{ color: RED, shapes: [square(0, 0, 1)] }] }), imageLayer({ size: 10, groups: [{ color: BLUE, shapes: [square(0, 0, 1)] }] })],
  });
  const lay2 = buildLayout(twoLayers, fonts);
  const area = (color: string) => totalArea(lay2.parts.find((p) => p.color === color.toLowerCase() && p.role === "art")?.regions ?? []);
  assert("the layer above covers the one below (red 20 × 20 minus blue 10 × 10 = 300, blue 100)", near(area(RED), 300, 1) && near(area(BLUE), 100, 1), `${area(RED).toFixed(1)} ${area(BLUE).toFixed(1)}`);
  assert("hiding a layer takes its colour out of the design", (() => { const s = { ...twoLayers, layers: [twoLayers.layers[0], { ...twoLayers.layers[1], visible: false }] }; return !clickerColours(clickerSpecSchema.parse(s)).includes(BLUE.toLowerCase()); })());
  assert("a layer pushed off the cap is reported and prints nothing", (() => { const s = clickerSpecSchema.parse({ ...twoLayers, layers: [{ ...twoLayers.layers[0], x: 150 }] }); const l = buildLayout(s, fonts); return l.warnings.some((w) => /outside/.test(w)) && !l.parts.some((p) => p.role === "art"); })());
  assert("a layer that runs past the edge is reported as cut off", (() => { const s = clickerSpecSchema.parse({ ...twoLayers, layers: [{ ...twoLayers.layers[0], x: 14 }] }); return buildLayout(s, fonts).warnings.some((w) => /cut off/.test(w)); })());
  assert("a layer well inside gives no cut-off note", !buildLayout(twoLayers, fonts).warnings.some((w) => /cut off/.test(w)));
  assert("artwork stays 0.4 mm inside the cap's edge so the skin keeps a rim", (() => {
    const s = clickerSpecSchema.parse({ ...twoLayers, layers: [imageLayer({ size: 60, groups: [{ color: RED, shapes: [square(0, 0, 1)] }] })] });
    const l = buildLayout(s, fonts); const art = l.parts.find((p) => p.role === "art")!;
    const xs = art.regions.flatMap((r) => r.outer.map((q) => q[0]));
    return Math.max(...xs) <= 20 - 0.39;
  })());
  assert("a hairline is too fine to print: it is left out", (() => {
    const hair: Region = { outer: [[-0.5, -0.004], [0.5, -0.004], [0.5, 0.004], [-0.5, 0.004]], holes: [] };
    const s = clickerSpecSchema.parse({ ...twoLayers, layers: [imageLayer({ size: 20, groups: [{ color: RED, shapes: [hair, square(0.3, 0.3, 0.3)] }] })] });
    const l = buildLayout(s, fonts);
    return !l.parts.some((p) => p.role === "art" && totalArea(p.regions) < 0.01) && totalArea(l.parts.find((p) => p.role === "art")?.regions ?? []) > 1;
  })());
  assert("a letter the font cannot draw is an error naming the letter", buildLayout(clickerSpecSchema.parse({ ...base, layers: [textLayer({ text: "日" })] }), fonts).errors.some((e) => /"日"/.test(e)));

  console.log("\nname keys");
  const hey = buildLayout(nameSpec(), fonts);
  assert("HEY is three keys in a row, each 18 mm, 3.6 mm apart; the base is 66.2 × 23 mm", hey.keys.length === 3 && near(hey.capSize[0], 3 * 18 + 2 * 3.6, 0.05) && near(hey.capSize[1], 18, 0.05) && near(hey.baseSize[0], 66.2, 0.1) && near(hey.baseSize[1], 23, 0.1));
  assert("each key has its own switch chamber", near(totalArea(hey.parts.find((p) => p.id === "h-body")!.regions), totalArea(hey.housingOutline) - 3 * 196, 0.5));
  assert("each key has its own cavity and socket (three of each)", near(totalArea(hey.parts.find((p) => p.role === "cap-top")!.regions), totalArea(hey.capOutline) - 3 * (FIT.cavityMm ** 2) + 3 * Math.PI * (FIT.bossDiameterMm / 2) ** 2, 2));
  assert("every letter is inlaid in its key", hey.parts.some((p) => p.role === "art") && near(totalArea(hey.parts.find((p) => p.role === "cap-skin")!.regions) + totalArea(hey.parts.find((p) => p.role === "art")!.regions), totalArea(hey.capOutline), 0.5));
  assert("two keys in a row make two rows, and the caps do not touch", (() => { const l = buildLayout(nameSpec({ text: "ABCD", perRow: 2 }), fonts); return l.keys.length === 4 && near(l.capSize[1], 2 * 18 + 3.6, 0.05) && l.capOutline.length === 4; })());
  assert("a long name on one row that is too wide for the plate is refused with a reason", buildLayout(nameSpec({ text: "ABCDEFGHIJKL", perRow: 12 }), fonts).errors.some((e) => /too big/.test(e)) && buildLayout(nameSpec({ text: "ABCDEFGHIJKL", perRow: 6 }), fonts).errors.length === 0);
  assert("two key colours alternate, and the caps are split by colour", (() => { const l = buildLayout(nameSpec({ text: "ABC", keyColors: [BLACK, BLUE] }), fonts); const colours = new Set(l.parts.filter((p) => p.role === "cap-face").map((p) => p.color)); return colours.size === 2 && clickerColours(nameSpec({ text: "ABC", keyColors: [BLACK, BLUE] })).length === 4; })());
  assert("every part of a name clicker is a closed solid", extrudeLayout(hey).every((s) => isWatertight(meshOfPart(s))));
  assert("a character the font lacks is an error", buildLayout(nameSpec({ text: "日" }), fonts).errors.length === 1);

  console.log("\nthe key follows the artwork (outline)");
  const outlineSpec = (over: Partial<ClickerSpec> = {}) => clickerSpecSchema.parse({ ...base, shape: "outline", capColor: BLACK, baseColor: WHITE, keyring: { ...base.keyring, on: false }, layers: [textLayer({ text: "HI", size: 9, color: RED, font: "chunky" })], ...over });
  const ol = buildLayout(outlineSpec(), fonts);
  const artAll = union([...ol.layerShapes.values()].flat());
  const ab = { minX: Math.min(...artAll.flatMap((r) => r.outer.map((q) => q[0]))), maxX: Math.max(...artAll.flatMap((r) => r.outer.map((q) => q[0]))), minY: Math.min(...artAll.flatMap((r) => r.outer.map((q) => q[1]))), maxY: Math.max(...artAll.flatMap((r) => r.outer.map((q) => q[1]))) };
  assert("the key is one solid shape that holds all the artwork and wraps it with the border", ol.capOutline.length === 1 && ol.capOutline[0].holes.length === 0 && totalArea(difference(artAll, ol.capOutline)) < 0.01 && ol.capBounds.minX <= ab.minX - 1.2 + 0.25 && ol.capBounds.maxX >= ab.maxX + 1.2 - 0.25);
  assert("a thicker border makes a bigger key (0.8, 1.2, 2 and 3 mm)", (() => { const areas = [BORDER_MM.thin, BORDER_MM.normal, BORDER_MM.thick, BORDER_MM.extra].map((b) => totalArea(buildLayout(outlineSpec({ border: b }), fonts).capOutline)); return areas.every((a, i) => i === 0 || a > areas[i - 1]); })());
  assert("the base follows the key: 5 mm bigger all round", near(ol.baseSize[0], ol.capSize[0] + 5, 0.4) && near(ol.baseSize[1], ol.capSize[1] + 5, 0.4));
  assert("letters that are apart are joined into one key; pieces far apart are wrapped in one shape", buildLayout(outlineSpec({ layers: [textLayer({ text: "H", x: -11, color: RED, size: 9 }), textLayer({ text: "I", x: 11, color: RED, size: 9 })] }), fonts).capOutline.length === 1 && buildLayout(outlineSpec({ layers: [textLayer({ text: "H", x: -40, color: RED, size: 9 }), textLayer({ text: "I", x: 40, color: RED, size: 9 })] }), fonts).capOutline.length === 1);
  assert("a letter with a hole (O) does not leave a hole in the key", buildLayout(outlineSpec({ layers: [textLayer({ text: "O", color: RED, size: 16, font: "chunky" })] }), fonts).capOutline.every((r) => r.holes.length === 0));
  assert("with nothing on the key it is just big enough for the switch plus the border", (() => { const l = buildLayout(outlineSpec({ layers: [] }), fonts); return near(l.capSize[0], FIT.keepoutMm + 2 * 1.2, 0.8) && l.errors.length === 0; })());
  assert("the switch square is always inside the key, however small the artwork", (() => { const l = buildLayout(outlineSpec({ layers: [textLayer({ text: ".", size: 2, color: RED, x: 30 })] }), fonts); const keep: Region[] = [{ outer: [[-7.5, -7.5], [7.5, -7.5], [7.5, 7.5], [-7.5, 7.5]], holes: [] }]; return totalArea(difference(keep, l.capOutline)) < 0.05; })());
  assert("making the design 2x bigger makes the key about 2x bigger", (() => { const a = buildLayout(outlineSpec({ layers: [textLayer({ text: "HELLO", color: RED, size: 8 })] }), fonts); const b = buildLayout(scaleDesign(outlineSpec({ layers: [textLayer({ text: "HELLO", color: RED, size: 8 })] }), 2), fonts); const k = b.capSize[0] / a.capSize[0]; return k > 1.7 && k < 2.1; })());
  assert("the owner's minimum size does not apply to a key that follows its design; a fixed shape still needs it", checkAgainstConfig({ ...outlineSpec(), width: 24, height: 24 }, cfg) === null && checkAgainstConfig({ ...plain, width: 24, height: 24 }, cfg) !== null);
  assert("the server checks the size written on an outline design against the real one", await (async () => {
    const big = outlineSpec({ layers: [textLayer({ text: "BIG", color: RED, size: 30, font: "chunky" })], width: 40, height: 40 });
    const real = Math.max(...buildLayout(big, fonts).capSize);
    const lie = await checkDesign(big, cfg);
    const honest = await checkDesign({ ...big, width: Math.ceil(real), height: Math.ceil(real) }, cfg);
    return real > 41 && !lie.ok && /does not match/.test(lie.error) && honest.ok;
  })());
  assert("an outline key bigger than the owner's largest size is refused", await (async () => { const r = await checkDesign(outlineSpec({ layers: [textLayer({ text: "HUGEWORD", color: RED, size: 40, font: "chunky" })], width: 120, height: 120 }), cfg); return !r.ok; })());

  console.log("\nseveral switches under one key");
  assert("tidy patterns: a row, a 2 × 2 grid, 3 + 2 and 3 × 3 columns, all at least 17 mm apart, centred, never more than 6", [1, 2, 3, 4, 5, 6, 7].every((n) => ["row", "grid"].every((a) => { const p = switchPattern(n, a as "row" | "grid"); return p.length === Math.min(n, 6) && switchesApart(p) && near(p.reduce((t, q) => t + q.x, 0), 0, 0.3); })) && switchPattern(4, "grid").every((q) => Math.abs(Math.abs(q.x) - 8.5) < 0.01 && Math.abs(Math.abs(q.y) - 8.5) < 0.01));
  assert("switches closer than 17 mm are refused by the design schema; 17 mm apart is fine; an old design without switches gets one in the middle", !clickerSpecSchema.safeParse({ ...plain, switches: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }).success && clickerSpecSchema.safeParse({ ...plain, switches: [{ x: -8.5, y: 0 }, { x: 8.5, y: 0 }] }).success && !clickerSpecSchema.safeParse({ ...plain, switches: switchPattern(6).concat([{ x: 100, y: 100 }]) }).success && (() => { const { switches: _s, ...old } = plain; void _s; const r = clickerSpecSchema.safeParse(old); return r.success && r.data.switches.length === 1; })());
  assert("diagonal squares may be 17 mm apart in one direction only", switchesApart([{ x: 0, y: 0 }, { x: 17, y: 3 }]) && !switchesApart([{ x: 0, y: 0 }, { x: 16.9, y: 16.9 }]));
  const two = buildLayout(clickerSpecSchema.parse({ ...plain, width: 30, height: 30, switches: switchPattern(2) }), fonts);
  assert("two switches: a 30 mm circle grows (to at least 35 mm) to hold both keep-out squares, and says so; a 40 mm circle already holds them", two.switches.length === 2 && two.capSize[0] >= 35 && !!two.grownFrom && two.warnings.some((w) => /switches fit/.test(w)) && !buildLayout(clickerSpecSchema.parse({ ...plain, switches: switchPattern(2) }), fonts).grownFrom);
  assert("each switch gets its own chamber, clip windows, cavity and socket", (() => {
    const outlineArea = totalArea(two.housingOutline), cap = totalArea(two.capOutline);
    const body = totalArea(two.parts.find((p) => p.id === "h-body")!.regions);
    const ceiling = totalArea(two.parts.find((p) => p.role === "cap-top")!.regions);
    const cavity = FIT.cavityMm ** 2, boss = Math.PI * (FIT.bossDiameterMm / 2) ** 2;
    return near(body, outlineArea - 2 * 196, 0.6) && near(ceiling, cap - 2 * cavity + 2 * boss, 2.5);
  })());
  assert("the chambers do not touch each other, and the walls between them are solid", (() => { const body = two.parts.find((p) => p.id === "h-body")!; const gap = totalArea(intersect(body.regions, [{ outer: [[-1, -6], [1, -6], [1, 6], [-1, 6]], holes: [] }])); return near(gap, 12 * 2, 0.2) ; })());
  assert("six switches on a key that follows the design still fit the plate, with closed solids", (() => {
    const l = buildLayout(outlineSpec({ switches: switchPattern(6, "grid") }), fonts);
    return l.switches.length === 6 && l.errors.length === 0 && !!plateLayout(l) && extrudeLayout(l).every((p) => isWatertight(meshOfPart(p)));
  })());
  assert("switches placed too close together (bypassing the schema) are an error naming the rule", buildLayout({ ...plain, switches: [{ x: 0, y: 0 }, { x: 8, y: 0 }] }, fonts).errors.some((e) => /too close/.test(e)));
  assert("every switch is covered by the key on every shape (4 switches in a grid)", SHAPE_IDS.every((shape) => { const l = buildLayout(clickerSpecSchema.parse({ ...plain, shape, switches: switchPattern(4, "grid"), layers: [] }), fonts); return l.switches.every((p) => totalArea(difference([{ outer: [[p.x - 7.5, p.y - 7.5], [p.x + 7.5, p.y - 7.5], [p.x + 7.5, p.y + 7.5], [p.x - 7.5, p.y + 7.5]], holes: [] }], l.capOutline)) < 0.05); }));

  console.log("\nthe keyring");
  const ringProblems: string[] = [];
  for (const shape of SHAPE_IDS) {
    for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const spec = clickerSpecSchema.parse({ ...base, shape, keyring: { on: true, angle, hole: 5, wall: 2.4 }, layers: [] });
      const l = buildLayout(spec, fonts);
      const tab = l.parts.find((p) => p.id === "h-ring");
      if (!tab || !l.keyring) { ringProblems.push(`${shape}@${angle}: no tab`); continue; }
      const holes = tab.regions.reduce((n, r) => n + r.holes.length, 0);
      const touches = totalArea(intersect(tab.regions, l.housingOutline)) < 0.1;
      const circle = [{ outer: Array.from({ length: 40 }, (_, i) => [l.keyring!.cx + l.keyring!.holeR * Math.cos((i / 40) * 6.2832), l.keyring!.cy + l.keyring!.holeR * Math.sin((i / 40) * 6.2832)] as [number, number]), holes: [] }];
      const holeClear = totalArea(intersect(l.housingOutline, circle)) < 0.05;
      // contact length ~ overlap area of the tab grown by 0.1 mm with the base, / 0.1 (needs a few mm of contact to hold)
      const joined = totalArea(intersect(offset(tab.regions, 0.1), l.housingOutline)) / 0.1 > 3;
      if (holes !== 1 || !touches || !holeClear || !joined) ringProblems.push(`${shape}@${angle}: holes=${holes} separate=${touches} clear=${holeClear} joined=${joined}`);
    }
  }
  assert("on every shape and angle: the tab has one real hole, is joined to the base without overlapping it, and the hole does not cut the base", ringProblems.length === 0, ringProblems.slice(0, 4).join(" | "));
  assert("keyring off: no tab", !buildLayout(base, fonts).parts.some((p) => p.id === "h-ring"));
  assert("the tab is a 3 mm flat tab on the bed", (() => { const t = buildLayout(clickerSpecSchema.parse({ ...base, keyring: { ...base.keyring, on: true } }), fonts).parts.find((p) => p.id === "h-ring")!; return near(t.z0, 0) && near(t.z1, 3); })());

  console.log("\nthe print plate");
  const pl = plateLayout(ls);
  assert("the base and cap fit on the 256 mm plate with margins, side by side or stacked", !!pl && (() => { const b = ls.bounds, c = ls.capBounds; const bx = [b.minX + pl.housing[0], b.maxX + pl.housing[0]], cx = [c.minX + pl.cap[0], c.maxX + pl.cap[0]]; return bx[0] >= 6 - 0.01 && cx[1] <= 250 + 0.01 && (bx[1] + 6 <= cx[0] + 0.01 || b.maxY + pl.housing[1] + 6 <= c.minY + pl.cap[1] + 0.01); })());
  assert("an 8-key name fits (stacked)", plateLayout(buildLayout(nameSpec({ text: "ABCDEFGH", perRow: 8 }), fonts)) !== null);

  console.log("\npictures");
  const W = 120, H = 90;
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - 45, y - 45);
    let c = [250, 250, 250];
    if (d < 34 && d > 12) c = [225, 30, 30];
    if (x > 92 && x < 112 && y > 10 && y < 30) c = [37, 99, 235];
    data.set([...c, 255], (y * W + x) * 4);
  }
  const an = analyzeImage({ width: W, height: H, data }, 4);
  assert("the main colours are found and the white background is recognised", an.palette.length === 3 && an.palette.filter((p) => p.background).length === 1 && an.palette.find((p) => p.background)!.hex === "#fafafa", an.palette.map((p) => `${p.hex}:${p.background}`).join(" "));
  const opt = defaultTrace(an, cfg.palette);
  assert("the colours are matched to the filaments on offer, background left out", opt.target.includes(RED) && opt.target.includes(BLUE) && opt.keep.filter(Boolean).length === 2, JSON.stringify(opt));
  const tr = traceAnalysis(an, { ...opt, smoothing: 1, detail: 0.6 });
  const redShapes = tr.groups.find((g) => g.color === RED)!.shapes;
  assert("the red ring is one shape with one hole, close to its true area", redShapes.length === 1 && redShapes[0].holes.length === 1 && near(totalArea(redShapes) * W * W, Math.PI * (34 ** 2 - 12 ** 2), 90), String(totalArea(redShapes) * W * W));
  assert("the picture's proportions are kept (longest side = 1)", near(tr.fitWidth, 1, 0.001) && near(tr.fitHeight, 0.75, 0.001));
  assert("dropping a colour removes its shapes; two colours mapped to one filament merge", (() => {
    const only = traceAnalysis(an, { keep: an.palette.map((p) => !p.background && p.hex.startsWith("#e")), target: opt.target });
    const merged = traceAnalysis(an, { keep: an.palette.map((p) => !p.background), target: an.palette.map(() => RED) });
    return only.groups.length === 1 && merged.groups.length === 1;
  })());
  assert("fewer details means fewer points", traceAnalysis(an, { ...opt, detail: 0 }).points <= traceAnalysis(an, { ...opt, detail: 1 }).points);
  assert("an empty or fully transparent picture gives no colours instead of failing", analyzeImage({ width: 4, height: 4, data: new Uint8ClampedArray(64) }, 4).palette.length === 0);
  const photo = new Uint8ClampedArray(160 * 160 * 4);
  for (let i = 0; i < 160 * 160; i++) photo.set([(i * 7) % 256, (i * 13) % 256, (i * 29) % 256, 255], i * 4);
  const t0 = performance.now();
  const noisy = traceAnalysis(analyzeImage({ width: 160, height: 160, data: photo }, 6), { keep: [true, true, true, true, true, true], target: cfg.palette.slice(0, 6), maxPoints: 12_000 });
  assert("a noisy photo stays within the point budget and does not take long", noisy.points <= 12_000 && performance.now() - t0 < 8000, `${noisy.points} points in ${Math.round(performance.now() - t0)} ms`);


  console.log("\nthe product option, the price and the cart line");
  const option: ProductOptionInput = { id: "opt-clicker", type: "text", label: "Your clicker", required: true, priceDeltaCents: 0, constraints: { clicker: cfg }, values: [] };
  assert("a text option with clicker settings is the designer; a plain text option is not", clickerOptionOf([option])?.option.id === "opt-clicker" && clickerOptionOf([{ ...option, constraints: { maxLen: 10 } }]) === null && clickerConfigOf({ clicker: { palette: ["nope"] } }) === null);
  const sel = { [option.id]: { design: plain } };
  assert("computeUnitPrice adds the design's price to the product price", computeUnitPrice(10000, [option], sel).unitPriceCents === 10000 + clickerPriceDeltaCents(plain, cfg) && computeUnitPrice(10000, [option], { [option.id]: { design: { ...plain, width: 50, height: 50 } } }).unitPriceCents === 10000 + clickerPriceDeltaCents({ ...plain, width: 50, height: 50 }, cfg));
  assert("a missing design is an error when required; an invalid or off-limits one says why", computeUnitPrice(10000, [option], {}).errors[0] === "Your clicker is required" && computeUnitPrice(10000, [option], { [option.id]: { design: { nope: 1 } } }).errors.length === 1 && /at most/.test(computeUnitPrice(10000, [option], { [option.id]: { design: { ...plain, width: 90 } } }).errors[0]));
  const norm = normalizeSelection([option], { [option.id]: { design: { ...plain, evil: "x" }, text: "ignored", valueId: "x" }, other: { text: "no" } }, () => false);
  assert("normalizing keeps only the design (cleaned) for the designer option", norm.errors.length === 0 && Object.keys(norm.config).join() === option.id && Object.keys(norm.config[option.id]).join() === "design" && !("evil" in (norm.config[option.id].design as object)));
  assert("a design that is not valid (an old version) is refused with a message, not stored", normalizeSelection([option], { [option.id]: { design: { v: 1 } } }, () => false).errors.length === 1);
  assert("the order summary shows the design", summarizeConfig([option], norm.config)[0]?.label === "Your clicker" && /circle/.test(summarizeConfig([option], norm.config)[0].value));
  assert("designOf finds the saved design on a line", designOf([option], norm.config)?.spec.shape === "circle" && designOf([option], {}) === null && designOf([{ ...option, constraints: {} }], norm.config) === null);

  console.log("\nthe server: checks, print file and picture");
  assert("a good design passes", (await checkDesign(plain, cfg)).ok && (await checkDesign(nameSpec(), cfg)).ok);
  assert("a letter the font lacks is refused with the letter named", await (async () => { const r = await checkDesign({ ...plain, layers: [textLayer({ text: "日" })] }, cfg); return !r.ok && /"日"/.test(r.error); })());
  assert("too many colours, a size outside the limits and garbage are refused", !(await checkDesign({ ...plain, layers: [textLayer({ color: RED }), textLayer({ color: BLUE }), textLayer({ color: GREEN })] }, cfg)).ok && !(await checkDesign({ ...plain, width: 95 }, cfg)).ok && !(await checkDesign("garbage", cfg)).ok);
  const print = await buildClickerPrint(clickerSpecSchema.parse({ ...plain, layers: [textLayer({ text: "Hello", color: RED })] }), "Test clicker");
  assert("the print file is built, every piece is a closed solid", print.ok && print.report.pieces.length >= 8 && print.report.pieces.every((p) => p.watertight), print.ok ? JSON.stringify(print.report.pieces.map((p) => [p.name, p.watertight])) : print.error);
  if (print.ok) {
    const files = unzipSync(print.file);
    const model = strFromU8(files["3D/3dmodel.model"]), bambu = strFromU8(files["Metadata/model_settings.config"]);
    assert("the 3MF holds two objects, the base and the top, in millimetres", /unit="millimeter"/.test(model) && (model.match(/<item objectid/g) ?? []).length === 2 && /BASE"/.test(bambu) && /TOP"/.test(bambu));
    assert("the base prints with 3 walls and the thin cap with 1", [...bambu.matchAll(/<object id="\d+">\s*<metadata key="name" value="([^"]*)"\/>\s*<metadata key="extruder" value="\d+"\/>\s*<metadata key="wall_loops" value="(\d+)"/g)].map((m) => `${/BASE$/.test(m[1]) ? "base" : "top"}:${m[2]}`).sort().join() === "base:3,top:1");
    assert("each distinct colour is one base material and one filament, and none more than the printer's 4", (model.match(/<base /g) ?? []).length === print.report.filaments.length && print.report.filaments.length === 3 && print.report.filaments.length <= 4);
    assert("everything lies on the plate: between 0 and 256 mm in x and y, base from z 0 to 18, cap printed from z 0", print.report.pieces.every((p) => p.bounds[0] >= 5.99 && p.bounds[3] <= 250.01 && p.bounds[1] >= 5.99 && p.bounds[4] <= 250.01) && print.report.pieces.filter((p) => p.object === "cap").every((p) => p.bounds[2] >= -0.001 && p.bounds[5] <= 6.01) && print.report.pieces.filter((p) => p.object === "housing").every((p) => p.bounds[5] <= 18.01));
    assert("the filament colours are listed for the slicer", JSON.parse(strFromU8(files["Metadata/project_settings.config"])).filament_colour.length === print.report.filaments.length);
    assert("the report names the sizes and the switch", near(print.report.capSize[0], 40, 0.1) && near(print.report.baseSize[0], 45, 0.1) && print.report.switches === 1 && near(print.report.totalHeightMm, 22.6, 0.01));
  }
  console.log("\nthe fit test plate");
  const fit = await buildFitTest();
  const fitFiles = unzipSync(fit.file);
  const fitModel = strFromU8(fitFiles["3D/3dmodel.model"]), fitBambu = strFromU8(fitFiles["Metadata/model_settings.config"]);
  assert("the fit test has a base and a key for each of four steps, in one colour, in two objects", (fitBambu.match(/<part /g) ?? []).length === 4 * 5 + 4 * 5 && (fitModel.match(/<base /g) ?? []).length === 1 && (fitModel.match(/<item objectid/g) ?? []).length === 2 && /BASES/.test(fitBambu) && /KEYS/.test(fitBambu));
  assert("each base's pocket differs: the steps -0.1, 0, +0.1, +0.2 are named in the file", ["Pocket -0.1", "Pocket +0.0", "Pocket +0.1", "Pocket +0.2", "Stem -0.1", "Stem +0.2"].every((n) => fitBambu.includes(n)));
  assert("the fit test lies on the plate with margins", (() => { const xs = [...fitModel.matchAll(/<vertex x="([\d.-]+)" y="([\d.-]+)"/g)].map((m) => [Number(m[1]), Number(m[2])]); return xs.length > 100 && Math.min(...xs.map((v) => v[0])) >= 5.99 && Math.max(...xs.map((v) => v[0])) <= 250 && Math.min(...xs.map((v) => v[1])) >= 5.99 && Math.max(...xs.map((v) => v[1])) <= 250; })());

  const nameprint = await buildClickerPrint(nameSpec(), "Name");
  assert("name keys print too: three switches, all pieces closed", nameprint.ok && nameprint.report.switches === 3 && nameprint.report.pieces.every((p) => p.watertight));
  assert("a design that cannot be drawn is refused rather than written", (await buildClickerPrint(clickerSpecSchema.parse({ ...plain, layers: [textLayer({ text: "日" })] }))).ok === false);
  const uri = await designSvgDataUri(plain);
  assert("the cart picture is an SVG data URL with the design's colours and no scripts", uri.startsWith("data:image/svg+xml") && decodeURIComponent(uri).includes(BLACK) && decodeURIComponent(uri).includes(RED) && !/<script|onload|javascript:/i.test(decodeURIComponent(uri)));
  assert("the same design gives the same picture (cached)", (await designSvgDataUri(plain)) === uri);
  assert("the svg flips y so the design reads the right way up", designToSvg(plain, fonts).includes("scale(1 -1)"));

  console.log("\ncart: several designs at once (database)");
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { addManyToCart, MAX_NAMES_PER_ADD } = await import("../src/lib/cart-service");
  const { getCartLines } = await import("../src/lib/cart");
  const T = `TEST-CLK-${Date.now()}`;
  const user = `${T}-u`;
  try {
    await db.insert(s.users).values({ id: user, name: "T", email: `${user}@test.local`, emailVerified: true, role: "customer" });
    const [p] = await db.insert(s.products).values({ slug: `${T}-prod`, name: `${T} Clicker`, basePriceCents: 15000, status: "published" }).returning();
    const [o] = await db.insert(s.productOptions).values({ productId: p.id, type: "text", label: "Your clicker", required: true, priceDeltaCents: 0, constraints: { clicker: cfg }, sort: 0 }).returning();
    const row = (spec: unknown, qty = 1) => ({ qty, selection: { [o.id]: { design: spec } } });
    const good1 = plain, good2 = clickerSpecSchema.parse({ ...plain, shape: "star", width: 50, height: 50, layers: [textLayer({ text: "Ana", color: RED })] }), good3 = nameSpec();
    const added = await addManyToCart(user, { productId: p.id, rows: [row(good1, 2), row(good2), row(good3)] });
    assert("three different designs (two clickers and a name) become three cart lines", added.ok && added.added === 3, JSON.stringify(added));
    const lines = await getCartLines(user);
    const l1 = lines.find((l) => l.qty === 2)!, l2 = lines.find((l) => l.qty === 1 && /star/.test(l.summary[0].value))!, l3 = lines.find((l) => /Name keys/.test(l.summary[0].value))!;
    assert("each line is priced by its own design", l1.unitPriceCents === 15000 + clickerPriceDeltaCents(good1, cfg) && l2.unitPriceCents === 15000 + clickerPriceDeltaCents(good2, cfg) && l3.unitPriceCents === 15000 + clickerPriceDeltaCents(good3, cfg), `${l1?.unitPriceCents} ${l2?.unitPriceCents} ${l3?.unitPriceCents}`);
    assert("each line has its own picture and a readable summary", !!l1.designUri && !!l2.designUri && !!l3.designUri && l1.designUri !== l2.designUri && l2.summary[0].value.includes("star") && l2.summary[0].value.includes("“Ana”") && l3.summary[0].value.includes("HEY"));
    const before = (await getCartLines(user)).length;
    const bad = await addManyToCart(user, { productId: p.id, rows: [row(good1), row({ ...good1, width: 95 }), row(good2)] });
    assert("one design outside the limits adds nothing at all, and says which", !bad.ok && /^Name 2:/.test(bad.error) && (await getCartLines(user)).length === before, JSON.stringify(bad));
    assert("a design with a letter the font lacks is refused", !(await addManyToCart(user, { productId: p.id, rows: [row({ ...good1, layers: [textLayer({ text: "日" })] })] })).ok);
    assert("a design that needs more colours than the printer holds is refused", !(await addManyToCart(user, { productId: p.id, rows: [row({ ...good1, layers: [textLayer({ color: RED }), textLayer({ color: BLUE }), textLayer({ color: GREEN })] })] })).ok);
    assert("a forged price or extra fields do not reach the stored design", await (async () => {
      const r = await addManyToCart(user, { productId: p.id, rows: [{ qty: 1, selection: { [o.id]: { design: { ...good1, priceCents: 1, __proto__: { x: 1 } } as unknown } } }] });
      const all = await getCartLines(user);
      return r.ok && all.every((l) => !("priceCents" in ((l.config[o.id]?.design ?? {}) as object)));
    })());
    assert("no design at all is refused (the option is required)", !(await addManyToCart(user, { productId: p.id, rows: [{ qty: 1, selection: {} }] })).ok);
    assert("the limit on designs per add holds", !(await addManyToCart(user, { productId: p.id, rows: Array.from({ length: MAX_NAMES_PER_ADD + 1 }, () => row(good1)) })).ok);
  } finally {
    await db.delete(s.carts).where(like(s.carts.userId, "TEST-CLK-%"));
    await db.delete(s.products).where(like(s.products.slug, "TEST-CLK-%"));
    await db.delete(s.users).where(like(s.users.id, "TEST-CLK-%"));
  }

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll clicker checks passed.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
