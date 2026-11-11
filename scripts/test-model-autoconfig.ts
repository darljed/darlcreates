/**
 * Upload auto-configuration against the live DB and S3 (isolated TEST- data, removed in finally): a Bambu-style 3MF with
 * an example text and three filaments becomes a name slot + a cleaned model + colour swatches; an STL changes nothing;
 * a product that already has options keeps them. Run: npx tsx scripts/test-model-autoconfig.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, like } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { withText } from "./fixtures/bambu-text-3mf";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const storage = await import("../src/lib/storage");
  const { autoConfigureModel } = await import("../src/lib/model-autoconfig");
  const { slotOf } = await import("../src/lib/name-mesh");
  const keys: string[] = [];

  async function newProduct(slug: string) {
    const [p] = await db.insert(s.products).values({ slug, name: slug, description: "t", category: "test", basePriceCents: 10000, status: "draft" }).returning();
    return p;
  }
  async function upload(buf: ArrayBuffer, name: string) {
    const key = storage.buildKey("model", name, "TEST-AUTOCFG");
    keys.push(key);
    const put = await fetch(await storage.presignUpload(key, "model/3mf", 60), { method: "PUT", headers: { "content-type": "model/3mf" }, body: new Uint8Array(buf) });
    if (!put.ok) throw new Error(`upload failed ${put.status}`);
    return key;
  }
  async function optionsOf(productId: string) {
    return db.select().from(s.productOptions).where(eq(s.productOptions.productId, productId));
  }

  try {
    console.log("\nBambu-style 3MF with an example text and three filaments, empty product");
    const p1 = await newProduct("test-autocfg-1");
    const key1 = await upload(withText("normal_part", "Cams", 12, { filaments: ["#F95D73", "#F7E6DE", "#FF0000"] }), "stand.3mf");
    await db.update(s.products).set({ stlKey: key1 }).where(eq(s.products.id, p1.id));
    const r1 = await autoConfigureModel(p1.id, key1);
    keys.push(r1.modelKey);
    assert("detected the example text", r1.detected?.text === "Cams" && r1.detected.mode === "raised" && r1.slotSaved);
    assert("a Name text option was created with the slot", r1.textOptionCreated);
    const opts1 = await optionsOf(p1.id);
    const nameOpt = opts1.find((o) => o.type === "text");
    const slot = slotOf(nameOpt?.constraints as { slot?: unknown });
    assert("the slot is valid, at the detected spot, with the sensible defaults for the text option", !!slot && Math.abs(slot.position[0] - 120) < 0.01 && slot.normal[0] > 0.99 && (nameOpt!.constraints as { maxLen?: number }).maxLen === 12 && nameOpt!.required === false);
    assert("fonts offered: the match for Marker Felt plus two sturdy ones", slot?.fonts?.join() === "marker,bold,chunky");
    assert("the name area is the example's own box: 10 x 4 mm", slot?.maxWidth === 10 && slot?.maxHeight === 4, JSON.stringify([slot?.maxWidth, slot?.maxHeight]));
    const colourOpt = opts1.find((o) => o.type === "color");
    const vals = colourOpt ? await db.select().from(s.productOptionValues).where(eq(s.productOptionValues.optionId, colourOpt.id)) : [];
    assert("Colors were created from the three filaments, named in plain English, hex as the value", r1.colours.added.length === 3 && vals.map((v) => v.value).sort().join() === "#F7E6DE,#F95D73,#FF0000" && vals.some((v) => v.label === "Pink") && vals.some((v) => v.label === "Cream") && vals.some((v) => v.label === "Red"), JSON.stringify(vals.map((v) => v.label)));
    assert("the product now points at a cleaned copy, not the upload", r1.modelKey !== key1);
    const [p1after] = await db.select().from(s.products).where(eq(s.products.id, p1.id));
    assert("products.stl_key was switched to the cleaned copy", p1after.stlKey === r1.modelKey);
    const obj = await storage.getObject(r1.modelKey);
    const cleaned = unzipSync(new Uint8Array(await new Response(obj!.stream).arrayBuffer()));
    assert("the cleaned model has no example text left", !strFromU8(cleaned["Metadata/model_settings.config"]).includes("text_info") && (strFromU8(cleaned["3D/3dmodel.model"]).match(/<component /g) ?? []).length === 1);
    assert("the original upload is kept in storage", (await storage.headObject(key1)) !== null);

    console.log("\nsecond upload to the same product: keeps its options, replaces the slot");
    const key2 = await upload(withText("normal_part", "Cams", 12, { filaments: ["#00FF00"] }), "stand2.3mf");
    const r2 = await autoConfigureModel(p1.id, key2);
    keys.push(r2.modelKey);
    const opts2 = await optionsOf(p1.id);
    assert("no duplicate options: still one text and one colour option", opts2.filter((o) => o.type === "text").length === 1 && opts2.filter((o) => o.type === "color").length === 1 && !r2.textOptionCreated && r2.colours.kept && r2.colours.added.length === 0);
    assert("the slot was refreshed", r2.slotSaved);

    console.log("\nSTL and unreadable files");
    const p2 = await newProduct("test-autocfg-2");
    const stlKey = storage.buildKey("model", "cube.stl", "TEST-AUTOCFG");
    keys.push(stlKey);
    const r3 = await autoConfigureModel(p2.id, stlKey);
    assert("an STL is left alone", r3.modelKey === stlKey && !r3.detected && (await optionsOf(p2.id)).length === 0);
    const junkKey = await upload(new TextEncoder().encode("PK not really a zip").buffer as ArrayBuffer, "junk.3mf");
    const r4 = await autoConfigureModel(p2.id, junkKey);
    assert("a broken 3MF is reported, nothing is changed", r4.modelKey === junkKey && !r4.slotSaved && r4.notes.length > 0 && (await optionsOf(p2.id)).length === 0, r4.notes.join("|"));

    console.log("\n3MF without a text element (colours only)");
    const p3 = await newProduct("test-autocfg-3");
    const plain = withText("normal_part", "Cams", 99, { filaments: ["#0077A5"] }); // face count mismatch -> not a usable text element
    const key5 = await upload(plain, "plain.3mf");
    const r5 = await autoConfigureModel(p3.id, key5);
    keys.push(r5.modelKey);
    const o3 = await optionsOf(p3.id);
    assert("no slot, no text option; the filament still becomes a colour", !r5.slotSaved && !o3.some((o) => o.type === "text") && o3.some((o) => o.type === "color") && r5.modelKey === key5);
  } finally {
    await db.delete(s.products).where(like(s.products.slug, "test-autocfg-%"));
    const left = await storage.deletePrefix("models/TEST-AUTOCFG/").catch(() => 0);
    for (const k of new Set(keys)) await storage.deleteObject(k).catch(() => undefined);
    void left;
  }

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll model auto-configuration checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
