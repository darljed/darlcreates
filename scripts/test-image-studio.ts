/**
 * The image studio: the preset prompts (a cover may carry the product's name, the other presets keep the real product
 * unchanged), one generation end to end with a fake image model and fake storage (the gallery row records the cost and
 * model; the vision guard and the per-product cap hold), the standard set, and the gallery's on/off-the-product,
 * cover, alt-text and delete actions against the shop's `product_photos` (hidden stays, nothing visible without consent).
 * Uses the database, never the real network or storage. Run: npx tsx scripts/test-image-studio.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray } from "drizzle-orm";

let failures = 0;
const assert = (n: string, c: boolean, extra = "") => { if (!c) { failures++; console.error(`  ✗ ${n} ${extra}`); } else console.log(`  ✓ ${n}`); };

(async () => {
  process.env.OPENROUTER_API_KEY ||= "test-key-not-used";
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { coverPrompt, studioImagePrompt, IMAGE_PRESETS, IMAGE_PRESET_LABEL, GENERATE_SET } = await import("../src/lib/ai/product-copy");
  const ig = await import("../src/lib/ai/image-studio");
  const catalog = await import("../src/lib/catalog");
  const { saveAiPrefs, IMAGE_MODEL } = await import("../src/lib/ai/settings");
  type Img = typeof import("../src/lib/ai/providers").generateImage;

  // ---- pure parts
  console.log("presets and prompts");
  assert("five presets and a three-picture standard set", IMAGE_PRESETS.length === 5 && IMAGE_PRESET_LABEL.cover === "Cover" && GENERATE_SET.join(",") === "cover,studio,lifestyle");
  const name = "Pickleball Fidget Clicker";
  const cover = coverPrompt(name, "warm light");
  assert("a cover asks for the product's name as readable text and allows no ban on text", cover.includes(`"${name}"`) && cover.includes("text") && cover.includes("warm light"), cover.slice(0, 80));
  assert("a cover does not carry the real-product guard that forbids text", !cover.includes("Do not add text"));
  const studioP = studioImagePrompt("studio", name, "");
  assert("the studio preset is the hero scene and keeps the real product", studioP.includes("seamless light backdrop") && studioP.includes(`"${name}"`) && studioP.includes("exact shape"));
  assert("a custom preset is the owner's own words plus the guard", studioImagePrompt("custom", name, "on a shelf").includes("on a shelf") && studioImagePrompt("custom", name, "").includes("exact shape"));
  assert("lifestyle and detail carry their own scene words", studioImagePrompt("lifestyle", name, "").includes("realistic lifestyle") && studioImagePrompt("detail", name, "").includes("macro close-up"));

  // ---- one generation, with fakes
  console.log("generation");
  const [u] = await db.select({ id: s.users.id }).from(s.users).limit(1);
  const prefsBefore = (await db.select().from(s.aiSettings).where(eq(s.aiSettings.key, "prefs")))[0];
  await saveAiPrefs({ copyProvider: "openrouter", copyModel: "fake/vision", agentProvider: "openrouter", agentModel: "", imageModel: IMAGE_MODEL }, u.id);
  const imageCalls: Parameters<Img>[0][] = [];
  const stored: { key: string; bytes: number }[] = [];
  const fakeImage: Img = async (o) => {
    imageCalls.push(o);
    if (o.model.startsWith("bad/") || o.model === "err/model") return { ok: false, error: "This model refused." };
    return { ok: true, bytes: new Uint8Array(2000), mime: "image/png", costUsd: 0.05 };
  };
  const base = {
    image: fakeImage,
    store: async (key: string, bytes: Uint8Array) => { stored.push({ key, bytes: bytes.length }); },
    refs: async (keys: string[], max: number) => ({ refs: keys.slice(0, max).map(() => "data:image/png;base64,AAAA"), skipped: 0 }),
    imageInfo: async (id: string) => (id === "no/photo" ? { vision: false, imageOnly: false } : id === "f/only" ? { vision: true, imageOnly: true } : id.startsWith("bad/") ? null : { vision: true, imageOnly: false }),
    textInfo: async () => ({ vision: true, tools: true }),
    chat: async () => ({ ok: true as const, text: 'A close-up of a "clicker" fidget on a desk.', toolCalls: [], costUsd: 0.001 }),
  };

  const uid = u.id;
  const [prod] = await db
    .insert(s.products)
    .values({ slug: `test-image-studio-${Date.now().toString(36).slice(-4)}`, name, basePriceCents: 249_00, printCostCents: 50_00, status: "draft" })
    .returning();
  const realKeys = ["photos/test-real-a.png", "photos/test-real-b.png"];
  await db.insert(s.productPhotos).values(realKeys.map((k, i) => ({ productId: prod.id, s3Key: k, sort: i })));
  const galleryIds: string[] = [];

  try {
    assert("a generation makes the picture, stores it and records the gallery row with its cost", await (async () => {
      const r = await ig.generateStudioImage({ productId: prod.id, preset: "studio", direction: "soft shadows", model: IMAGE_MODEL, actorId: uid, deps: base });
      return r.ok && stored.length === 1 && r.costUsd === 0.05 && r.image.preset === "studio" && r.image.model === IMAGE_MODEL && r.image.onProduct === null;
    })());
    assert("the image call got the two real photos and the studio prompt", imageCalls[0].refs.length === 2 && imageCalls[0].prompt.includes("seamless light backdrop") && imageCalls[0].prompt.includes("soft shadows"));
    const gallery = await ig.productGallery(prod.id);
    galleryIds.push(gallery[0].id);
    assert("the gallery lists the picture with its URL and no product link", gallery.length === 1 && gallery[0].url.startsWith("/") && gallery[0].key.startsWith("photos/ai-"));

    assert("a cover generation asks for the name text on the image", await (async () => {
      const r = await ig.generateStudioImage({ productId: prod.id, preset: "cover", direction: "", model: IMAGE_MODEL, actorId: uid, deps: base });
      const p = imageCalls[imageCalls.length - 1].prompt;
      return r.ok && p.includes(`"${name}"`) && p.includes("Overlay");
    })());
    const now = await ig.productGallery(prod.id);
    for (const g of now) if (!galleryIds.includes(g.id)) galleryIds.push(g.id);

    assert("an unknown image model is refused before the call", await ig.generateStudioImage({ productId: prod.id, preset: "studio", direction: "", model: "bad/model", actorId: uid, deps: base }).then((r) => !r.ok && r.error.includes("not one of the models"), () => false));
    assert("a vision model with no real photos is refused", await (async () => {
      await db.delete(s.productPhotos).where(eq(s.productPhotos.productId, prod.id));
      const r = await ig.generateStudioImage({ productId: prod.id, preset: "studio", direction: "", model: IMAGE_MODEL, actorId: uid, deps: base });
      return !r.ok && r.error.includes("no real photos");
    })());
    await db.insert(s.productPhotos).values(realKeys.map((k, i) => ({ productId: prod.id, s3Key: k, sort: i })));
    assert("a prompt-only model may generate without photos", await (async () => {
      await db.delete(s.productPhotos).where(eq(s.productPhotos.productId, prod.id));
      const r = await ig.generateStudioImage({ productId: prod.id, preset: "custom", direction: "on a shelf", model: "no/photo", actorId: uid, deps: base });
      const again = await ig.productGallery(prod.id);
      for (const g of again) if (!galleryIds.includes(g.id)) galleryIds.push(g.id);
      return r.ok;
    })());
    await db.insert(s.productPhotos).values(realKeys.map((k, i) => ({ productId: prod.id, s3Key: k, sort: i })));
    assert("a model that returns no image comes back as an error (and nothing is stored)", await (async () => {
      const before = stored.length;
      const r = await ig.generateStudioImage({ productId: prod.id, preset: "detail", direction: "", model: "err/model", actorId: uid, deps: base });
      return !r.ok && r.error.includes("refused") && stored.length === before;
    })());
    assert("the per-product cap stops the runaway batch", await (async () => {
      await db.insert(s.aiImages).values(Array.from({ length: ig.MAX_IMAGES_PER_PRODUCT }, (_, i) => ({ productId: prod.id, s3Key: `photos/ai-cap${i}.png`, scene: "custom", model: IMAGE_MODEL, createdBy: uid })));
      const r = await ig.generateStudioImage({ productId: prod.id, preset: "studio", direction: "", model: IMAGE_MODEL, actorId: uid, deps: base });
      return !r.ok && r.error.includes("already has");
    })());

    console.log("the standard set");
    const cap = await ig.productGallery(prod.id);
    for (const g of cap) await db.delete(s.aiImages).where(eq(s.aiImages.id, g.id));
    await db.delete(s.aiImages).where(inArray(s.aiImages.id, galleryIds));
    const set = await ig.generateStudioSet({ productId: prod.id, model: IMAGE_MODEL, actorId: uid, deps: base });
    assert("the set makes exactly cover, studio and lifestyle", set.images.map((i) => i.preset).sort().join() === "cover,lifestyle,studio" && Math.abs(set.costUsd - 0.15) < 1e-6 && !set.failures.length, JSON.stringify(set.failures));
    for (const g of set.images) galleryIds.push(g.id);
    const setRows = await db.select().from(s.aiImages).where(inArray(s.aiImages.id, set.images.map((i) => i.id)));
    assert("the set's rows carry the model, the direction and the actor", setRows.length === 3 && setRows.every((r) => r.model === IMAGE_MODEL && r.direction === "" && r.createdBy === uid));

    console.log("the gallery against product_photos");
    const coverImage = set.images.find((i) => i.preset === "cover")!;
    const on = await ig.setOnProduct(coverImage.id, true);
    assert("adding it to the product creates the visible photo row", on.ok && on.image.onProduct !== null && !on.image.onProduct.hidden && on.image.onProduct.sort === 2);
    const hiddenByDefault = await catalog.getProductById(prod.id);
    const withHidden = await catalog.getProductById(prod.id, { allPhotos: true });
    assert("the catalog (default) shows it and a hidden product photo stays hidden", hiddenByDefault?.photos.length === 3 && withHidden?.photos.length === 3);
    const off = await ig.setOnProduct(coverImage.id, false);
    assert("taking it off hides the photo row, it still lists in the gallery", off.ok && off.image.onProduct?.hidden === true);
    const visible = await catalog.getProductById(prod.id);
    const allPhotos = await catalog.getProductById(prod.id, { allPhotos: true });
    assert("the default product read keeps the hidden photo out, allPhotos keeps it for admin", visible?.photos.length === 2 && allPhotos?.photos.length === 3);

    const coverRefused = await ig.setCover(coverImage.id);
    assert("the cover is refused while the picture is off the product", !coverRefused.ok && coverRefused.error.includes("Add to product"));
    await ig.setOnProduct(coverImage.id, true);
    const third = await ig.setOnProduct(set.images.find((i) => i.preset === "lifestyle")!.id, true);
    const coverNow = await ig.setCover(coverImage.id);
    const rowsAfter = await db.select().from(s.productPhotos).where(eq(s.productPhotos.productId, prod.id)).orderBy(s.productPhotos.sort);
    assert("setting the cover moves it first", third.ok && coverNow.ok && rowsAfter[0].s3Key === coverImage.key && rowsAfter[0].sort < rowsAfter[1].sort);

    const alt = await ig.writeImageAlt(coverImage.id, base);
    assert("alt text comes from the model and lands on the gallery row too", alt.ok && alt.alt.length > 0 && (await ig.productGallery(prod.id)).find((g) => g.id === coverImage.id)?.alt === alt.alt);
    const linkedRow = (await db.select().from(s.productPhotos).where(eq(s.productPhotos.s3Key, coverImage.key)).limit(1))[0];
    assert("the linked product photo carries the same alt text", linkedRow?.alt === (alt.ok ? alt.alt : ""));

    const delOn = await ig.deleteGalleryImage(coverImage.id);
    assert("deleting is refused while the picture is on the product", !delOn.ok && delOn.error.includes("off"));
    const altImage = set.images.find((i) => i.preset === "studio")!;
    const delOff = await ig.deleteGalleryImage(altImage.id);
    assert("deleting works while it is off the product", delOff.ok && !(await ig.productGallery(prod.id)).some((g) => g.id === altImage.id));
  } finally {
    await db.delete(s.products).where(eq(s.products.id, prod.id));
    if (galleryIds.length) await db.delete(s.aiImages).where(inArray(s.aiImages.id, galleryIds));
    await db.delete(s.aiSettings).where(eq(s.aiSettings.key, "prefs"));
    if (prefsBefore) await db.insert(s.aiSettings).values(prefsBefore);
  }

  if (failures) { console.error(`${failures} failed`); process.exit(1); }
  console.log("all passed");
  process.exit(0);
})();
