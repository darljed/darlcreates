/**
 * The shop's colour inventory: the schema, the filter (colour options, clicker palette, name colours), and the real
 * product reads and pricing against the live DB (isolated TEST- data; the owner's saved inventory is put back at the end).
 * Run: npx tsx scripts/test-colour-inventory.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, like } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

async function main() {
  const inv = await import("../src/lib/colour-inventory-schema");
  const { defaultSpec, DEFAULT_CLICKER_CONFIG } = await import("../src/lib/clicker/spec");
  const { computeUnitPrice } = await import("../src/lib/pricing");

  console.log("\nschema");
  const ok = inv.parseInventory({ colours: [{ name: " Red ", hex: "#FF0000" }, { name: "Blue", hex: "#0000ff" }] });
  assert("a good list parses, names trimmed, hex lower-cased", ok?.colours[0].hex === "#ff0000" && ok.colours[0].name === "Red");
  assert("nothing saved = null (nothing is filtered)", inv.parseInventory(undefined) === null && inv.inStock(null, "#123456"));
  assert("fewer than two colours is refused", inv.parseInventory({ colours: [{ name: "A", hex: "#000000" }] }) === null);
  assert("the same colour twice is refused (any case)", inv.parseInventory({ colours: [{ name: "A", hex: "#ABCDEF" }, { name: "B", hex: "#abcdef" }] }) === null);
  assert("a bad hex or empty name is refused", inv.parseInventory({ colours: [{ name: "A", hex: "red" }, { name: "B", hex: "#000000" }] }) === null && inv.parseInventory({ colours: [{ name: " ", hex: "#111111" }, { name: "B", hex: "#000000" }] }) === null);
  assert("more than 24 colours is refused", inv.parseInventory({ colours: Array.from({ length: 25 }, (_, i) => ({ name: `c${i}`, hex: `#${(i + 16).toString(16).padStart(2, "0")}0000` })) }) === null);
  assert("the editor's starting list is itself valid", inv.parseInventory(inv.DEFAULT_INVENTORY) !== null);

  console.log("\nthe filter");
  const stock = inv.parseInventory({ colours: [{ name: "Red", hex: "#ff0000" }, { name: "Blue", hex: "#0000ff" }, { name: "White", hex: "#ffffff" }] })!;
  const options = [
    { id: "c", type: "color" as const, label: "Colour", required: true, priceDeltaCents: 0, constraints: {}, values: [
      { id: "1", label: "Red", value: "#FF0000", priceDeltaCents: 0 }, { id: "2", label: "Pink", value: "#ff2d78", priceDeltaCents: 0 },
    ] },
    { id: "k", type: "text" as const, label: "Your clicker", required: true, priceDeltaCents: 0, constraints: { clicker: { maxColours: 8, palette: ["#123456", "#654321"] } }, values: [] },
    { id: "n", type: "text" as const, label: "Name", required: true, priceDeltaCents: 0, constraints: { slot: { nameColors: [{ label: "Blue", hex: "#0000FF" }, { label: "Lime", hex: "#bef264" }] } }, values: [] },
    { id: "s", type: "size" as const, label: "Size", required: false, priceDeltaCents: 0, constraints: {}, values: [{ id: "3", label: "L", value: "L", priceDeltaCents: 0 }] },
  ];
  assert("no inventory: the options come back untouched", inv.applyInventory(options, null) === options);
  const f = inv.applyInventory(options, stock);
  assert("colour options keep only colours in stock (case-insensitive)", f[0].values.length === 1 && f[0].values[0].label === "Red");
  assert("size options are not touched", f[3] === options[3]);
  const clicker = f[1].constraints.clicker as { palette: string[]; maxColours: number };
  assert("the clicker palette IS the inventory", JSON.stringify(clicker.palette) === JSON.stringify(["#ff0000", "#0000ff", "#ffffff"]));
  assert("a clicker cannot ask for more colours per print than there are colours", clicker.maxColours === 3);
  assert("name colours keep only colours in stock", ((f[2].constraints.slot as { nameColors: { label: string }[] }).nameColors).map((n) => n.label).join() === "Blue");
  assert("the originals are not changed", options[0].values.length === 2 && (options[1].constraints.clicker as { palette: string[] }).palette.length === 2);

  console.log("\nreal reads and pricing");
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { getProductsByIds } = await import("../src/lib/catalog");
  const { loadColourInventory, saveColourInventory, resetContent, COLOURS_KEY } = await import("../src/lib/site-content-store");
  const T = `TEST-INV-${Date.now()}`;
  const before = await loadColourInventory(); // the owner's real inventory (maybe none): put back at the end
  try {
    const [p] = await db.insert(s.products).values({ slug: `${T}-prod`, name: `${T} Thing`, basePriceCents: 10000, status: "published" }).returning();
    const [col] = await db.insert(s.productOptions).values({ productId: p.id, type: "color", label: "Colour", required: true, priceDeltaCents: 0, constraints: {}, sort: 0 }).returning();
    const [red, pink] = await db.insert(s.productOptionValues).values([
      { optionId: col.id, label: "Red", value: "#FF0000", sort: 0 }, { optionId: col.id, label: "Pink", value: "#ff2d78", sort: 1 },
    ]).returning();
    const [q] = await db.insert(s.products).values({ slug: `${T}-click`, name: `${T} Clicker`, basePriceCents: 15000, status: "published" }).returning();
    const [ck] = await db.insert(s.productOptions).values({ productId: q.id, type: "text", label: "Your clicker", required: true, priceDeltaCents: 0, constraints: { maxLen: 20, clicker: { ...DEFAULT_CLICKER_CONFIG, palette: ["#123456", "#654321", "#abcdef"] } }, sort: 0 }).returning();

    await resetContent(COLOURS_KEY);
    const free = await getProductsByIds([p.id, q.id]);
    assert("nothing saved: every colour is offered", free.get(p.id)!.options[0].values.length === 2);

    await saveColourInventory({ colours: [{ name: "Red", hex: "#ff0000" }, { name: "Black", hex: "#111111" }, { name: "White", hex: "#ffffff" }] }, null);
    const got = await getProductsByIds([p.id, q.id]);
    assert("customers see only the colours in stock", got.get(p.id)!.options[0].values.map((v) => v.label).join() === "Red");
    const raw = await getProductsByIds([p.id], { raw: true });
    assert("admin (raw) still sees everything", raw.get(p.id)!.options[0].values.length === 2);

    const opts = got.get(p.id)!.options;
    assert("choosing a colour in stock prices fine", computeUnitPrice(10000, opts, { [col.id]: { valueId: red.id } }).errors.length === 0);
    const bad = computeUnitPrice(10000, opts, { [col.id]: { valueId: pink.id } });
    assert("a colour that is not in stock is refused on the server", bad.errors.length === 1 && /no longer be in stock/.test(bad.errors[0]), JSON.stringify(bad.errors));

    const copts = got.get(q.id)!.options;
    const cfg = (copts[0].constraints.clicker as { palette: string[] }).palette;
    assert("the clicker product's own palette is replaced by the inventory", cfg.join() === "#ff0000,#111111,#ffffff");
    const good = defaultSpec({ ...DEFAULT_CLICKER_CONFIG, palette: cfg });
    assert("a design in stock colours is accepted", computeUnitPrice(15000, copts, { [ck.id]: { design: good } }).errors.length === 0);
    const stray = computeUnitPrice(15000, copts, { [ck.id]: { design: { ...good, baseColor: "#ff2d78" } } });
    assert("a design with a colour that is not in stock is refused", stray.errors.length === 1 && /not available/.test(stray.errors[0]), JSON.stringify(stray.errors));

    await saveColourInventory({ colours: [{ name: "Red", hex: "#ff0000" }, { name: "Pink", hex: "#FF2D78" }] }, null);
    assert("adding a colour back brings its choice back (nothing was deleted)", (await getProductsByIds([p.id])).get(p.id)!.options[0].values.length === 2);
  } finally {
    // put the owner's inventory back exactly as it was, then remove the test products
    if (before) await saveColourInventory(before, null);
    else await resetContent(COLOURS_KEY);
    await db.delete(s.products).where(like(s.products.slug, `${T}%`));
    const left = await db.select({ id: s.products.id }).from(s.products).where(like(s.products.slug, `${T}%`));
    assert("test products cleaned up", left.length === 0);
    const after = await loadColourInventory();
    assert("the owner's inventory is as it was", JSON.stringify(after) === JSON.stringify(before));
  }
  void eq;

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll colour inventory checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
