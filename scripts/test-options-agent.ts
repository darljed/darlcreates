/**
 * Product studio / agent option tools: the option tools' previews against a real product (words matched to real options and colours,
 * every refusal a plain sentence), the loop with a scripted model limited to the option tools (proposals only, nothing
 * changes, other tools refused), and the approval guard (a proposal made on old data is refused). Applying runs through the
 * product editor's Server Actions, which need a signed-in admin, so it is checked in the browser.
 * Uses the database. Run: npx tsx scripts/test-options-agent.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray } from "drizzle-orm";

let failures = 0;
const assert = (n: string, c: boolean, extra = "") => { if (!c) { failures++; console.error(`  ✗ ${n} ${extra}`); } else console.log(`  ✓ ${n}`); };
const PREFIX = "TEST-OPTAGENT-";

(async () => {
  process.env.OPENROUTER_API_KEY ||= "test-key-not-used";
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { OPTION_TOOLS } = await import("../src/lib/ai/agent/options-tools");
  const { TOOLS, toolByName } = await import("../src/lib/ai/agent/tools");
  const { runAgent } = await import("../src/lib/ai/agent/run");
  const { applyProposal } = await import("../src/lib/ai/agent/apply");
  const { saveAiPrefs } = await import("../src/lib/ai/settings");
  const { loadColourInventory } = await import("../src/lib/site-content-store");
  const { DEFAULT_INVENTORY } = await import("../src/lib/colour-inventory-schema");
  type Chat = typeof import("../src/lib/ai/providers").chat;

  console.log("registry");
  const names = OPTION_TOOLS.map((t) => t.name);
  assert("one read tool, the rest write tools with preview and apply", OPTION_TOOLS.filter((t) => t.kind === "read").map((t) => t.name).join() === "get_product_options" && OPTION_TOOLS.filter((t) => t.kind === "write").every((t) => t.preview && t.apply));
  assert("the agent's registry knows them (so approval finds them)", names.every((n) => toolByName(n)) && new Set(TOOLS.map((t) => t.name)).size === TOOLS.length);
  assert("no tool deletes an option or a design, or re-detects", !names.some((n) => /delete|redetect|detect/.test(n)));

  const [u] = await db.select({ id: s.users.id }).from(s.users).limit(1);
  const prefsBefore = (await db.select().from(s.aiSettings).where(eq(s.aiSettings.key, "prefs")))[0];
  const inv = (await loadColourInventory()) ?? DEFAULT_INVENTORY;
  const [c1, c2, c3] = inv.colours;
  const [prod] = await db.insert(s.products).values({ slug: `${PREFIX}${Date.now()}`, name: `${PREFIX}Cup`, description: "A cup.", category: "test", basePriceCents: 10000, status: "draft" }).returning();
  const draftIds: string[] = [];
  const mk = async (label: string, partName: string, hexes: { name: string; hex: string }[], sort: number) => {
    const [o] = await db.insert(s.productOptions).values({ productId: prod.id, type: "color", label, required: true, constraints: { partName, defaultHex: hexes[0].hex }, sort }).returning();
    await db.insert(s.productOptionValues).values(hexes.map((h, i) => ({ optionId: o.id, label: h.name, value: h.hex, sort: i })));
    return o;
  };
  const body = await mk("Body colour", "dc-slot-0", [c1, c2], 0);
  await mk("Lid colour", "dc-slot-1", [c1, c2], 1);
  // as the loop does: arguments are parsed (defaults filled) before the preview runs
  const run = (name: string, args: unknown) => toolByName(name)!.preview!(toolByName(name)!.params.parse(args) as never) as Promise<{ summary: string; before: unknown; after: Record<string, unknown> } | { error: string }>;
  const err = (r: unknown) => (r as { error?: string }).error ?? "";

  try {
    console.log("read");
    const view = (await toolByName("get_product_options")!.run!({ productId: prod.id } as never)) as { options: { label: string; part: string; choices: { label: string; hex: string }[] }[]; presets: unknown[]; designMode: string; shopColours: string[] };
    assert("options with parts and colours, no designs, custom mode, the shop's colours", view.options.length === 2 && view.options[0].part === "dc-slot-0" && view.options[0].choices[0].hex === c1.hex && view.presets.length === 0 && view.designMode === "custom" && view.shopColours.length === inv.colours.length);

    console.log("previews");
    const okPreset = await run("save_design_preset", { productId: prod.id, name: "Ocean", colours: [{ option: "body colour", colour: c2.name }, { option: "Lid colour", colour: c1.hex }] });
    assert("a design by words: matched to the real options and colours", !("error" in okPreset) && okPreset.before === null && String(okPreset.after["Body colour"]).includes(c2.hex), JSON.stringify(okPreset));
    assert("a design must colour every part", err(await run("save_design_preset", { productId: prod.id, name: "Half", colours: [{ option: "Body colour", colour: c1.name }] })).includes("Missing: Lid colour"));
    assert("a colour the part does not offer is refused, with what it does offer", err(await run("save_design_preset", { productId: prod.id, name: "X", colours: [{ option: "Body colour", colour: c3.name }, { option: "Lid colour", colour: c1.name }] })).includes("does not offer"));
    assert("an unknown option is refused", err(await run("save_design_preset", { productId: prod.id, name: "X", colours: [{ option: "Handle", colour: c1.name }] })).includes('No option "Handle"'));
    assert("presets mode needs a visible design first", err(await run("set_design_mode", { productId: prod.id, mode: "presets" })).includes("Add a design first"));
    assert("custom mode is already set", err(await run("set_design_mode", { productId: prod.id, mode: "custom" })).includes("already"));
    const addColour = await run("set_option_colours", { productId: prod.id, option: "Body colour", add: [c3.name], remove: [c1.name] });
    assert("add and remove colours: before and after lists", !("error" in addColour) && JSON.stringify(addColour.after["Body colour"]).includes(c3.hex) && !JSON.stringify(addColour.after["Body colour"]).includes(c1.hex));
    assert("a colour outside the shop's list cannot be added", err(await run("set_option_colours", { productId: prod.id, option: "Body colour", add: ["Unobtainium"] })).includes("not in the shop's colour list"));
    assert("an option cannot lose every colour", err(await run("set_option_colours", { productId: prod.id, option: "Body colour", remove: [c1.name, c2.name] })).includes("at least one"));
    const opt = await run("update_option", { productId: prod.id, option: "Lid colour", label: "Lid", pricePesos: 20 });
    assert("an option change shows only what changes", !("error" in opt) && JSON.stringify(opt.after) === JSON.stringify({ label: "Lid", pricePesos: 20 }));
    assert("a length is only for text options", err(await run("update_option", { productId: prod.id, option: "Lid colour", maxLength: 10 })).includes("text option"));
    const size = await run("add_option", { productId: prod.id, type: "size", label: "Size", choices: [{ label: "Small" }, { label: "Large", extraPesos: 60 }] });
    assert("a new size option is previewed with its choices", !("error" in size) && JSON.stringify(size.after.choices) === JSON.stringify(["Small", "Large +₱60"]));
    assert("a duplicate option name is refused", err(await run("add_option", { productId: prod.id, type: "text", label: "body colour" })).includes("already an option"));
    assert("a size option needs choices", err(await run("add_option", { productId: prod.id, type: "size", label: "Fit" })).includes("Give the choices"));

    console.log("loop (fake model, option tools only)");
    await saveAiPrefs({ copyProvider: "openrouter", copyModel: "fake/model", agentProvider: "openrouter", agentModel: "", imageModel: "google/gemini-3.1-flash-image" }, u.id);
    const seen: string[] = [];
    let n = 0;
    const fake: Chat = async (o) => {
      seen.push(JSON.stringify({ tools: o.tools?.map((t) => t.function.name), system: o.messages[0].content }));
      n++;
      if (n === 1) return { ok: true, text: "", costUsd: 0, toolCalls: [
        { id: "a", type: "function", function: { name: "adjust_stock", arguments: JSON.stringify({ partId: prod.id, delta: 5, reason: "x" }) } },
        { id: "b", type: "function", function: { name: "save_design_preset", arguments: JSON.stringify({ productId: prod.id, name: "Ocean", colours: [{ option: "Body colour", colour: c2.name }, { option: "Lid colour", colour: c1.name }] }) } },
        { id: "c", type: "function", function: { name: "set_option_colours", arguments: JSON.stringify({ productId: prod.id, option: "Lid colour", add: [c3.name] }) } },
      ] };
      return { ok: true, text: "Two changes are waiting for your approval.", toolCalls: [], costUsd: 0 };
    };
    const r = await runAgent({ messages: [{ role: "user", content: "Add Ocean and offer a third lid colour" }], path: `/admin/products/${prod.id}`, search: "", actorId: u.id, chatFn: fake, tools: OPTION_TOOLS });
    if (r.ok) draftIds.push(...r.proposals.map((p) => p.id));
    assert("two proposals, the stock tool refused", r.ok && r.proposals.length === 2 && r.proposals.map((p) => p.tool).join() === "save_design_preset,set_option_colours", JSON.stringify(r));
    assert("the model was offered only the option tools, and told about the product", seen[0].includes("save_design_preset") && !seen[0].includes("adjust_stock") && seen[0].includes(prod.id));
    const presetsNow = await db.select().from(s.productPresets).where(eq(s.productPresets.productId, prod.id));
    const valuesNow = await db.select().from(s.productOptionValues).innerJoin(s.productOptions, eq(s.productOptions.id, s.productOptionValues.optionId)).where(eq(s.productOptions.productId, prod.id));
    assert("NOTHING changed before approval", presetsNow.length === 0 && valuesNow.length === 4);

    console.log("approval guard");
    const colourProposal = r.ok ? r.proposals.find((p) => p.tool === "set_option_colours") : undefined;
    // the owner changes the lid colours by hand before approving: the proposal's "before" is now wrong
    await db.insert(s.productOptionValues).values({ optionId: (await db.select().from(s.productOptions).where(eq(s.productOptions.label, "Lid colour")).then((x) => x.find((o) => o.productId === prod.id)!)).id, label: "Hand added", value: "#123456", sort: 9 });
    const stale: { ok: boolean; error?: string } = colourProposal ? await applyProposal(colourProposal.id, u.id) : { ok: true };
    assert("a proposal made on old data is refused, not applied", !stale.ok && /changed since/.test(stale.error ?? ""), JSON.stringify(stale));
    void body;
  } finally {
    if (draftIds.length) await db.delete(s.aiDrafts).where(inArray(s.aiDrafts.id, draftIds));
    await db.delete(s.products).where(eq(s.products.id, prod.id));
    await db.delete(s.aiSettings).where(eq(s.aiSettings.key, "prefs"));
    if (prefsBefore) await db.insert(s.aiSettings).values(prefsBefore);
  }
  if (failures) { console.error(`${failures} failed`); process.exit(1); }
  console.log("all passed");
  process.exit(0);
})();
