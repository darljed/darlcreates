/**
 * AI studio chat: image-model list parsing, the draft schema (old drafts still load), the settings default, and the chat
 * loop with a scripted fake model and fake image model (the listing and mockups only fill the draft; costs add up once;
 * limits and refusals hold), one chat per product with the product tools (forced to the chat's product; proposals on the turn), and that parallel writes to one draft do not lose data.
 * Uses the database, never the network or storage. Run: npx tsx scripts/test-ai-studio.ts
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
  const { parseOpenRouterImageModels, parseOpenRouterModels } = await import("../src/lib/ai/providers");
  const { draftSchema } = await import("../src/lib/ai/product-copy");
  const { prefsSchema, saveAiPrefs, IMAGE_MODEL } = await import("../src/lib/ai/settings");
  const studio = await import("../src/lib/ai/studio");
  type Chat = typeof import("../src/lib/ai/providers").chat;
  type Img = typeof import("../src/lib/ai/providers").generateImage;

  // ---- pure parts
  console.log("image model list");
  const list = parseOpenRouterImageModels({ data: [
    { id: "g/both", name: "Both", architecture: { input_modalities: ["image", "text"], output_modalities: ["image", "text"] }, pricing: { prompt: "0.000001", completion: "0.000002", image_output: "0.00006" } },
    { id: "f/only", name: "Only image", architecture: { input_modalities: ["text"], output_modalities: ["image"] }, pricing: { prompt: "0", completion: "0", image_output: "0" } },
    { id: "openrouter/auto", name: "Auto", architecture: { output_modalities: ["text", "image"] } },
    { id: "t/text", name: "Text", architecture: { output_modalities: ["text"] } },
  ] });
  assert("keeps image makers, drops routers and text-only", list.map((m) => m.id).join() === "g/both,f/only" || list.map((m) => m.id).sort().join() === "f/only,g/both", JSON.stringify(list.map((m) => m.id)));
  assert("flags image-only and photo input", list.find((m) => m.id === "f/only")?.imageOnly === true && list.find((m) => m.id === "f/only")?.vision === false && list.find((m) => m.id === "g/both")?.vision === true);
  assert("only free models get a price note", list.find((m) => m.id === "f/only")?.note === "free" && list.find((m) => m.id === "g/both")?.note === "");
  assert("image models stay out of the text list", parseOpenRouterModels({ data: [{ id: "g/both", architecture: { output_modalities: ["image", "text"] } }] }).length === 0);
  assert("garbage gives []", parseOpenRouterImageModels(null).length === 0);

  console.log("schemas");
  const old = draftSchema.safeParse({ modelKey: "models/a.stl", photoKeys: ["photos/a.png"], notes: "n", facts: { fileName: "a.stl", format: "stl", sizeMm: [1, 2, 3], triangles: 12, filaments: [] }, copy: null, price: "", images: [{ key: "photos/ai-x.png", scene: "hero", extra: "" }], costUsd: 0.1, productId: null });
  assert("a draft saved before the chat existed still loads", old.success && old.data.chat.length === 0 && old.data.images[0].model === "", JSON.stringify(old));
  const blank = draftSchema.parse({});
  assert("a blank chat has no model file and no facts", blank.modelKey === null && blank.facts === null && blank.chat.length === 0);
  assert("image model defaults to the Gemini flash image model", prefsSchema.parse({}).imageModel === IMAGE_MODEL && IMAGE_MODEL === "google/gemini-3.1-flash-image");
  assert("a bad image model id is refused", !prefsSchema.safeParse({ imageModel: "not a model; drop table" }).success);
  assert("system prompt: expert, proposals only, no tax talk", studio.STUDIO_SYSTEM.includes("expert in e-commerce") && studio.STUDIO_SYSTEM.includes("PROPOSAL") && studio.STUDIO_SYSTEM.includes("Never mention taxes"));
  assert("two tools, no way to publish", studio.STUDIO_TOOLS.map((t) => t.function.name).join() === "propose_listing,make_mockup");
  assert("tool schemas are plain objects", studio.STUDIO_TOOLS.every((t) => (t.function.parameters as { type?: string }).type === "object" && !("$schema" in t.function.parameters)));

  // ---- the loop, with fakes
  const [u] = await db.select({ id: s.users.id }).from(s.users).limit(1);
  const prefsBefore = (await db.select().from(s.aiSettings).where(eq(s.aiSettings.key, "prefs")))[0];
  const draftIds: string[] = [];
  await saveAiPrefs({ copyProvider: "openrouter", copyModel: "fake/model", agentProvider: "openrouter", agentModel: "", imageModel: IMAGE_MODEL }, u.id);

  const newDraft = async (over: Record<string, unknown> = {}) => {
    const payload = draftSchema.parse({ photoKeys: ["photos/test-a.png", "photos/test-b.png"], chat: [{ role: "user", text: "Write the listing and make a mockup" }], ...over });
    const [r] = await db.insert(s.aiDrafts).values({ kind: "product", title: "TEST-studio", payload, createdBy: u.id }).returning({ id: s.aiDrafts.id });
    draftIds.push(r.id);
    return r.id;
  };
  type Step = { text?: string; calls?: { name: string; args: unknown }[] };
  const offered: string[] = []; // the tool names of every model call, in order
  const script = (steps: Step[], seen: string[] = []): Chat => {
    let i = 0;
    return async (o) => {
      seen.push(JSON.stringify(o.messages));
      offered.push((o.tools ?? []).map((t) => t.function.name).join(","));
      const st = steps[Math.min(i++, steps.length - 1)];
      return { ok: true, text: st.text ?? "", toolCalls: (st.calls ?? []).map((c, k) => ({ id: `c${i}-${k}`, type: "function" as const, function: { name: c.name, arguments: JSON.stringify(c.args) } })), costUsd: 0.001 };
    };
  };
  const imageCalls: Parameters<Img>[0][] = [];
  const stored: string[] = [];
  const fakeImage: Img = async (o) => {
    imageCalls.push(o);
    if (o.model.startsWith("bad/")) return { ok: false, error: "This model refused." };
    return { ok: true, bytes: new Uint8Array(2000), mime: "image/png", costUsd: 0.05 };
  };
  const base = {
    image: fakeImage,
    store: async (k: string) => { stored.push(k); },
    refs: async (keys: string[], max: number) => ({ refs: keys.slice(0, max).map(() => "data:image/png;base64,AAAA"), skipped: 0 }),
    imageInfo: async (id: string) => (id === "f/only" ? { vision: true, imageOnly: true } : id === "no/photo" ? { vision: false, imageOnly: false } : { vision: true, imageOnly: false }),
    textInfo: async () => ({ vision: false, tools: true }),
  };
  const good = { name: "Desk Cable Holder", tagline: "Keeps cables where you left them", description: "A small printed holder for your desk cables. It clips to the edge of a desk.", highlights: ["Holds 3 cables", "Printed in one piece"], tags: ["desk"], category: "desk", seoTitle: "Desk cable holder", metaDescription: "A small printed cable holder." };
  const load = async (id: string) => (await studio.loadDraft(id))!.payload;

  try {
    console.log("chat loop");
    const seen: string[] = [];
    const id1 = await newDraft();
    const r1 = await studio.runStudio({ draftId: id1, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, chat: script([{ calls: [{ name: "propose_listing", args: { ...good, price: "₱249" } }] }, { calls: [{ name: "make_mockup", args: { scene: "hero", direction: "warm light" } }] }, { text: "Here is the listing and a hero mockup." }], seen) } });
    const d1 = await load(id1);
    assert("run succeeds with one mockup and a listing", r1.ok && r1.made === 1 && r1.listing, JSON.stringify(r1));
    assert("the listing is saved in the draft and the price is cleaned to digits", d1.copy?.name === "Desk Cable Holder" && d1.price === "249");
    assert("the mockup is in the draft, tagged with the image model", d1.images.length === 1 && d1.images[0].model === IMAGE_MODEL && d1.images[0].scene === "hero" && stored.includes(d1.images[0].key));
    assert("the image call used the real photos and the owner's direction", imageCalls[0].model === IMAGE_MODEL && imageCalls[0].refs.length === 2 && imageCalls[0].prompt.includes("warm light") && imageCalls[0].prompt.includes("exact shape"));
    assert("the cost is counted once (3 writing calls + 1 image)", Math.abs(d1.costUsd - 0.053) < 1e-6, String(d1.costUsd));
    const last = d1.chat.at(-1)!;
    assert("the assistant's turn carries the mockup and no false-claim note", last.role === "assistant" && last.images.length === 1 && last.images[0] === d1.images[0].key && !last.text.includes("did not actually"));
    assert("the model was told nothing is published", seen[0].includes("PROPOSAL") && seen[0].includes("P1, P2"));

    console.log("refusals");
    const id2 = await newDraft();
    const seen2: string[] = [];
    const r2 = await studio.runStudio({ draftId: id2, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, chat: script([{ calls: [{ name: "propose_listing", args: { ...good, description: "A holder. The price includes VAT for all buyers." } }] }, { text: "ok" }], seen2) } });
    assert("a listing that mentions tax is refused and not saved", r2.ok && !r2.listing && (await load(id2)).copy === null && seen2[1].includes("never says"));
    const id3 = await newDraft({ photoKeys: [] });
    const seen3: string[] = [];
    const before = imageCalls.length;
    await studio.runStudio({ draftId: id3, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, chat: script([{ calls: [{ name: "make_mockup", args: { scene: "hero" } }] }, { text: "Please attach a photo." }], seen3) } });
    assert("no photo, no mockup (and no paid image call)", (await load(id3)).images.length === 0 && imageCalls.length === before && seen3[1].includes("No real photo"));
    const id4 = await newDraft();
    const three = ["hero", "lifestyle", "detail"].map((scene) => ({ name: "make_mockup", args: { scene } }));
    const r4 = await studio.runStudio({ draftId: id4, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, chat: script([{ calls: three }, { text: "Two done." }]) } });
    assert("at most two mockups per message", r4.ok && r4.made === 2 && (await load(id4)).images.length === 2);
    // regression: a model that passes storage keys / file names instead of "P1" must still get its mockup
    const idK = await newDraft();
    const keyOf = (await load(idK)).photoKeys[0];
    const rK = await studio.runStudio({ draftId: idK, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, chat: script([{ calls: [{ name: "make_mockup", args: { scene: "hero", photos: [keyOf, "nope.jpg"] } }] }, { text: "Done." }]) } });
    assert("photo keys instead of P-labels still make a mockup", rK.ok && rK.made === 1 && (await load(idK)).images.length === 1);
    const id5 = await newDraft();
    const r5 = await studio.runStudio({ draftId: id5, imageModel: "no/photo", actorId: u.id, deps: { ...base, chat: script([{ calls: [{ name: "make_mockup", args: { scene: "hero" } }] }, { text: "That model cannot." }]) } });
    assert("an image model that cannot take a photo is refused", r5.ok && r5.made === 0 && (await load(id5)).images.length === 0);
    const id6 = await newDraft();
    const n0 = imageCalls.length;
    await studio.runStudio({ draftId: id6, imageModel: "f/only", actorId: u.id, deps: { ...base, chat: script([{ calls: [{ name: "make_mockup", args: { scene: "custom", direction: "on a shelf" } }] }, { text: "done" }]) } });
    assert("an image-only model is called with image-only output", imageCalls[n0]?.imageOnly === true && imageCalls[n0].prompt.includes("on a shelf"));
    const id7 = await newDraft();
    const seen7: string[] = [];
    const r7 = await studio.runStudio({ draftId: id7, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, chat: script([{ text: "I've made a mockup for you." }], seen7) } });
    assert("a claim with no tool call is sent back once, then shown with the note", r7.ok && seen7.length === 2 && seen7[1].includes("NOTHING was made") && (await load(id7)).chat.at(-1)!.text.includes(studio.NOT_MADE_NOTE));
    // the replies from the owner's real chat (gemini-2.5-flash-lite) that slipped past the old check
    const real = [
      "I've generated three lifestyle mockups showing the pickleball fidget clicker keychain as an accessory to pickleball gear.",
      "I've created a new lifestyle mockup featuring the pickleball fidget clicker keychain with your gear. This mockup has been added to the draft.",
      "I've generated a lifestyle mockup showing the pickleball fidget clicker keychain as an accessory to pickleball gear.",
      "These mockups have been added to the draft. Please review them.",
    ];
    assert("the owner's real false claims are all caught", real.every((t) => studio.claimsWithoutWork(t, 0)));
    assert("honest answers are not flagged", !studio.claimsWithoutWork("Please attach a photo of the real print first, then I can make the mockups.", 0) && !studio.claimsWithoutWork("Once you have added photos I can start.", 0));
    assert("a claim after real work is not flagged", !studio.claimsWithoutWork(real[0], 1));
    const idFix = await newDraft();
    const nFix = imageCalls.length;
    const rFix = await studio.runStudio({ draftId: idFix, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, chat: script([{ text: real[0] }, { calls: [{ name: "make_mockup", args: { scene: "lifestyle" } }] }, { text: "Here is the lifestyle mockup." }]) } });
    const dFix = await load(idFix);
    assert("after the push-back the model makes the mockup for real, and no note is added", rFix.ok && rFix.made === 1 && imageCalls.length === nFix + 1 && dFix.images.length === 1 && !dFix.chat.at(-1)!.text.includes(studio.NOT_MADE_NOTE));
    const id8 = await newDraft();
    const r8 = await studio.runStudio({ draftId: id8, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, textInfo: async () => ({ vision: false, tools: false }), chat: script([{ text: "x" }]) } });
    assert("a writing model without tools is refused with a plain sentence", !r8.ok && r8.error.includes("cannot call tools"));
    const id9 = await newDraft({ chat: [{ role: "assistant", text: "hi" }] });
    assert("nothing to answer when the owner has not spoken", !(await studio.runStudio({ draftId: id9, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, chat: script([{ text: "x" }]) } })).ok);
    const id10 = await newDraft();
    const failing: Chat = async () => ({ ok: false, error: "The provider is rate limiting. Try again in a minute." });
    const r10 = await studio.runStudio({ draftId: id10, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, chat: failing } });
    assert("a provider error comes back as an error, the owner's message stays", !r10.ok && (await load(id10)).chat.length === 1);

    console.log("one chat per product");
    const [prod] = await db.insert(s.products).values({ slug: `test-studio-chat-${Date.now()}`, name: "TEST-STUDIO-CHAT Cup", description: "A cup.", category: "test", basePriceCents: 10000, status: "draft" }).returning();
    try {
      const [o] = await db.insert(s.productOptions).values({ productId: prod.id, type: "color", label: "Body colour", required: true, constraints: { partName: "dc-slot-0", defaultHex: "#ff0000" }, sort: 0 }).returning();
      await db.insert(s.productOptionValues).values([{ optionId: o.id, label: "Red", value: "#ff0000", sort: 0 }, { optionId: o.id, label: "Blue", value: "#0000ff", sort: 1 }]);
      const pc = await newDraft({ productId: prod.id });
      assert("the product's open chat is found", (await studio.findProductChat(prod.id))?.id === pc);
      const seenP: string[] = [];
      const o0 = offered.length;
      const other = "00000000-0000-4000-8000-000000000000";
      const rP = await studio.runStudio({ draftId: pc, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, chat: script([
        { calls: [{ name: "get_product_options", args: { productId: other } }, { name: "save_design_preset", args: { productId: other, name: "Ocean", colours: [{ option: "Body colour", colour: "Blue" }] } }, { name: "adjust_stock", args: { partId: other, delta: 1, reason: "x" } }] },
        { text: "A design is waiting for your approval." },
      ], seenP) } });
      const dP = await load(pc);
      const ids = dP.chat.at(-1)!.proposals;
      const toolsP = offered[o0].split(",");
      assert("a product chat is offered the product and option tools, never stock tools", toolsP.includes("save_design_preset") && toolsP.includes("get_product") && toolsP.includes("make_mockup") && !toolsP.includes("adjust_stock") && seenP[0].includes("The product exists"));
      assert("the tools act on the chat's product even when the model names another id", seenP[1].includes("Body colour") && !seenP[1].includes("Product not found"));
      assert("one design card on the assistant's turn; the stock tool was refused", rP.ok && rP.proposals === 1 && ids.length === 1 && seenP[1].includes("Unknown tool adjust_stock"));
      assert("nothing changed before approval", (await db.select().from(s.productPresets).where(eq(s.productPresets.productId, prod.id))).length === 0);
      const snapP = await studio.snapshotOf((await studio.loadDraft(pc))!);
      assert("the snapshot carries the card with its before/after and status", snapP.proposals[ids[0]]?.status === "draft" && snapP.proposals[ids[0]].tool === "save_design_preset" && JSON.stringify(snapP.proposals[ids[0]].after).includes("#0000ff"));
      const seenN: string[] = [];
      const o1 = offered.length;
      const idN = await newDraft();
      await studio.runStudio({ draftId: idN, imageModel: IMAGE_MODEL, actorId: u.id, deps: { ...base, chat: script([{ calls: [{ name: "save_design_preset", args: { productId: prod.id, name: "X", colours: [] } }] }, { text: "ok" }], seenN) } });
      assert("before the product exists: only listing and mockups, and a call to a product tool is refused", offered[o1] === "propose_listing,make_mockup" && seenN[0].includes("does not exist yet") && seenN[1].includes("press Create product first"));
      await db.delete(s.aiDrafts).where(inArray(s.aiDrafts.id, ids));
    } finally {
      await db.delete(s.products).where(eq(s.products.id, prod.id));
    }

    console.log("writes to one draft");
    const id12 = await newDraft();
    await Promise.all(Array.from({ length: 5 }, (_, i) => studio.updateDraft(id12, (p) => ({ ...p, images: [...p.images, { key: `photos/ai-par${i}.png`, scene: "hero" as const, extra: "", model: `m/${i}` }] }))));
    assert("five simultaneous updates all land", (await load(id12)).images.length === 5);
    await db.update(s.aiDrafts).set({ status: "applied" }).where(eq(s.aiDrafts.id, id12));
    assert("a used draft cannot be changed", (await studio.updateDraft(id12, (p) => p)) === null);
    assert("a refused change rolls back", await studio.updateDraft(id1, () => { throw new Error("no"); }).then(() => false, () => true) && (await load(id1)).images.length === 1);
    const snap = await studio.snapshotOf((await studio.loadDraft(id1))!);
    assert("the snapshot has a URL slot for every picture", d1.images.every((i) => i.key in snap.urls));
  } finally {
    if (draftIds.length) await db.delete(s.aiDrafts).where(inArray(s.aiDrafts.id, draftIds));
    await db.delete(s.aiSettings).where(eq(s.aiSettings.key, "prefs"));
    if (prefsBefore) await db.insert(s.aiSettings).values(prefsBefore);
  }
  if (failures) { console.error(`${failures} failed`); process.exit(1); }
  console.log("all passed");
  process.exit(0);
})();
