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
    const o1c = opts1;
    const nameOpt = opts1.find((o) => o.type === "text");
    const slot = slotOf(nameOpt?.constraints as { slot?: unknown });
    assert("the slot is valid, at the detected spot, with the sensible defaults for the text option", !!slot && Math.abs(slot.position[0] - 120) < 0.01 && slot.normal[0] > 0.99 && (nameOpt!.constraints as { maxLen?: number }).maxLen === 12 && nameOpt!.required === false);
    assert("the three filaments are offered as name colours, with their filament numbers", slot?.nameColors?.map((c) => `${c.label}:${c.filament}`).join() === "Pink:1,Cream:2,Red:3", JSON.stringify(slot?.nameColors));
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


    console.log("\nmodel made of two parts in different filaments: one colour option per part");
    const p4 = await newProduct("test-autocfg-4");
    const key6 = await upload(withText("normal_part", "Cams", 12, { second: true, filaments: ["#F95D73", "#00FF00", "#0000FF"] }), "two-part.3mf");
    const r6 = await autoConfigureModel(p4.id, key6);
    keys.push(r6.modelKey);
    const o4 = await optionsOf(p4.id);
    const colourOpts = o4.filter((o) => o.type === "color").sort((a, b) => a.sort - b.sort);
    type PartCons = { partName?: string; parts?: { objectId: string; partId: string }[]; filaments?: Record<string, number>; defaultHex?: string };
    assert("two colour options: Body colour and Lid colour", colourOpts.map((o) => o.label).join() === "Body colour,Lid colour" && r6.colours.parts.length === 2, colourOpts.map((o) => o.label).join());
    const c0 = colourOpts[0].constraints as PartCons, c1 = colourOpts[1].constraints as PartCons;
    assert("each carries its mesh name, slicer parts, the filament map and the designer's colour", c0.partName === "dc-slot-0" && c1.partName === "dc-slot-1" && c0.parts?.[0].objectId === "3" && c1.parts?.[0].objectId === "4" && c0.defaultHex === "#F95D73" && c1.defaultHex === "#0000FF" && c1.filaments?.["#0000FF"] === 3, JSON.stringify([c0, c1]));
    const v4 = await db.select().from(s.productOptionValues).where(eq(s.productOptionValues.optionId, colourOpts[1].id));
    assert("both offer the project's three colours", v4.map((v) => v.value).sort().join() === "#0000FF,#00FF00,#F95D73");
    assert("the stored copy is a new file whose meshes are named for the viewer", r6.modelKey !== key6 && await (async () => {
      const o = await storage.getObject(r6.modelKey);
      const f = unzipSync(new Uint8Array(await new Response(o!.stream).arrayBuffer()));
      const m = strFromU8(f["3D/Objects/o.model"]);
      return m.includes('name="dc-slot-0"') && m.includes('name="dc-slot-1"');
    })());
    assert("the name option and slot are still created", r6.slotSaved && o4.some((o) => o.type === "text"));
    const single = (o1c.find((o) => o.type === "color")?.constraints ?? {}) as PartCons;
    assert("a one-group model keeps ONE Colors option (whole model), with its filament map for the print file", o1c.filter((o) => o.type === "color").length === 1 && !single.partName && single.parts?.length === 1 && single.defaultHex === "#F95D73", JSON.stringify(single));

    console.log("\nmodel with an area painted in another filament: an Outline colour option");
    const p6 = await newProduct("test-autocfg-6");
    const key8 = await upload(withText("normal_part", "Cams", 12, { paint: "0C01", filaments: ["#F95D73", "#00FF00", "#0000FF"] }), "painted.3mf");
    const r8 = await autoConfigureModel(p6.id, key8);
    keys.push(r8.modelKey);
    const o6 = (await optionsOf(p6.id)).filter((o) => o.type === "color").sort((a, b) => a.sort - b.sort);
    const out6 = o6.find((o) => o.label === "Outline colour")?.constraints as PartCons & { paintFrom?: number } | undefined;
    assert("Body colour and Outline colour were created", o6.map((o) => o.label).join() === "Body colour,Outline colour", o6.map((o) => o.label).join());
    assert("the outline option knows its filament (3), its painted part and the filament map", out6?.paintFrom === 3 && out6.parts?.[0].objectId === "3" && out6.defaultHex === "#0000FF" && out6.filaments?.["#00FF00"] === 2 && out6.partName === "dc-slot-1", JSON.stringify(out6));
    assert("the stored copy has preview helper meshes, and the original keeps its paint for printing", r8.modelKey !== key8 && await (async () => {
      const o = await storage.getObject(r8.modelKey);
      const f = unzipSync(new Uint8Array(await new Response(o!.stream).arrayBuffer()));
      const m = strFromU8(f["3D/Objects/o.model"]);
      return m.includes('type="other"') && m.includes('paint_color="0C01"') && m.includes('name="dc-hide"');
    })());

    console.log("\n3MF whose example is a negative part: engraved");
    const p5 = await newProduct("test-autocfg-5");
    const key7 = await upload(withText("negative_part", "Cams", 12, { engraved: true, filaments: ["#F95D73", "#00FF00"] }), "engraved.3mf");
    const r7 = await autoConfigureModel(p5.id, key7);
    keys.push(r7.modelKey);
    const slot7 = slotOf((await optionsOf(p5.id)).find((o) => o.type === "text")?.constraints as { slot?: unknown });
    assert("detected as engraved; the slot is engraved, 1.5 mm deep, with no name colours (a cut has no colour)", r7.detected?.mode === "engraved" && slot7?.mode === "engraved" && Math.abs(slot7.depth - 1.5) < 0.01 && !slot7.nameColors && slot7.object === "3", JSON.stringify(slot7));
    assert("the example is gone from the stored model", await (async () => {
      const o = await storage.getObject(r7.modelKey);
      const f = unzipSync(new Uint8Array(await new Response(o!.stream).arrayBuffer()));
      return !strFromU8(f["Metadata/model_settings.config"]).includes("text_info");
    })());

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
