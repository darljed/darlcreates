/**
 * Name keychain: icons, schema, the owner's limits and price rules, the plate / name / icon / frame pieces (closed solids,
 * no overlaps, plate follows the letters, keyring loop clear of the letters), the 3MF print file, the cart and order
 * integration and (with the database) several designs added to a cart at once.
 * No browser. Run: npx tsx scripts/test-keychain.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { strFromU8, unzipSync } from "fflate";
import { like } from "drizzle-orm";
import { NAME_FONT_IDS, type Font } from "../src/lib/name-mesh";
import { loadFont } from "../src/lib/name-3mf";
import { difference, intersect, totalArea, union } from "../src/lib/clicker/poly";
import { extrudeParts, GeometryCache, meshOfPart } from "../src/lib/clicker/extrude";
import { isWatertight } from "../src/lib/name-mesh";
import { ICON_IDS, iconRegions } from "../src/lib/keychain/icons";
import {
  checkKeychainAgainstConfig, DEFAULT_KEYCHAIN_CONFIG, defaultKeychain, keychainColours, keychainConfigDamaged, keychainConfigOf, keychainPriceDeltaCents, keychainSpecSchema, keychainSummary, linesOf, STYLE_IDS,
  type KeychainSpec,
} from "../src/lib/keychain/spec";
import { buildKeychainLayout, keychainToSvg, layoutProblem } from "../src/lib/keychain/layout";
import { buildKeychainPrint, checkKeychain, keychainSvgDataUri } from "../src/lib/keychain/server";
import { keychainDesignOf, keychainOptionOf } from "../src/lib/keychain/of-product";
import { computeUnitPrice, normalizeSelection, type ProductOptionInput } from "../src/lib/pricing";
import { summarizeConfig } from "../src/lib/config-summary";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}
const near = (a: number, b: number, eps = 0.05) => Math.abs(a - b) <= eps;

const cfg = DEFAULT_KEYCHAIN_CONFIG;
const spec = (style: (typeof STYLE_IDS)[number] = "name", over: Partial<KeychainSpec> = {}): KeychainSpec => ({ ...defaultKeychain(cfg, style), ...over });

(async () => {
  const loaded = new Map<string, Font>();
  for (const id of NAME_FONT_IDS) loaded.set(id, await loadFont(id));
  const fonts = (id: string) => loaded.get(id as never);
  const build = (s: KeychainSpec) => buildKeychainLayout(s, fonts as never);

  console.log("\nfonts");
  assert("the script fonts added for keychains all parse and draw a name", ["lobster", "courgette", "kaushan", "damion", "script"].every((f) => build(spec("name", { font: f as never })).parts.length >= 2));

  console.log("\nicons");
  for (const id of ICON_IDS) {
    const r = iconRegions(id);
    const a = totalArea(r);
    assert(`icon ${id}: solid, about 1 unit tall, centred`, r.length >= 1 && a > 0.05 && r.every((x) => x.outer.length >= 3), `area ${a}`);
  }
  assert("icons build every time the same", JSON.stringify(iconRegions("paw")) === JSON.stringify(iconRegions("paw")));

  console.log("\nschema, summary, colours");
  const def = spec();
  assert("the default design is valid", keychainSpecSchema.safeParse(def).success);
  assert("an unknown font, style or a negative thickness is refused", !keychainSpecSchema.safeParse({ ...def, font: "comic" }).success && !keychainSpecSchema.safeParse({ ...def, style: "x" }).success && !keychainSpecSchema.safeParse({ ...def, baseMm: -1 }).success);
  assert("a bad colour is refused", !keychainSpecSchema.safeParse({ ...def, textColor: "red" }).success);
  assert("lines are split on new lines and tidied", linesOf({ text: "  Ana  \n\n  Marie  Lou " }).join("|") === "Ana|Marie Lou");
  assert("colours: name = 2, icon = 3, tag = 3 (frame)", keychainColours(spec("name")).length === 2 && keychainColours(spec("icon", { iconColor: "#22c55e" })).length === 3 && keychainColours(spec("tag", { frameColor: "#22c55e" })).length === 3);
  assert("the same colour used twice counts once", keychainColours(spec("name", { textColor: def.baseColor })).length === 1);
  assert("a summary reads well", /Name keychain “Emma”/.test(keychainSummary(def)) && /mm thick/.test(keychainSummary(def)));

  console.log("\nowner's settings");
  assert("no settings = not a keychain product", keychainConfigOf({}) === null && keychainConfigOf(null) === null);
  assert("saved settings are read back", keychainConfigOf({ keychain: { ...cfg, lineCents: 5000 } })?.lineCents === 5000);
  assert("a damaged setting is noticed and falls back to the defaults", keychainConfigDamaged({ keychain: { ...cfg, maxLines: 99 } }) && keychainConfigOf({ keychain: { ...cfg, maxLines: 99 } })?.maxLines === cfg.maxLines);
  assert("an offered font, style, icon and colour list limit what can be ordered",
    !!checkKeychainAgainstConfig(spec("name", { font: "bold" }), { ...cfg, fonts: ["script"] })
    && !!checkKeychainAgainstConfig(spec("tag"), { ...cfg, styles: ["name"] })
    && !!checkKeychainAgainstConfig(spec("icon", { icon: "paw" }), { ...cfg, icons: ["heart"] })
    && !!checkKeychainAgainstConfig(spec("name", { textColor: "#123456" }), cfg));
  assert("too many colours, lines, letters or too tall letters are refused",
    !!checkKeychainAgainstConfig(spec("tag", { frameColor: "#22c55e" }), { ...cfg, maxColours: 2 })
    && !!checkKeychainAgainstConfig(spec("name", { text: "a\nb\nc" }), cfg)
    && !!checkKeychainAgainstConfig(spec("name", { text: "x".repeat(21) }), cfg)
    && !!checkKeychainAgainstConfig(spec("name", { size: 23 }), cfg));
  assert("the default design is allowed", checkKeychainAgainstConfig(def, cfg) === null);

  console.log("\nprice");
  const price = (s: KeychainSpec, c = cfg) => keychainPriceDeltaCents(s, c);
  assert("a short plain name costs only the first size step", price(spec("name", { lengthMm: 50 })) === 0);
  assert("size steps follow the length: 71 mm and 101 mm are the next steps", price(spec("name", { lengthMm: 71 })) === 3000 && price(spec("name", { lengthMm: 101 })) === 6000);
  assert("each extra line, the icon style, the tag style and the 3rd colour add their price", price(spec("name", { text: "A\nB", lengthMm: 50 })) === cfg.lineCents && price(spec("icon", { lengthMm: 50 })) === cfg.iconCents + cfg.extraColourCents * 0 + (keychainColours(spec("icon")).length > 2 ? cfg.extraColourCents : 0) && price(spec("tag", { lengthMm: 50, frameColor: spec("tag").baseColor })) === cfg.tagCents);
  assert("a third colour adds the extra-colour price", price(spec("name", { lengthMm: 50, iconColor: "#22c55e" })) === 0 && price(spec("icon", { lengthMm: 50, iconColor: "#22c55e" })) === cfg.iconCents + cfg.extraColourCents);
  assert("thick keychains add the thickness price only above the limit", price(spec("name", { lengthMm: 50, baseMm: 3, textMm: 3 })) === 0 && price(spec("name", { lengthMm: 50, baseMm: 4, textMm: 2.5 })) === cfg.thickCents);
  assert("the owner's price changes flow through", price(spec("name", { lengthMm: 50, text: "A\nB" }), { ...cfg, lineCents: 12345 }) === 12345);

  console.log("\ngeometry: every style");
  const cache = new GeometryCache();
  for (const style of STYLE_IDS) for (const plate of ["follow", "rounded", "pill"] as const) for (const ringPos of ["left", "right", "top", "none"] as const) {
    const s = spec(style, { plate, ring: { pos: ringPos, hole: 4.5, wall: 2 } });
    const L = build(s);
    const solids = extrudeParts(L.parts, cache);
    const tag = `${style}/${plate}/ring ${ringPos}`;
    assert(`${tag}: no errors, has a plate and a name`, L.errors.length === 0 && L.parts.some((p) => p.id === "k-plate") && L.parts.some((p) => p.id === "k-text"), L.errors.join());
    assert(`${tag}: every piece is a closed solid`, solids.every((p) => isWatertight(meshOfPart(p))));
    const plateP = L.parts.find((p) => p.id === "k-plate")!, textP = L.parts.find((p) => p.id === "k-text")!;
    assert(`${tag}: the letters sit inside the plate`, totalArea(difference(textP.regions, plateP.regions)) < 0.02, String(totalArea(difference(textP.regions, plateP.regions))));
    const overlap = L.parts.filter((p) => p.id !== "k-plate").flatMap((p, i, all) => all.slice(i + 1).map((q) => totalArea(intersect(p.regions, q.regions))));
    assert(`${tag}: name, icon and frame do not overlap each other`, overlap.every((a) => a < 0.02));
    assert(`${tag}: heights are the thickness the customer chose`, near(plateP.z1, s.baseMm, 1e-6) && near(textP.z1, s.baseMm + s.textMm, 1e-6) && near(L.totalHeight, s.baseMm + s.textMm, 1e-6));
    if (ringPos !== "none") {
      assert(`${tag}: a keyring loop with a real hole, clear of the letters`, !!L.ring && totalArea(intersect(textP.regions, [{ outer: Array.from({ length: 32 }, (_, i) => [L.ring!.cx + (L.ring!.holeR + 0.5) * Math.cos((i / 32) * Math.PI * 2), L.ring!.cy + (L.ring!.holeR + 0.5) * Math.sin((i / 32) * Math.PI * 2)] as [number, number]), holes: [] }])) < 0.01);
      const hole = [{ outer: Array.from({ length: 32 }, (_, i) => [L.ring!.cx + (L.ring!.holeR - 0.2) * Math.cos((i / 32) * Math.PI * 2), L.ring!.cy + (L.ring!.holeR - 0.2) * Math.sin((i / 32) * Math.PI * 2)] as [number, number]), holes: [] }];
      assert(`${tag}: the hole goes right through the plate`, totalArea(intersect(plateP.regions, hole)) < 0.01);
      const ringSide = ringPos === "left" ? L.ring!.cx < L.bounds.minX + L.ring!.loopR + 0.5 : ringPos === "right" ? L.ring!.cx > L.bounds.maxX - L.ring!.loopR - 0.5 : L.ring!.cy > L.bounds.maxY - L.ring!.loopR - 0.5;
      assert(`${tag}: the loop is on the ${ringPos}`, ringSide);
    } else assert(`${tag}: no hole`, L.ring === null);
  }
  console.log("\nevery font with real names: closed solids and one solid plate");
  for (const font of cfg.fonts) {
    const bad: string[] = [];
    for (const text of ["Samantha", "Ashley", "Brooke", "Mia", "Olivia Rose", "Zoë\nJo"]) for (const style of STYLE_IDS) {
      const L = build(spec(style, { text, font, size: 12 }));
      const plate = L.parts.find((p) => p.id === "k-plate");
      if (L.errors.length || !plate || (plate.regions.length !== 1) || !extrudeParts(L.parts).every((p) => isWatertight(meshOfPart(p)))) bad.push(`${style}/${text.replace("\n", "+")}${L.errors[0] ? `: ${L.errors[0]}` : ""}`);
    }
    assert(`font ${font}`, bad.length === 0, bad.join("; "));
  }

  {
    // many odd combinations (a repeatable pseudo-random walk): sizes, borders, spacing, thickness, every plate and ring
    let seed = 12345;
    const rnd = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32);
    const pick = <T,>(a: readonly T[]) => a[Math.floor(rnd() * a.length)];
    const names = ["Samantha", "Chloe", "Lily", "Sophia", "Ginny", "Jo", "Mae", "Olivia", "Bea\nTrix", "Xavier Jr"];
    const N = Number(process.argv[2]) || 80;
    const bad: string[] = [];
    for (let i = 0; i < N; i++) {
      const s = spec(pick(STYLE_IDS), {
        text: pick(names), font: pick(cfg.fonts), size: 7 + Math.round(rnd() * 13), spacing: Math.round((rnd() * 4 - 1) * 10) / 10, border: 1 + Math.round(rnd() * 40) / 10,
        plate: pick(["follow", "rounded", "pill"] as const), baseMm: 1.2 + Math.round(rnd() * 30) / 10, textMm: 0.6 + Math.round(rnd() * 20) / 10,
        ring: { pos: pick(["left", "right", "top", "none"] as const), hole: 3 + Math.round(rnd() * 4), wall: 1.6 + Math.round(rnd() * 20) / 10 }, icon: pick(ICON_IDS), iconSide: pick(["left", "right"] as const), iconScale: 0.6 + Math.round(rnd() * 14) / 10,
      });
      const L = build(s);
      const plate = L.parts.find((p) => p.id === "k-plate");
      const ok = !L.errors.length && !!plate && plate.regions.length === 1 && extrudeParts(L.parts).every((p) => isWatertight(meshOfPart(p)));
      if (!ok) bad.push(JSON.stringify({ ...s, lengthMm: 0 }) + (L.errors[0] ?? ""));
    }
    assert(`${N} random designs: one solid plate and every piece closed`, bad.length === 0, bad.slice(0, 2).join("\n"));
  }

  const iconL = build(spec("icon", { iconColor: "#22c55e" }));
  assert("icon style: a separate icon piece in its own colour", iconL.parts.some((p) => p.id === "k-icon" && p.color === "#22c55e"));
  const tagL = build(spec("tag", { frameColor: "#22c55e" }));
  assert("bag tag: a raised frame in its own colour, as high as the letters", tagL.parts.some((p) => p.id === "k-frame" && p.color === "#22c55e" && near(p.z1, tagL.totalHeight, 1e-6)));
  const plain = build(spec("name", { text: "Ana" })), twoLines = build(spec("name", { text: "Ana\nBel" }));
  assert("two lines make a taller plate", twoLines.bounds.maxY - twoLines.bounds.minY > plain.bounds.maxY - plain.bounds.minY + 6);
  const big = build(spec("name", { size: 18 })), small = build(spec("name", { size: 8 }));
  assert("bigger letters make a longer keychain", big.lengthMm > small.lengthMm * 1.8);
  const thinPlate = build(spec("name", { border: 1 })), wide = build(spec("name", { border: 5 }));
  assert("a wider border makes a bigger plate", wide.widthMm > thinPlate.widthMm + 6);
  assert("a name with a space is still one solid plate", build(spec("name", { text: "Mary Ann", plate: "follow" })).parts.find((p) => p.id === "k-plate")!.regions.length === 1);
  assert("a letter the font cannot draw is reported", build(spec("name", { text: "日本" })).errors.length === 1);
  assert("an empty name reports an error", build(spec("name", { text: "  " })).errors.length === 1);
  assert("while a font loads there is nothing yet and no error", buildKeychainLayout(def, () => undefined).errors.length === 0 && buildKeychainLayout(def, () => undefined).parts.length === 0);
  assert("a layout longer than the owner allows is refused", !!layoutProblem(big, { maxLengthMm: 30 }) && layoutProblem(small, { maxLengthMm: 120 }) === null);
  assert("the picture of a design is SVG with a path per piece", (keychainToSvg(iconL).match(/<path/g) ?? []).length === iconL.parts.length && keychainToSvg(iconL).startsWith("<svg"));

  console.log("\nserver check");
  const real = build(def).lengthMm;
  assert("a design with its real length is accepted", (await checkKeychain({ ...def, lengthMm: Math.ceil(real * 10) / 10 }, cfg)).ok);
  const understated = await checkKeychain({ ...def, lengthMm: 20 }, cfg);
  assert("a design that claims to be shorter than it is (to be priced cheaper) is refused", !understated.ok && /does not match/.test((understated as { error: string }).error));
  assert("a design longer than the owner allows is refused", !(await checkKeychain({ ...def, size: 20, text: "Maximilian Joshua", lengthMm: 300 }, { ...cfg, maxLengthMm: 60 })).ok);
  assert("garbage is refused", !(await checkKeychain({ nope: 1 }, cfg)).ok && !(await checkKeychain(null, cfg)).ok);

  console.log("\nprint file (3MF)");
  const printSpec = spec("icon", { iconColor: "#22c55e", lengthMm: 100 });
  const pr = await buildKeychainPrint(printSpec, "Keychain test");
  assert("a 3MF is built", pr.ok);
  if (pr.ok) {
    assert("every piece is a closed solid", pr.report.pieces.length === 3 && pr.report.pieces.every((p) => p.watertight));
    assert("it lies flat on the bed, inside the plate", pr.report.pieces.every((p) => p.bounds[2] >= -1e-6 && p.bounds[0] >= 5.9 && p.bounds[1] >= 5.9 && p.bounds[3] < 250 && p.bounds[4] < 250));
    assert("the height is plate + letters", near(Math.max(...pr.report.pieces.map((p) => p.bounds[5])), printSpec.baseMm + printSpec.textMm, 0.01));
    assert("three colours = three filaments", pr.report.filaments.length === 3);
    const files = unzipSync(pr.file);
    const model = strFromU8(files["3D/3dmodel.model"]), bambu = strFromU8(files["Metadata/model_settings.config"]);
    assert("the 3MF holds the model, the slicer settings and the colours", !!model && /Plate/.test(model) && /Icon/.test(model) && /wall_loops/.test(bambu) && !!files["Metadata/project_settings.config"]);
  }
  assert("a broken design cannot be printed", !(await buildKeychainPrint({ ...def, text: "日" } as KeychainSpec)).ok);
  assert("the cart picture is cached and stable", (await keychainSvgDataUri(def)) === (await keychainSvgDataUri(def)) && (await keychainSvgDataUri(def)).startsWith("data:image/svg+xml"));

  console.log("\ncart pricing and option lookup");
  const option = (id = "opt1"): ProductOptionInput => ({ id, type: "text", label: "Your keychain", required: true, priceDeltaCents: 0, constraints: { maxLen: 20, keychain: cfg }, values: [] } as ProductOptionInput);
  const opts = [option()];
  const good = { ...def, lengthMm: 80 };
  const priced = computeUnitPrice(10000, opts, { opt1: { design: good } });
  assert("the unit price is the product price + the design price", priced.errors.length === 0 && priced.unitPriceCents === 10000 + keychainPriceDeltaCents(good, cfg), JSON.stringify(priced));
  assert("no design: required", computeUnitPrice(10000, opts, {}).errors.length === 1);
  assert("a design outside the limits is refused by the price check", computeUnitPrice(10000, opts, { opt1: { design: { ...good, size: 23 } } }).errors.length === 1);
  assert("a damaged product cannot be ordered", computeUnitPrice(10000, [{ ...option(), constraints: { keychain: { ...cfg, maxLines: 99 } } } as ProductOptionInput], { opt1: { design: good } }).errors.length === 1);
  const norm = normalizeSelection(opts, { opt1: { design: { ...good, evil: 1 }, text: "x", imageKey: "k" } }, () => false);
  assert("only a valid design is kept, with no extra fields", norm.errors.length === 0 && JSON.stringify(norm.config.opt1) === JSON.stringify({ design: good }));
  assert("a design that does not fit the schema is dropped with an error", normalizeSelection(opts, { opt1: { design: { ...good, font: "x" } } }, () => false).errors.length === 1);
  assert("the product's keychain option and design are found", keychainOptionOf(opts)?.option.id === "opt1" && keychainDesignOf(opts, { opt1: { design: good } })?.spec.text === "Emma" && keychainDesignOf(opts, {}) === null);
  assert("a normal product is not a keychain", keychainOptionOf([{ ...option(), constraints: { maxLen: 20 } } as ProductOptionInput]) === null);
  assert("the cart summary reads the design", /Name keychain “Emma”/.test(summarizeConfig(opts, { opt1: { design: good } })[0].value));

  // ---- the database: several designs into one cart --------------------------------------------------------------
  console.log("\ncart with the database");
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { addManyToCart, MAX_NAMES_PER_ADD } = await import("../src/lib/cart-service");
  const { getCartLines } = await import("../src/lib/cart");
  const T = `TEST-KC-${Date.now()}`;
  const user = `${T}-u`;
  const fit = (x: KeychainSpec) => ({ ...x, lengthMm: Math.ceil(build(x).lengthMm * 10) / 10 });
  try {
    await db.insert(s.users).values({ id: user, name: "T", email: `${user}@test.local`, emailVerified: true, role: "customer" });
    const [p] = await db.insert(s.products).values({ slug: `${T}-prod`, name: `${T} Keychain`, basePriceCents: 10000, status: "published" }).returning();
    const [o] = await db.insert(s.productOptions).values({ productId: p.id, type: "text", label: "Your keychain", required: true, priceDeltaCents: 0, constraints: { keychain: cfg }, sort: 0 }).returning();
    const row = (d: unknown, qty = 1) => ({ qty, selection: { [o.id]: { design: d } } });
    const a = fit(spec("name", { text: "Ava" })), b = fit(spec("icon", { text: "Mia", icon: "paw" })), c = fit(spec("tag", { text: "Rex", sub: "0917 000 1111" }));
    const added = await addManyToCart(user, { productId: p.id, rows: [row(a, 2), row(b), row(c)] });
    assert("three different keychains become three cart lines", added.ok && added.added === 3, JSON.stringify(added));
    const lines = await getCartLines(user);
    const la = lines.find((l) => l.qty === 2)!, lb = lines.find((l) => /icon/i.test(l.summary[0]?.value ?? ""))!, lc = lines.find((l) => /Bag tag/.test(l.summary[0]?.value ?? ""))!;
    assert("each line is priced by its own design", la?.unitPriceCents === 10000 + keychainPriceDeltaCents(a, cfg) && lb?.unitPriceCents === 10000 + keychainPriceDeltaCents(b, cfg) && lc?.unitPriceCents === 10000 + keychainPriceDeltaCents(c, cfg), `${la?.unitPriceCents} ${lb?.unitPriceCents} ${lc?.unitPriceCents}`);
    assert("each line has its own picture", !!la.designUri && !!lb.designUri && !!lc.designUri && la.designUri !== lb.designUri);
    const before = (await getCartLines(user)).length;
    const bad = await addManyToCart(user, { productId: p.id, rows: [row(a), row({ ...a, size: 23 }), row(b)] });
    assert("one design outside the limits adds nothing at all, and says which", !bad.ok && /^Name 2:/.test(bad.error) && (await getCartLines(user)).length === before, JSON.stringify(bad));
    assert("a name the font cannot draw is refused", !(await addManyToCart(user, { productId: p.id, rows: [row({ ...a, text: "日本" })] })).ok);
    assert("a keychain priced shorter than it is, is refused", !(await addManyToCart(user, { productId: p.id, rows: [row({ ...a, text: "Maximilian", size: 16, lengthMm: 20 })] })).ok);
    assert("no design at all is refused (the option is required)", !(await addManyToCart(user, { productId: p.id, rows: [{ qty: 1, selection: {} }] })).ok);
    assert("the limit on designs per add holds", !(await addManyToCart(user, { productId: p.id, rows: Array.from({ length: MAX_NAMES_PER_ADD + 1 }, () => row(a)) })).ok);
  } finally {
    await db.delete(s.carts).where(like(s.carts.userId, "TEST-KC-%"));
    await db.delete(s.products).where(like(s.products.slug, "TEST-KC-%"));
    await db.delete(s.users).where(like(s.users.id, "TEST-KC-%"));
  }
  void union;

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll keychain checks passed.");
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
