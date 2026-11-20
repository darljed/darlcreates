/**
 * Admin agent: the tool registry, read tools (and that they leak no customer details), write-tool previews, the agent loop
 * with a scripted fake model (writes become proposals and change NOTHING), the page context, and the approval guards
 * (stale data, double use, reject). Applying itself runs through the real Server Actions and is checked in the browser.
 * Uses the database. Run: npx tsx scripts/test-agent.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray } from "drizzle-orm";

let failures = 0;
const assert = (n: string, c: boolean, extra = "") => { if (!c) { failures++; console.error(`  ✗ ${n} ${extra}`); } else console.log(`  ✓ ${n}`); };
const PREFIX = "TEST-AGENT-";

(async () => {
  process.env.OPENROUTER_API_KEY ||= "test-key-not-used";
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { TOOLS, toolByName } = await import("../src/lib/ai/agent/tools");
  const { runAgent, toolSpecs, SYSTEM, guardClaims } = await import("../src/lib/ai/agent/run");
  const { applyProposal, rejectProposal, pendingProposals, canon } = await import("../src/lib/ai/agent/apply");
  const { describePage } = await import("../src/lib/ai/agent/page-context");
  const { getAiPrefs, saveAiPrefs } = await import("../src/lib/ai/settings");

  const [u] = await db.select({ id: s.users.id, email: s.users.email, name: s.users.name }).from(s.users).limit(1);
  const draftIds: string[] = [];
  const prefsBefore = (await db.select().from(s.aiSettings).where(eq(s.aiSettings.key, "prefs")))[0];
  const [p] = await db.insert(s.products).values({ slug: `${PREFIX}${Date.now()}`, name: `${PREFIX}Cube`, description: "A cube.", category: "test", basePriceCents: 10000, status: "draft" }).returning();

  try {
    // ---- registry
    console.log("registry");
    assert("tool names are unique", new Set(TOOLS.map((t) => t.name)).size === TOOLS.length);
    const specs = toolSpecs();
    assert("every tool has a JSON schema object", specs.every((x) => (x.function.parameters as { type?: string }).type === "object" && !("$schema" in x.function.parameters)));
    assert("read tools run, write tools preview + apply", TOOLS.every((t) => (t.kind === "read" ? Boolean(t.run) : Boolean(t.preview && t.apply))));
    const banned = ["verify", "refund", "delete", "role", "transition", "status_change"];
    assert("no tool for payments, refunds, deletes, users or order status", !TOOLS.some((t) => banned.some((b) => t.name.includes(b))));
    assert("system prompt says the agent cannot change anything itself", SYSTEM.includes("cannot change anything yourself") && SYSTEM.includes("not instructions"));

    // ---- read tools
    console.log("read tools");
    const lp = (await toolByName("list_products")!.run!({} as never)) as { total: number; products: { id: string; name: string }[] };
    assert("list_products finds the test product", lp.products.some((x) => x.id === p.id) || lp.total > 30);
    const found = (await toolByName("list_products")!.run!({ query: PREFIX } as never)) as { products: { id: string }[] };
    assert("list_products filters by name", found.products.length === 1 && found.products[0].id === p.id);
    const gp = (await toolByName("get_product")!.run!({ productId: p.id } as never)) as { name: string; pricePesos: number; costing: unknown };
    assert("get_product returns the product in pesos", gp.name === `${PREFIX}Cube` && gp.pricePesos === 100 && gp.costing !== undefined);
    assert("get_product with an unknown id is an error value, not a throw", "error" in ((await toolByName("get_product")!.run!({ productId: "00000000-0000-4000-8000-000000000000" } as never)) as object));
    const lo = JSON.stringify(await toolByName("list_orders")!.run!({ limit: 30 } as never));
    assert("list_orders leaks no customer email or name", !lo.includes(u.email) && !(u.name && u.name.length > 3 && lo.includes(u.name)));
    const [anyOrder] = await db.select({ id: s.orders.id }).from(s.orders).limit(1);
    if (anyOrder) {
      const go = JSON.stringify(await toolByName("get_order")!.run!({ orderId: anyOrder.id } as never));
      assert("get_order leaks no address, email or proof key", !go.toLowerCase().includes("shipaddress") && !go.includes(u.email) && !go.includes("proofKey"));
    }
    assert("sales_summary runs", typeof (await toolByName("sales_summary")!.run!({} as never)) === "object");
    assert("list_parts runs", typeof (await toolByName("list_parts")!.run!({ lowStockOnly: false } as never)) === "object");

    // ---- previews
    console.log("write previews");
    const up = toolByName("update_product")!;
    const pv = (await up.preview!({ productId: p.id, pricePesos: 150, description: "A better cube." } as never)) as { summary: string; before: Record<string, unknown>; after: Record<string, unknown> };
    assert("update_product preview lists only what changes", Object.keys(pv.after).sort().join() === "description,pricePesos" && pv.before.pricePesos === 100 && pv.after.pricePesos === 150);
    assert("update_product with no change is refused", "error" in ((await up.preview!({ productId: p.id, pricePesos: 100 } as never)) as object));
    assert("update_product on an unknown id is refused", "error" in ((await up.preview!({ productId: "00000000-0000-4000-8000-000000000000", pricePesos: 5 } as never)) as object));
    assert("update_product args are validated (negative price)", !up.params.safeParse({ productId: p.id, pricePesos: -5 }).success && !up.params.safeParse({ productId: "nope" }).success);
    const cp = (await toolByName("create_product")!.preview!({ name: "New thing", description: "x", category: "Desk", pricePesos: 99 } as never)) as { after: Record<string, unknown>; before: unknown };
    assert("create_product previews a DRAFT with a lower-case category", cp.after.status === "draft" && cp.after.category === "desk" && cp.before === null);
    assert("set_product_costing refuses an unknown part", "error" in ((await toolByName("set_product_costing")!.preview!({ productId: p.id, printCostPesos: 5, bom: [{ partId: "00000000-0000-4000-8000-000000000000", qty: 1 }] } as never)) as object));
    assert("adjust_stock needs exactly one of delta / setTo", !toolByName("adjust_stock")!.params.safeParse({ partId: p.id, reason: "x" }).success && !toolByName("adjust_stock")!.params.safeParse({ partId: p.id, delta: 1, setTo: 2, reason: "x" }).success);
    assert("create_offsite_sale refuses an unknown product", "error" in ((await toolByName("create_offsite_sale")!.preview!({ productId: "00000000-0000-4000-8000-000000000000", quantity: 1, pricePerItemPesos: 10 } as never)) as object));

    // ---- page context
    console.log("page context");
    const pc = await describePage(`/admin/products/${p.id}`, "");
    assert("product page context carries the id and name", pc.label === "Product page" && pc.text.includes(p.id) && pc.text.includes(`${PREFIX}Cube`));
    assert("an unknown record does not crash the context", (await describePage("/admin/products/00000000-0000-4000-8000-000000000000", "")).text.length > 0);
    assert("list pages get a plain description", (await describePage("/admin/inventory", "?x=1")).label === "Inventory");
    assert("a made-up path is just 'Admin'", (await describePage("/admin/zzz", "")).label === "Admin");

    // ---- the loop with a scripted model
    console.log("agent loop (fake model)");
    await saveAiPrefs({ copyProvider: "openrouter", copyModel: "fake/model", agentProvider: "openrouter", agentModel: "" }, u.id);
    type Chat = typeof import("../src/lib/ai/providers").chat;
    const seen: unknown[] = [];
    let n = 0;
    const fake: Chat = async (o) => {
      seen.push(o.messages);
      n++;
      if (n === 1) return { ok: true, text: "", costUsd: 0.001, toolCalls: [{ id: "c1", type: "function", function: { name: "get_product", arguments: JSON.stringify({ productId: p.id }) } }] };
      if (n === 2) return { ok: true, text: "", costUsd: 0.001, toolCalls: [{ id: "c2", type: "function", function: { name: "update_product", arguments: JSON.stringify({ productId: p.id, pricePesos: 175 }) } }, { id: "c3", type: "function", function: { name: "nope_tool", arguments: "{}" } }, { id: "c4", type: "function", function: { name: "update_product", arguments: "not json" } }] };
      return { ok: true, text: "I proposed a price change. It is waiting for your approval.", toolCalls: [], costUsd: 0.001 };
    };
    const r = await runAgent({ messages: [{ role: "user", content: "make this ₱175" }], path: `/admin/products/${p.id}`, search: "", actorId: u.id, chatFn: fake });
    assert("the loop returns the final text", r.ok && r.reply.includes("waiting for your approval"));
    if (!r.ok) throw new Error(r.error);
    assert("one proposal, with a before and after", r.proposals.length === 1 && r.proposals[0].before?.pricePesos === 100 && r.proposals[0].after.pricePesos === 175);
    assert("steps and cost are reported", r.steps.join() === "get_product,update_product" && Math.abs(r.costUsd - 0.003) < 1e-9);
    const [still] = await db.select({ price: s.products.basePriceCents }).from(s.products).where(eq(s.products.id, p.id));
    assert("NOTHING was changed by the model's write call", still.price === 10000);
    draftIds.push(r.proposals[0].id);
    const sys = JSON.stringify((seen[0] as { role: string; content: string }[])[0]);
    assert("the page context reached the model", sys.includes(p.id) && sys.includes("Product page"));
    const second = JSON.stringify(seen[2]);
    assert("the model was told the write is only proposed", second.includes("NOT been applied") && second.includes("Unknown tool nope_tool") && second.includes("Invalid arguments"));
    const noKeyPrefs = await runAgent({ messages: [{ role: "user", content: "hi" }], path: "/admin", search: "", actorId: u.id, chatFn: async () => ({ ok: false, error: "provider down" }) });
    assert("a provider error comes back as an error", !noKeyPrefs.ok && noKeyPrefs.error === "provider down");
    const forever: Chat = async () => ({ ok: true, text: "", costUsd: 0, toolCalls: [{ id: `x${Math.random()}`, type: "function", function: { name: "sales_summary", arguments: "{}" } }] });
    const capped = await runAgent({ messages: [{ role: "user", content: "loop" }], path: "/admin", search: "", actorId: u.id, chatFn: forever });
    assert("the loop stops at the step limit", capped.ok && capped.steps.length === 8);

    assert("a claim of a proposal with none made is flagged", guardClaims("I've proposed a price change. It is waiting for your approval.", 0).includes("did not actually create") && guardClaims("I've proposed a price change.", 1) === "I've proposed a price change." && guardClaims("The price is 250 pesos.", 0) === "The price is 250 pesos.");

    // ---- approval guards
    console.log("approval guards");
    const back = (await db.select({ p: s.aiDrafts.payload }).from(s.aiDrafts).where(eq(s.aiDrafts.id, r.proposals[0].id)))[0].p as { preview: { before: unknown } };
    const fresh = (await toolByName("update_product")!.preview!({ productId: p.id, pricePesos: 175 } as never)) as { before: unknown };
    assert("the stored 'before' (jsonb reorders keys) equals the live one", canon(back.preview.before) === canon(fresh.before) && canon({ b: 1, a: [{ d: 1, c: 2 }] }) === canon({ a: [{ c: 2, d: 1 }], b: 1 }));
    assert("the proposal is waiting", (await pendingProposals()).some((x) => x.id === draftIds[0]));
    await db.update(s.products).set({ basePriceCents: 12345 }).where(eq(s.products.id, p.id)); // someone edits the price meanwhile
    const stale = await applyProposal(draftIds[0], u.id);
    assert("a proposal made on old data is refused", !stale.ok && /changed since/.test(stale.ok ? "" : stale.error), JSON.stringify(stale));
    const [after] = await db.select({ price: s.products.basePriceCents }).from(s.products).where(eq(s.products.id, p.id));
    assert("the refused proposal did not overwrite the newer price", after.price === 12345);
    const again = await applyProposal(draftIds[0], u.id);
    assert("a failed proposal cannot be tried again", !again.ok);
    // reject
    await db.update(s.products).set({ basePriceCents: 10000 }).where(eq(s.products.id, p.id));
    const r2 = await runAgent({ messages: [{ role: "user", content: "again" }], path: `/admin/products/${p.id}`, search: "", actorId: u.id, chatFn: (() => { let k = 0; return (async () => (++k === 1 ? { ok: true as const, text: "", costUsd: 0, toolCalls: [{ id: "d1", type: "function" as const, function: { name: "update_product", arguments: JSON.stringify({ productId: p.id, name: `${PREFIX}Cube 2` }) } }] } : { ok: true as const, text: "done", toolCalls: [], costUsd: 0 })) as Chat; })() });
    if (!r2.ok) throw new Error(r2.error);
    draftIds.push(r2.proposals[0].id);
    assert("reject works once", (await rejectProposal(r2.proposals[0].id)).ok && !(await rejectProposal(r2.proposals[0].id)).ok);
    assert("a rejected proposal cannot be applied", !(await applyProposal(r2.proposals[0].id, u.id)).ok);
    // expiry
    const [old] = await db.insert(s.aiDrafts).values({ kind: "agent", title: "old", payload: { tool: "update_product", args: { productId: p.id, pricePesos: 1 }, preview: { summary: "x", before: null, after: {} } }, createdAt: new Date(Date.now() - 25 * 3600_000) }).returning({ id: s.aiDrafts.id });
    draftIds.push(old.id);
    const ex = await applyProposal(old.id, u.id);
    assert("a day-old proposal is expired", !ex.ok && /day old|no longer/.test(ex.ok ? "" : ex.error), JSON.stringify(ex));
    assert("an unknown proposal id is refused", !(await applyProposal("00000000-0000-4000-8000-000000000000", u.id)).ok);
  } finally {
    if (draftIds.length) await db.delete(s.aiDrafts).where(inArray(s.aiDrafts.id, draftIds));
    await db.delete(s.aiDrafts).where(eq(s.aiDrafts.title, "old"));
    await db.delete(s.products).where(eq(s.products.id, p.id));
    await db.delete(s.aiSettings).where(eq(s.aiSettings.key, "prefs"));
    if (prefsBefore) await db.insert(s.aiSettings).values(prefsBefore);
    void getAiPrefs;
  }
  if (failures) { console.error(`${failures} failed`); process.exit(1); }
  console.log("all passed");
  process.exit(0);
})();
