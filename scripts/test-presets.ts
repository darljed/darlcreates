/**
 * Design presets and product tags: the pure rules (resolving a preset against the product's colours, which mode customers
 * get, matching a selection to a preset, tag cleaning, shop search / filter by tag, the job sheet line), then the real
 * database and cart service: a presets-only product refuses hand-picked colours, "both" and "custom" accept them, presets
 * survive the options being rebuilt, and deleting a product removes its presets.
 * Isolated TEST-PRESET- data, cleaned up in finally. Run: npx tsx scripts/test-presets.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, like } from "drizzle-orm";

let failures = 0;
const assert = (n: string, c: boolean, extra = "") => { if (!c) { failures++; console.error(`  ✗ ${n} ${extra}`); } else console.log(`  ✓ ${n}`); };
const PREFIX = "TEST-PRESET-";

type Opt = import("../src/lib/pricing").ProductOptionInput;
const colourOpt = (id: string, label: string, partName: string | undefined, hexes: string[]): Opt => ({
  id, type: "color", label, required: true, priceDeltaCents: 0, constraints: partName ? { partName, defaultHex: hexes[0] } : {},
  values: hexes.map((h, i) => ({ id: `${id}-v${i}`, label: h, value: h, priceDeltaCents: 0 })),
});

(async () => {
  const P = await import("../src/lib/presets");
  const T = await import("../src/lib/tags");
  const F = await import("../src/lib/product-filter");
  const { buildJobSheet, sheetText } = await import("../src/lib/job-sheet");

  console.log("resolving a preset");
  const body = colourOpt("o1", "Body colour", "dc-slot-0", ["#ff0000", "#00ff00", "#0000ff"]);
  const lid = colourOpt("o2", "Lid colour", "dc-slot-1", ["#ffffff", "#000000"]);
  const options = [body, lid];
  const row = (name: string, a: string, b: string, over: Partial<import("../src/lib/presets").PresetRow> = {}) => ({
    id: `p-${name}`, name, active: true, sort: 0,
    colours: [{ key: "dc-slot-0", label: "Body colour", hex: a }, { key: "dc-slot-1", label: "Lid colour", hex: b }], ...over,
  });
  const ocean = P.resolvePreset(options, row("Ocean", "#0000FF", "#ffffff"));
  assert("every colour option gets the matching value (hex compared without case)", ocean.available && ocean.selection.o1?.valueId === "o1-v2" && ocean.selection.o2?.valueId === "o2-v0", JSON.stringify(ocean));
  assert("one swatch per part, in option order", ocean.swatches.map((s) => s.hex).join() === "#0000ff,#ffffff");
  const gone = P.resolvePreset([body, colourOpt("o2", "Lid colour", "dc-slot-1", ["#000000"])], row("Ocean", "#0000ff", "#ffffff"));
  assert("a colour that is no longer offered makes the preset unavailable, and says which part", !gone.available && gone.missing.join() === "Lid colour");
  assert("a part the preset does not cover makes it unavailable", !P.resolvePreset([...options, colourOpt("o3", "Ring", "dc-slot-2", ["#ffffff"])], row("Ocean", "#0000ff", "#ffffff")).available);
  assert("a hidden preset is unavailable", !P.resolvePreset(options, row("Ocean", "#0000ff", "#ffffff", { active: false })).available);
  assert("a product with no colour options has no usable preset", !P.resolvePreset([], row("Ocean", "#0000ff", "#ffffff")).available);
  const rebuilt = [colourOpt("n9", "Colour 1", "dc-slot-0", ["#0000ff", "#ff0000"]), colourOpt("n8", "Colour 2", "dc-slot-1", ["#ffffff"])];
  const again = P.resolvePreset(rebuilt, row("Ocean", "#0000ff", "#ffffff"));
  assert("a preset survives the options being rebuilt (new ids, same parts)", again.available && again.selection.n9?.valueId === "n9-v0" && again.selection.n8?.valueId === "n8-v0");
  const plain = colourOpt("c1", "Colors", undefined, ["#ff0000", "#00ff00"]);
  assert("a plain colour option is keyed by its label", P.optionKey(plain) === "label:Colors" && P.resolvePreset([plain], { id: "x", name: "Red", active: true, sort: 0, colours: [{ key: "label:Colors", label: "Colors", hex: "#ff0000" }] }).available);

  console.log("what customers get");
  const sunset = P.resolvePreset(options, row("Sunset", "#ff0000", "#000000"));
  const list = P.resolvePresets(options, [row("Sunset", "#ff0000", "#000000", { sort: 2 }), row("Ocean", "#0000ff", "#ffffff", { sort: 1 })]);
  assert("designs are listed in the owner's order", list.map((p) => p.name).join() === "Ocean,Sunset");
  assert("custom stays custom", P.effectiveMode("custom", list) === "custom");
  assert("presets and both are kept when a design can be shown", P.effectiveMode("presets", list) === "presets" && P.effectiveMode("both", list) === "both");
  assert("no usable design: the customer is never locked out (falls back to custom)", P.effectiveMode("presets", [gone]) === "custom" && P.effectiveMode("both", []) === "custom");
  assert("an unknown mode is custom", P.effectiveMode("nonsense", list) === "custom");
  const pickedOcean = { o1: { valueId: "o1-v2" }, o2: { valueId: "o2-v0" } };
  const mixed = { o1: { valueId: "o1-v2" }, o2: { valueId: "o2-v1" } };
  assert("a selection equal to a design is matched to it", P.matchPreset(list, pickedOcean)?.name === "Ocean");
  assert("changing one colour is no longer that design", P.matchPreset(list, mixed) === null);
  assert("a hidden design is never matched", P.matchPreset([{ ...ocean, available: false }], pickedOcean) === null);
  assert("presets-only refuses hand-picked colours", P.presetProblem("presets", list, mixed) === "Choose one of the ready-made designs.");
  assert("presets-only accepts a design", P.presetProblem("presets", list, pickedOcean) === null);
  assert("both and custom never refuse colours", P.presetProblem("both", list, mixed) === null && P.presetProblem("custom", list, mixed) === null);
  assert("presets-only with nothing usable does not refuse (falls back to custom)", P.presetProblem("presets", [gone], mixed) === null);
  assert("admin choices become stored colours (hex lower-cased, key from the part)", JSON.stringify(P.coloursFromChoices(options, { o1: "o1-v0", o2: "o2-v1" })) === JSON.stringify([{ key: "dc-slot-0", label: "Body colour", hex: "#ff0000" }, { key: "dc-slot-1", label: "Lid colour", hex: "#000000" }]));
  assert("a colour from another option, or a missing part, is refused", P.coloursFromChoices(options, { o1: "o2-v0", o2: "o2-v1" }) === null && P.coloursFromChoices(options, { o1: "o1-v0" }) === null);
  assert("the sunset preset resolves too", sunset.available);

  console.log("job sheet");
  const sheet = buildJobSheet({ options, config: pickedOcean, modelKey: "models/x.3mf", preset: "Ocean" });
  assert("the sheet names the design", sheet.preset === "Ocean" && sheetText("Cup", 1, sheet).includes("Design preset: Ocean"));
  assert("no design, no line (older sheets and hand-picked colours)", buildJobSheet({ options, config: mixed, modelKey: null }).preset === null && !sheetText("Cup", 1, buildJobSheet({ options, config: mixed, modelKey: null })).includes("Design preset"));

  console.log("tags");
  assert("lower-case, no #, single spaces", T.cleanTag("  #Name   Keychain ") === "name keychain");
  assert("symbols are dropped, letters and hyphens kept", T.cleanTag("gift!! & <b>ideas</b>") === "gift b ideas b" && T.cleanTag("eco-friendly") === "eco-friendly");
  assert("long tags are cut at 30", T.cleanTag("x".repeat(50)).length === 30);
  assert("a comma string is split, empties and repeats dropped", T.normalizeTags("Gift, desk,, GIFT ,  ,Desk").join() === "gift,desk");
  assert("at most 8 tags, in the order given", T.normalizeTags(Array.from({ length: 12 }, (_, i) => `t${i}`)).join() === "t0,t1,t2,t3,t4,t5,t6,t7");
  assert("nothing is nothing", T.normalizeTags(undefined).length === 0 && T.normalizeTags("").length === 0);
  const shop = [
    { name: "Cable Holder", description: "Keeps cables tidy", category: "desk", tags: ["gift", "office"] },
    { name: "Name Keychain", description: "Your name", category: "keychains", tags: ["gift"] },
    { name: "Plain Box", description: "A box", category: "desk", tags: [] },
    { name: "Old Item", description: "No tags field", category: "desk" },
  ];
  assert("the search finds a product by its tag", F.filterProducts(shop, "office", null).map((p) => p.name).join() === "Cable Holder");
  assert("the tag filter keeps only tagged products", F.filterProducts(shop, "", null, "gift").map((p) => p.name).join() === "Cable Holder,Name Keychain");
  assert("tag, category and search combine", F.filterProducts(shop, "cable", "desk", "gift").length === 1 && F.filterProducts(shop, "", "keychains", "office").length === 0);
  assert("tag counts are most common first", JSON.stringify(F.tagCounts(shop)) === JSON.stringify([{ tag: "gift", count: 2 }, { tag: "office", count: 1 }]));

  // ---- the real database and cart service
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { addToCart } = await import("../src/lib/cart-service");
  const { getProductById } = await import("../src/lib/catalog");
  const [u] = await db.select({ id: s.users.id }).from(s.users).limit(1);

  const [prod] = await db.insert(s.products).values({ slug: `${PREFIX}${Date.now()}`, name: `${PREFIX}Cup`, description: "A cup.", category: "test", tags: ["gift", "desk"], basePriceCents: 10000, status: "published", designMode: "presets" }).returning();
  try {
    console.log("database and cart");
    const mk = async (label: string, partName: string, hexes: string[], sort: number) => {
      const [o] = await db.insert(s.productOptions).values({ productId: prod.id, type: "color", label, required: true, constraints: { partName, defaultHex: hexes[0] }, sort }).returning();
      const vals = await db.insert(s.productOptionValues).values(hexes.map((h, i) => ({ optionId: o.id, label: h, value: h, sort: i }))).returning();
      return { o, vals };
    };
    const a = await mk("Body colour", "dc-slot-0", ["#ff0000", "#00ff00", "#0000ff"], 0);
    const b = await mk("Lid colour", "dc-slot-1", ["#ffffff", "#000000"], 1);
    const colours = (x: string, y: string) => [{ key: "dc-slot-0", label: "Body colour", hex: x }, { key: "dc-slot-1", label: "Lid colour", hex: y }];
    await db.insert(s.productPresets).values([
      { productId: prod.id, name: "Ocean", colours: colours("#0000ff", "#ffffff"), sort: 0 },
      { productId: prod.id, name: "Retired", colours: colours("#00ff00", "#000000"), sort: 1, active: false },
      { productId: prod.id, name: "Gone", colours: colours("#123456", "#000000"), sort: 2 },
    ]);
    const full = await getProductById(prod.id, { raw: true });
    assert("tags and mode come back with the product", full?.tags.join() === "gift,desk" && full?.designMode === "presets");
    assert("presets are resolved: only Ocean is available", full?.presets.map((p) => `${p.name}:${p.available}`).join() === "Ocean:true,Retired:false,Gone:false", JSON.stringify(full?.presets.map((p) => [p.name, p.available, p.missing])));
    const ocean2 = full!.presets[0];
    const oceanSel = ocean2.selection;
    const handPicked = { [a.o.id]: { valueId: a.vals[0].id }, [b.o.id]: { valueId: b.vals[1].id } };

    const add = (selection: Record<string, { valueId: string }>) => addToCart(u.id, { productId: prod.id, selection, qty: 1 });
    const okOcean = await add(oceanSel as never);
    assert("presets-only: a design is accepted", okOcean.ok, JSON.stringify(okOcean));
    const refused = await add(handPicked);
    assert("presets-only: hand-picked colours are refused by the server", !refused.ok && refused.error === "Choose one of the ready-made designs.", JSON.stringify(refused));
    const hiddenDesign = await add({ [a.o.id]: { valueId: a.vals[1].id }, [b.o.id]: { valueId: b.vals[1].id } });
    assert("presets-only: a hidden design's colours are refused too", !hiddenDesign.ok);

    await db.update(s.products).set({ designMode: "both" }).where(eq(s.products.id, prod.id));
    assert("both: hand-picked colours are accepted", (await add(handPicked)).ok);
    await db.update(s.products).set({ designMode: "custom" }).where(eq(s.products.id, prod.id));
    assert("custom: designs are ignored, any colours are accepted", (await add(handPicked)).ok);

    await db.update(s.products).set({ designMode: "presets" }).where(eq(s.products.id, prod.id));
    await db.update(s.productPresets).set({ active: false }).where(eq(s.productPresets.productId, prod.id));
    assert("presets-only with every design hidden falls back to custom (never blocks an order)", (await add(handPicked)).ok);

    // the owner rebuilds the options ("detect from 3MF"): new ids, same parts; the design still works
    await db.update(s.productPresets).set({ active: true }).where(eq(s.productPresets.productId, prod.id));
    await db.delete(s.productOptions).where(eq(s.productOptions.productId, prod.id));
    const a2 = await mk("Colour 1", "dc-slot-0", ["#0000ff", "#ff0000"], 0);
    const b2 = await mk("Colour 2", "dc-slot-1", ["#ffffff"], 1);
    const after = await getProductById(prod.id, { raw: true });
    const ocean3 = after?.presets.find((p) => p.name === "Ocean");
    assert("after the options are rebuilt the design still resolves to the new ids", ocean3?.available === true && ocean3.selection[a2.o.id]?.valueId === a2.vals[0].id && ocean3.selection[b2.o.id]?.valueId === b2.vals[0].id);
    assert("and a presets-only order with it is accepted", (await add(ocean3!.selection as never)).ok);

    const [{ n }] = (await db.select().from(s.productPresets).where(eq(s.productPresets.productId, prod.id))).map((_, __, all) => ({ n: all.length }));
    assert("three designs are stored for the product", n === 3);
  } finally {
    await db.delete(s.cartItems).where(eq(s.cartItems.productId, prod.id));
    await db.delete(s.products).where(eq(s.products.id, prod.id));
    await db.delete(s.products).where(like(s.products.name, `${PREFIX}%`));
  }
  const left = await db.select().from(s.productPresets).where(eq(s.productPresets.productId, prod.id));
  assert("deleting the product removed its designs", left.length === 0);

  if (failures) { console.error(`${failures} failed`); process.exit(1); }
  console.log("all passed");
  process.exit(0);
})();
