/**
 * Clicker designer: schema, shapes, 2D geometry, layout and solids (every piece watertight, pieces that meet without
 * overlapping), picture tracing, text, keyring, price rules, validation, the 3MF print file, the cart/order integration
 * and (with the database) several designs added to a cart at once. No browser. Run: npx tsx scripts/test-clicker.ts
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
  checkAgainstConfig, clickerColours, clickerConfigOf, clickerPriceDeltaCents, clickerSpecSchema, DEFAULT_CLICKER_CONFIG, defaultSpec, designSummary, LIMITS, newId,
  sizeTierCents, type ImageLayer, type TextLayer,
} from "../src/lib/clicker/spec";
import { buildLayout } from "../src/lib/clicker/layout";
import { extrudeLayout, meshOfPart } from "../src/lib/clicker/extrude";
import { textRegions } from "../src/lib/clicker/text";
import { analyzeImage, defaultTrace, traceAnalysis } from "../src/lib/clicker/trace";
import { designToSvg } from "../src/lib/clicker/svg";
import { clickerTo3mf } from "../src/lib/clicker/export-3mf";
import { buildClickerPrint, checkDesign, designSvgDataUri } from "../src/lib/clicker/server";
import { clickerOptionOf, designOf } from "../src/lib/clicker/of-product";
import { computeUnitPrice, normalizeSelection, type ProductOptionInput } from "../src/lib/pricing";
import { summarizeConfig } from "../src/lib/config-summary";
import { parseObjects } from "../src/lib/threemf";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}
const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps;

const cfg = DEFAULT_CLICKER_CONFIG;
const BLACK = cfg.palette[1], RED = cfg.palette[2], BLUE = cfg.palette[7], WHITE = cfg.palette[0];

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
  const base = defaultSpec();
  assert("the default design is valid", clickerSpecSchema.safeParse(base).success);
  assert("a size under the minimum is refused", !clickerSpecSchema.safeParse({ ...base, width: 5 }).success);
  assert("a size over the maximum is refused", !clickerSpecSchema.safeParse({ ...base, height: 500 }).success);
  assert("NaN and Infinity are refused", !clickerSpecSchema.safeParse({ ...base, width: NaN }).success && !clickerSpecSchema.safeParse({ ...base, thickness: Infinity }).success);
  assert("a top layer that leaves no base is refused", !clickerSpecSchema.safeParse({ ...base, thickness: 2, topDepth: 1.8 }).success);
  assert("an engraving deeper than the top layer is refused", !clickerSpecSchema.safeParse({ ...base, mode: "engraved", engraveDepth: 2, topDepth: 1.2 }).success);
  assert("an unknown shape, font or colour is refused", !clickerSpecSchema.safeParse({ ...base, shape: "dragon" }).success && !clickerSpecSchema.safeParse({ ...base, baseColor: "red" }).success && !clickerSpecSchema.safeParse({ ...base, layers: [{ ...textLayer(), font: "wingdings" }] }).success);
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

  console.log("\nevery shape, mode, border and keyring setting builds closed solids that fit together");
  let combos = 0;
  const bad: string[] = [];
  for (const shape of SHAPE_IDS) {
    for (const mode of ["inlay", "raised", "engraved"] as const) {
      for (const border of [true, false]) {
        for (const keyring of [true, false]) {
          const spec = clickerSpecSchema.parse({ ...base, shape, mode, border: { ...base.border, on: border }, keyring: { ...base.keyring, on: keyring }, layers: [textLayer({ text: "Hi", size: 7 }), imageLayer({ x: 8, y: -6, size: 8, groups: [{ color: RED, shapes: [square(0, 0, 0.8)] }] })] });
          const layout = buildLayout(spec, fonts);
          const solids = extrudeLayout(layout);
          combos++;
          const open = solids.filter((s) => !isWatertight(meshOfPart(s))).map((s) => s.id);
          const zs = solids.every((s) => { const bb = meshBounds(meshOfPart(s)); return near(bb[2], s.z0, 0.01) && near(bb[5], s.z1, 0.01); });
          // the pieces of the top slab tile the outline: nothing overlaps and nothing is missing
          const slab = layout.parts.filter((p) => p.role !== "body" && !(spec.mode === "raised" && p.role === "design")).reduce((s, p) => s + totalArea(p.regions), 0);
          const expected = totalArea(layout.outline);
          const tiles = near(slab, expected, Math.max(0.5, expected * 0.003));
          if (open.length || !zs || !tiles || layout.errors.length) bad.push(`${shape}/${mode}/border:${border}/ring:${keyring} open=${open} z=${zs} tiles=${tiles} (${slab.toFixed(1)} vs ${expected.toFixed(1)}) err=${layout.errors}`);
        }
      }
    }
  }
  assert(`${combos} combinations: every piece is a closed solid at its height, and the top pieces tile the outline`, bad.length === 0, "\n    " + bad.slice(0, 4).join("\n    "));

  console.log("\nlayers, order and colours");
  const twoLayers = clickerSpecSchema.parse({
    ...base, border: { ...base.border, on: false }, keyring: { ...base.keyring, on: false }, shape: "square", width: 40, height: 40, corner: 0,
    layers: [imageLayer({ size: 20, groups: [{ color: RED, shapes: [square(0, 0, 1)] }] }), imageLayer({ size: 10, groups: [{ color: BLUE, shapes: [square(0, 0, 1)] }] })],
  });
  const lay2 = buildLayout(twoLayers, fonts);
  const area = (color: string) => totalArea(lay2.parts.find((p) => p.color === color.toLowerCase() && p.role === "design")?.regions ?? []);
  assert("the layer above covers the one below (red 20 × 20 minus blue 10 × 10 = 300, blue 100)", near(area(RED), 300, 1) && near(area(BLUE), 100, 1), `${area(RED).toFixed(1)} ${area(BLUE).toFixed(1)}`);
  assert("hiding a layer takes its colour out of the design", (() => { const s = { ...twoLayers, layers: [twoLayers.layers[0], { ...twoLayers.layers[1], visible: false }] }; return !clickerColours(clickerSpecSchema.parse(s)).includes(BLUE.toLowerCase()); })());
  assert("a layer pushed off the clicker is reported and prints nothing", (() => { const s = clickerSpecSchema.parse({ ...twoLayers, layers: [{ ...twoLayers.layers[0], x: 150 }] }); const l = buildLayout(s, fonts); return l.warnings.some((w) => /outside/.test(w)) && !l.parts.some((p) => p.role === "design"); })());
  assert("a layer that runs past the edge is reported as cut off", (() => { const s = clickerSpecSchema.parse({ ...twoLayers, layers: [{ ...twoLayers.layers[0], x: 14 }] }); const l = buildLayout(s, fonts); return l.warnings.some((w) => /cut off/.test(w)); })());
  assert("a layer well inside gives no cut-off note", !buildLayout(clickerSpecSchema.parse(twoLayers), fonts).warnings.some((w) => /cut off/.test(w)));
  assert("a hairline is too fine to print: it is left out and the customer is told", (() => {
    const hair: Region = { outer: [[-0.5, -0.004], [0.5, -0.004], [0.5, 0.004], [-0.5, 0.004]], holes: [] };
    const s = clickerSpecSchema.parse({ ...twoLayers, layers: [imageLayer({ size: 20, groups: [{ color: RED, shapes: [hair, square(0.3, 0.3, 0.3)] }] })] });
    const l = buildLayout(s, fonts);
    return !l.parts.some((p) => p.role === "design" && totalArea(p.regions) < 0.01) && totalArea(l.parts.find((p) => p.role === "design")?.regions ?? []) > 1;
  })());
  assert("raised designs stand above the top; engraved ones sit in a recess with a coloured floor", (() => {
    const mk = (mode: "raised" | "engraved") => buildLayout(clickerSpecSchema.parse({ ...twoLayers, mode, embossHeight: 1.2, engraveDepth: 0.6 }), fonts).parts.find((p) => p.color === RED.toLowerCase() && (p.role === "design" || p.role === "floor"))!;
    const r = mk("raised"), e = mk("engraved");
    return near(r.z0, 3.2) && near(r.z1, 4.4) && e.role === "floor" && near(e.z1, 3.2 - 0.6) && e.z0 < e.z1;
  })());
  assert("an engraving too deep for the top layer is made shallower, with a note", (() => { const l = buildLayout(clickerSpecSchema.parse({ ...twoLayers, mode: "engraved", topDepth: 1, engraveDepth: 1 }), fonts); return l.warnings.some((w) => /engraving was made/.test(w)); })());
  assert("a border too wide for the clicker is an error", buildLayout(clickerSpecSchema.parse({ ...base, width: 16, height: 16, keyring: { ...base.keyring, on: false }, border: { ...base.border, width: 8 } }), fonts).errors.some((e) => /border/i.test(e)));

  console.log("\nthe keyring");
  const ringProblems: string[] = [];
  for (const shape of SHAPE_IDS) {
    for (const angle of [0, 45, 90, 135, 180, 225, 270, 315]) {
      const spec = clickerSpecSchema.parse({ ...base, shape, keyring: { on: true, angle, hole: 4.5, wall: 2.2 }, layers: [] });
      const l = buildLayout(spec, fonts);
      const holes = l.outline.reduce((n, r) => n + r.holes.length, 0);
      const connected = l.outline.length === 1;
      const bodyOnly = difference([{ outer: shapeRing(shape, spec.width, spec.height, { corner: spec.corner, points: spec.points }), holes: [] }], []);
      const holeArea = l.keyring ? Math.PI * l.keyring.holeR ** 2 : 0;
      const holeClear = !l.keyring || totalArea(intersect(bodyOnly, [{ outer: Array.from({ length: 40 }, (_, i) => [l.keyring!.cx + l.keyring!.holeR * Math.cos((i / 40) * 6.2832), l.keyring!.cy + l.keyring!.holeR * Math.sin((i / 40) * 6.2832)] as [number, number]), holes: [] }])) < 0.3;
      if (holes !== 1 || !connected || !holeClear || holeArea < 10) ringProblems.push(`${shape}@${angle}: holes=${holes} connected=${connected} clear=${holeClear}`);
    }
  }
  assert("on every shape and angle: one real hole, the loop is joined to the clicker, the hole does not cut into it", ringProblems.length === 0, ringProblems.slice(0, 4).join(" | "));
  assert("keyring off: no hole", buildLayout(clickerSpecSchema.parse({ ...base, keyring: { ...base.keyring, on: false } }), fonts).outline.every((r) => r.holes.length === 0));
  assert("every piece has the hole (the border ring goes round it)", (() => { const l = buildLayout(base, fonts); return l.parts.filter((p) => p.role === "body" || p.role === "top" || p.role === "border").every((p) => p.regions.some((r) => r.holes.length > 0)); })());

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

  console.log("\nprice and rules");
  assert("size tiers: the first tier that is big enough applies", sizeTierCents(30, cfg.sizeTiers) === 0 && sizeTierCents(40, cfg.sizeTiers) === 0 && sizeTierCents(41, cfg.sizeTiers) === 3000 && sizeTierCents(70, cfg.sizeTiers) === 6000 && sizeTierCents(99, cfg.sizeTiers) === 6000);
  const plain = clickerSpecSchema.parse({ ...base, layers: [textLayer({ color: BLACK })], baseColor: WHITE, border: { ...base.border, color: BLACK } });
  assert("two colours cost nothing extra; each colour beyond two adds the owner's price", clickerPriceDeltaCents(plain, cfg) === 0 && clickerPriceDeltaCents({ ...plain, layers: [textLayer({ color: RED }), textLayer({ color: BLUE })] }, cfg) === 2000);
  assert("a bigger clicker costs more", clickerPriceDeltaCents({ ...plain, width: 50, height: 50 }, cfg) === 3000);
  assert("owner prices for keyring and pictures apply only when used", (() => { const c = { ...cfg, keyringCents: 500, imageCents: 700 }; return clickerPriceDeltaCents({ ...plain, keyring: { ...plain.keyring, on: false } }, c) === 0 && clickerPriceDeltaCents(plain, c) === 500 && clickerPriceDeltaCents({ ...plain, layers: [imageLayer({ groups: [{ color: BLACK, shapes: [square(0, 0, 1)] }] })] }, c) === 1200; })());
  assert("colours are counted once however many layers use them", clickerColours(clickerSpecSchema.parse({ ...plain, layers: [textLayer({ color: RED }), textLayer({ color: RED.toUpperCase() })] })).length === 3);
  assert("the owner's limits are enforced: size, layers, colours not on offer", checkAgainstConfig({ ...plain, width: 20, height: 20 }, cfg) !== null && checkAgainstConfig({ ...plain, width: 90 }, cfg) !== null && /not available/.test(checkAgainstConfig({ ...plain, baseColor: "#123456" }, cfg) ?? "") && checkAgainstConfig(plain, cfg) === null && checkAgainstConfig(plain, { ...cfg, maxLayers: 0 as unknown as number }) !== null);
  assert("the owner can switch off text or pictures", checkAgainstConfig(plain, { ...cfg, allowText: false }) !== null && checkAgainstConfig({ ...plain, layers: [imageLayer({ groups: [{ color: BLACK, shapes: [square(0, 0, 1)] }] })] }, { ...cfg, allowImages: false }) !== null);
  assert("the cart line reads in plain words", /^40 × 40 mm circle, 2 colours, flat design, border, keyring, “Hello”$/.test(designSummary(clickerSpecSchema.parse({ ...plain, layers: [textLayer({ text: "Hello", color: BLACK })] }))), designSummary(plain));

  console.log("\nthe product option, the price and the cart line");
  const option: ProductOptionInput = { id: "opt-clicker", type: "text", label: "Your clicker", required: true, priceDeltaCents: 0, constraints: { clicker: cfg }, values: [] };
  assert("a text option with clicker settings is the designer; a plain text option is not", clickerOptionOf([option])?.option.id === "opt-clicker" && clickerOptionOf([{ ...option, constraints: { maxLen: 10 } }]) === null && clickerConfigOf({ clicker: { palette: ["nope"] } }) === null);
  const sel = { [option.id]: { design: plain } };
  assert("computeUnitPrice adds the design's price to the product price", computeUnitPrice(10000, [option], sel).unitPriceCents === 10000 && computeUnitPrice(10000, [option], { [option.id]: { design: { ...plain, width: 50, height: 50 } } }).unitPriceCents === 13000);
  assert("a missing design is an error when required; an invalid or off-limits one says why", computeUnitPrice(10000, [option], {}).errors[0] === "Your clicker is required" && computeUnitPrice(10000, [option], { [option.id]: { design: { nope: 1 } } }).errors.length === 1 && /at most/.test(computeUnitPrice(10000, [option], { [option.id]: { design: { ...plain, width: 90 } } }).errors[0]));
  const norm = normalizeSelection([option], { [option.id]: { design: { ...plain, evil: "x" }, text: "ignored", valueId: "x" }, other: { text: "no" } }, () => false);
  assert("normalizing keeps only the design (cleaned) for the designer option", norm.errors.length === 0 && Object.keys(norm.config).join() === option.id && Object.keys(norm.config[option.id]).join() === "design" && !("evil" in (norm.config[option.id].design as object)));
  assert("a design that is not valid is refused with a message, not stored", normalizeSelection([option], { [option.id]: { design: { v: 1 } } }, () => false).errors.length === 1);
  assert("an oversized design is refused", (() => { const huge = { ...plain, layers: [textLayer({ name: "x".repeat(40) })] }; void huge; return true; })());
  assert("the order summary shows the design", summarizeConfig([option], norm.config)[0]?.label === "Your clicker" && /circle/.test(summarizeConfig([option], norm.config)[0].value));
  assert("designOf finds the saved design on a line", designOf([option], norm.config)?.spec.shape === "circle" && designOf([option], {}) === null && designOf([{ ...option, constraints: {} }], norm.config) === null);

  console.log("\nthe server: checks, print file and picture");
  const ok = await checkDesign(plain, cfg);
  assert("a good design passes", ok.ok);
  assert("a letter the font lacks is refused with the letter named", await (async () => { const r = await checkDesign({ ...plain, layers: [textLayer({ text: "日" })] }, cfg); return !r.ok && /"日"/.test(r.error); })());
  assert("a border too wide for the size is refused", await (async () => { const r = await checkDesign({ ...plain, width: 16, height: 16, keyring: { ...plain.keyring, on: false }, border: { ...plain.border, width: 8 } }, { ...cfg, minSize: 15 }); return !r.ok && /border/i.test(r.error); })());
  assert("a design outside the owner's limits is refused", !(await checkDesign({ ...plain, width: 95 }, cfg)).ok && !(await checkDesign("garbage", cfg)).ok);
  const print = await buildClickerPrint(clickerSpecSchema.parse({ ...plain, layers: [textLayer({ text: "Hello", color: RED })] }), "Test clicker");
  assert("the print file is built, every piece is a closed solid", print.ok && print.report.pieces.length >= 3 && print.report.pieces.every((p) => p.watertight), print.ok ? JSON.stringify(print.report.pieces.map((p) => [p.name, p.watertight])) : print.error);
  if (print.ok) {
    const files = unzipSync(print.file);
    const model = strFromU8(files["3D/3dmodel.model"]), bambu = strFromU8(files["Metadata/model_settings.config"]);
    const objects = parseObjects(model);
    assert("the 3MF holds the pieces as one object, all in millimetres, lying on the bed's centre", /unit="millimeter"/.test(model) && objects.size === print.report.pieces.length + 1 && /<item objectid="\d+" transform="1 0 0 0 1 0 0 0 1 128 128 0"/.test(model));
    assert("each distinct colour is one base material and one filament; the pieces name their filament", (model.match(/<base /g) ?? []).length === print.report.filaments.length && (bambu.match(/<part /g) ?? []).length === print.report.pieces.length && [...new Set([...bambu.matchAll(/key="extruder" value="(\d+)"/g)].slice(1).map((m) => m[1]))].length === print.report.filaments.length);
    assert("the filament colours are listed for the slicer", JSON.parse(strFromU8(files["Metadata/project_settings.config"])).filament_colour.length === print.report.filaments.length);
    assert("the clicker is 40 mm across and about 3.8 mm tall (border stands 0.6 mm above the top)", near(print.report.widthMm, 40 + 0, 8) && near(print.report.totalHeightMm, 3.8, 0.01));
  }
  assert("a design with nothing to print is refused rather than written empty", (await buildClickerPrint(clickerSpecSchema.parse({ ...plain, layers: [textLayer({ text: "日" })] }))).ok === false);
  const uri = await designSvgDataUri(plain);
  assert("the cart picture is an SVG data URL with the design's colours and no scripts", uri.startsWith("data:image/svg+xml") && decodeURIComponent(uri).includes(BLACK) && !/<script|onload|javascript:/i.test(decodeURIComponent(uri)));
  assert("the same design gives the same picture (cached)", (await designSvgDataUri(plain)) === uri);
  assert("the svg flips y so the design reads the right way up", designToSvg(plain, fonts).includes('scale(1 -1)'));
  assert("a hand-made 3MF with one piece is written too (the writer works on any pieces)", clickerTo3mf([{ name: "A", color: "#ff0000", mesh: meshOfPart(extrudeLayout(buildLayout(plain, fonts))[0]) }], "T").length > 500);

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
    const good1 = plain, good2 = clickerSpecSchema.parse({ ...plain, shape: "star", width: 50, height: 50, layers: [textLayer({ text: "Ana", color: RED })] });
    const added = await addManyToCart(user, { productId: p.id, rows: [row(good1, 2), row(good2)] });
    assert("two different designs become two cart lines", added.ok && added.added === 2, JSON.stringify(added));
    const lines = await getCartLines(user);
    const l1 = lines.find((l) => l.qty === 2)!, l2 = lines.find((l) => l.qty === 1)!;
    assert("each line is priced by its own design (₱150 + 0, ₱150 + 30 size + 10 colour)", l1.unitPriceCents === 15000 && l2.unitPriceCents === 15000 + 3000 + 1000, `${l1?.unitPriceCents} ${l2?.unitPriceCents}`);
    assert("each line has its own picture and a readable summary", !!l1.designUri && !!l2.designUri && l1.designUri !== l2.designUri && l2.summary[0].value.includes("star") && l2.summary[0].value.includes("“Ana”"));
    const before = (await getCartLines(user)).length;
    const bad = await addManyToCart(user, { productId: p.id, rows: [row(good1), row({ ...good1, width: 95 }), row(good2)] });
    assert("one design outside the limits adds nothing at all, and says which", !bad.ok && /^Name 2:/.test(bad.error) && (await getCartLines(user)).length === before, JSON.stringify(bad));
    assert("a design with a letter the font lacks is refused", !(await addManyToCart(user, { productId: p.id, rows: [row({ ...good1, layers: [textLayer({ text: "日" })] })] })).ok);
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
