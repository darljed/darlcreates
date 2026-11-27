/**
 * AI studio: key encryption, the saved settings (with the database), model-list parsing, the copy prompt/parse/banned-word
 * checks, model facts from a real STL and 3MF, the draft schema, and a provider call with a fake key (must fail gracefully).
 * Run: npx tsx scripts/test-ai.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq } from "drizzle-orm";

let failures = 0;
const assert = (n: string, c: boolean, extra = "") => { if (!c) { failures++; console.error(`  ✗ ${n} ${extra}`); } else console.log(`  ✓ ${n}`); };

(async () => {
  const { encryptSecret, decryptSecret } = await import("../src/lib/ai/crypto");
  const enc = encryptSecret("sk-test-1234567890");
  assert("encrypt hides the key", !enc.includes("sk-test") && enc.startsWith("v2:"));
  assert("decrypt round trip", decryptSecret(enc) === "sk-test-1234567890");
  assert("tampered value is unreadable", decryptSecret(enc.slice(0, -4) + "AAAA") === null);
  assert("two encryptions differ (random IV)", encryptSecret("x".repeat(10)) !== encryptSecret("x".repeat(10)));

  const { parseOpenRouterModels, parseOllamaModels, chat, generateImage } = await import("../src/lib/ai/providers");
  const or = parseOpenRouterModels({ data: [
    { id: "a/text", name: "Text", architecture: { input_modalities: ["text"], output_modalities: ["text"] }, supported_parameters: ["tools"], pricing: { prompt: "0.000001", completion: "0.000002" } },
    { id: "a/vis", name: "Vision", architecture: { input_modalities: ["text", "image"], output_modalities: ["text"] }, pricing: { prompt: "0", completion: "0" } },
    { id: "a/both", name: "Text and image", architecture: { input_modalities: ["text"], output_modalities: ["text", "image"] } },
    { id: "a/img", name: "Image only", architecture: { input_modalities: ["text"], output_modalities: ["image"] } },
    { id: "openrouter/auto", name: "Auto", architecture: { output_modalities: ["text"] } },
  ] });
  assert("openrouter: text models only, sorted", or.length === 2 && or[0].id === "a/text");
  assert("openrouter: vision, tools, price note", or[1].vision && or[0].tools && or[0].note.includes("$1.00 in") && or[1].note === "free");
  const ol = parseOllamaModels({ models: [{ name: "m1", model: "m1", capabilities: ["completion", "vision", "tools"] }, { name: "emb", model: "emb", capabilities: ["embedding"] }] });
  assert("ollama: chat models only, vision + tools", ol.length === 1 && ol[0].vision && ol[0].tools);
  assert("garbage lists give []", parseOpenRouterModels(null).length === 0 && parseOllamaModels({}).length === 0);

  const pc = await import("../src/lib/ai/product-copy");
  const good = { name: "Desk Cable Holder", tagline: "Keeps cables where you left them", description: "A small printed holder for your desk cables. It sticks to the edge of a desk.", highlights: ["Holds 3 cables", "Printed in one piece"], tags: ["Desk", "Cable"], category: "Desk", seoTitle: "Desk cable holder", metaDescription: "A small printed cable holder." };
  const ok = pc.parseCopy("```json\n" + JSON.stringify(good) + "\n```");
  assert("parseCopy accepts a fenced answer and lowercases category and tags", ok.ok && ok.copy.category === "desk" && ok.copy.tags[0] === "desk");
  assert("parseCopy rejects non-JSON", !pc.parseCopy("Sure! Here is your listing").ok);
  assert("parseCopy rejects a missing field", !pc.parseCopy(JSON.stringify({ ...good, name: "" })).ok);
  assert("parseCopy rejects tax words", !pc.parseCopy(JSON.stringify({ ...good, description: "A holder. Price includes VAT and is tax-free for all." })).ok);
  assert("parseCopy rejects business-registration words", !pc.parseCopy(JSON.stringify({ ...good, tagline: "A registered business product" })).ok);
  assert("description text includes highlights", pc.descriptionOf(good as never).includes("- Holds 3 cables") && pc.descriptionOf(good as never).length <= 2000);
  const p = pc.copyPrompt({ fileName: "x.3mf", format: "3mf", sizeMm: [10, 20, 5], triangles: 100, filaments: ["#ff0000"] }, "For students", "");
  assert("prompt has size, colours and notes", p.includes("10 x 20 x 5 mm") && p.includes("#ff0000") && p.includes("For students"));
  assert("system prompt forbids tax talk and inventing facts", pc.COPY_SYSTEM.includes("Never mention taxes") && pc.COPY_SYSTEM.includes("Never invent"));
  for (const s of pc.SCENES) assert(`image prompt (${s}) keeps the real product`, pc.imagePrompt(s, "Holder", "warm light").includes("exact shape") && pc.imagePrompt(s, "Holder", "warm light").includes("warm light"));

  // facts from a real STL and a real 3MF
  const { meshToStl } = await import("../src/lib/stl-export");
  const box = { positions: Float32Array.from([0,0,0, 20,0,0, 20,10,0, 0,10,0, 0,0,5, 20,0,5, 20,10,5, 0,10,5]), indices: Uint32Array.from([0,2,1,0,3,2, 4,5,6,4,6,7, 0,1,5,0,5,4, 1,2,6,1,6,5, 2,3,7,2,7,6, 3,0,4,3,4,7]) };
  const stl = meshToStl(box);
  const sf = pc.modelFacts(stl.buffer.slice(stl.byteOffset, stl.byteOffset + stl.byteLength) as ArrayBuffer, "stl", "box.stl");
  assert("STL facts: size 20 x 10 x 5, 12 triangles", sf.sizeMm?.join("x") === "20x10x5" && sf.triangles === 12, JSON.stringify(sf));
  const { buildKeychainPrint } = await import("../src/lib/keychain/server");
  const { DEFAULT_KEYCHAIN_CONFIG, defaultKeychain } = await import("../src/lib/keychain/spec");
  const kc = await buildKeychainPrint({ ...defaultKeychain(DEFAULT_KEYCHAIN_CONFIG), text: "Ana" }, "kc");
  if (kc.ok) {
    const mf = pc.modelFacts(kc.file.buffer.slice(kc.file.byteOffset, kc.file.byteOffset + kc.file.byteLength) as ArrayBuffer, "3mf", "kc.3mf");
    assert("3MF facts: has a size and triangles", Boolean(mf.sizeMm && mf.sizeMm[0] > 10 && mf.triangles && mf.triangles > 100), JSON.stringify(mf));
  } else assert("keychain 3MF built", false);
  assert("unreadable file gives blank facts, not a crash", pc.modelFacts(new ArrayBuffer(10), "3mf", "bad.3mf").sizeMm === null);

  const draft = pc.draftSchema.safeParse({ modelKey: "models/a.stl", photoKeys: [], facts: sf });
  assert("draft schema fills defaults", draft.success && draft.data.images.length === 0 && draft.data.copy === null);

  // fake key: must fail with a plain sentence, never throw or leak the key
  const fake = "sk-or-FAKE-key-for-tests-0000";
  const c = await chat({ provider: "openrouter", apiKey: fake, model: "google/gemini-2.5-flash", messages: [{ role: "user", content: "hi" }], timeoutMs: 20000 });
  assert("chat with a fake key fails gracefully", !c.ok && !JSON.stringify(c).includes(fake), JSON.stringify(c));
  const im = await generateImage({ apiKey: fake, model: "google/gemini-3.1-flash-image", prompt: "x", refs: [] });
  assert("image with a fake key fails gracefully", !im.ok && !JSON.stringify(im).includes(fake));

  // settings in the database (saved key wins, never readable back as plain text, removal falls back)
  const { db } = await import("../src/db");
  const { aiSettings, users } = await import("../src/db/schema");
  const { getAiKey, getKeyStatus, saveAiKey, getAiPrefs, saveAiPrefs } = await import("../src/lib/ai/settings");
  const [u] = await db.select({ id: users.id }).from(users).limit(1);
  const before = await db.select().from(aiSettings);
  try {
    await saveAiKey("ollama", "ollama-test-key-9999", u.id);
    const raw = (await db.select().from(aiSettings).where(eq(aiSettings.key, "key:ollama")))[0];
    assert("stored value is encrypted", !JSON.stringify(raw.data).includes("ollama-test"));
    assert("getAiKey returns the saved key", (await getAiKey("ollama")) === "ollama-test-key-9999");
    const st = await getKeyStatus("ollama");
    assert("status shows source and last 4 only", st.configured && st.source === "saved" && st.last4 === "9999" && !JSON.stringify(st).includes("ollama-test"));
    await saveAiPrefs({ copyProvider: "ollama", copyModel: "m1", agentProvider: "ollama", agentModel: "", imageModel: "google/gemini-3.1-flash-image" }, u.id);
    assert("prefs round trip", (await getAiPrefs()).copyModel === "m1");
    await saveAiKey("ollama", null, u.id);
    assert("removing the key clears it", (await getAiKey("ollama")) === (process.env.OLLAMA_API_KEY ?? null));
  } finally {
    // put the owner's real rows back exactly as they were
    for (const k of ["key:ollama", "prefs"]) {
      await db.delete(aiSettings).where(eq(aiSettings.key, k));
      const old = before.find((r) => r.key === k);
      if (old) await db.insert(aiSettings).values(old);
    }
  }
  // approval claim: of two simultaneous claims on one draft, only one wins
  const { aiDrafts } = await import("../src/db/schema");
  const { and } = await import("drizzle-orm");
  const [dr] = await db.insert(aiDrafts).values({ kind: "product", title: "TEST-claim", payload: {}, createdBy: u.id }).returning({ id: aiDrafts.id });
  try {
    const claim = () => db.update(aiDrafts).set({ status: "applying" }).where(and(eq(aiDrafts.id, dr.id), eq(aiDrafts.status, "draft"))).returning({ id: aiDrafts.id });
    const [c1, c2] = await Promise.all([claim(), claim()]);
    assert("only one of two simultaneous claims wins", c1.length + c2.length === 1);
  } finally { await db.delete(aiDrafts).where(eq(aiDrafts.id, dr.id)); }
  if (failures) { console.error(`${failures} failed`); process.exit(1); }
  console.log("all passed");
  process.exit(0);
})();
