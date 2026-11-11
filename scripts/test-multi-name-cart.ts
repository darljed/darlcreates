/**
 * Bulk order of names: `addManyToCart` against the live DB (isolated TEST- data, removed in finally). Several names with
 * their own fonts, name colours and part colours become separate cart lines; one bad name adds nothing; limits hold.
 * Run: npx tsx scripts/test-multi-name-cart.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, like } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { addManyToCart, MAX_NAMES_PER_ADD } = await import("../src/lib/cart-service");

  const T = `TEST-MN-${Date.now()}`;
  const user = `${T}-u`;
  try {
    await db.insert(s.users).values({ id: user, name: "T", email: `${user}@test.local`, emailVerified: true, role: "customer" });
    const [p] = await db.insert(s.products).values({ slug: `${T}-prod`, name: `${T} Clicker`, basePriceCents: 15000, status: "published", stlKey: "models/test.3mf" }).returning();
    const slot = {
      position: [0, 0, 0], normal: [0, 0, 1], up: [0, 1, 0], maxWidth: 30, height: 6, maxHeight: 9, depth: 1.2, sink: 0.4, font: "bold", fonts: ["bold", "chunky"],
      nameColors: [{ label: "Red", hex: "#FF0000", filament: 3 }, { label: "Blue", hex: "#0000FF", filament: 4 }],
    };
    const [name] = await db.insert(s.productOptions).values({ productId: p.id, type: "text", label: "Name", required: true, priceDeltaCents: 0, constraints: { maxLen: 12, pattern: "^[A-Za-z0-9 ]*$", slot }, sort: 0 }).returning();
    const [ball] = await db.insert(s.productOptions).values({ productId: p.id, type: "color", label: "Ball colour", required: true, priceDeltaCents: 0, constraints: { partName: "dc-slot-0" }, sort: 1 }).returning();
    const [size] = await db.insert(s.productOptions).values({ productId: p.id, type: "size", label: "Size", required: false, priceDeltaCents: 0, constraints: {}, sort: 2 }).returning();
    const [yellow, black] = await db.insert(s.productOptionValues).values([
      { optionId: ball.id, label: "Yellow", value: "#F4EE2A", sort: 0 }, { optionId: ball.id, label: "Black", value: "#000000", sort: 1 },
    ]).returning();
    const [large] = await db.insert(s.productOptionValues).values([{ optionId: size.id, label: "Large", value: "L", priceDeltaCents: 2500, sort: 0 }]).returning();

    const row = (text: string, o: { font?: string; nameColor?: string; ball?: string; qty?: number; size?: boolean } = {}) => ({
      qty: o.qty ?? 1,
      selection: {
        [name.id]: { text, ...(o.font ? { font: o.font } : {}), ...(o.nameColor ? { nameColor: o.nameColor } : {}) },
        [ball.id]: { valueId: o.ball ?? yellow.id },
        ...(o.size ? { [size.id]: { valueId: large.id } } : {}),
      },
    });
    const lines = async () => {
      const [cart] = await db.select().from(s.carts).where(eq(s.carts.userId, user));
      return cart ? db.select().from(s.cartItems).where(eq(s.cartItems.cartId, cart.id)) : [];
    };

    console.log("\nthree names, each with its own colours");
    const ok = await addManyToCart(user, {
      productId: p.id,
      rows: [row("Maria", { nameColor: "#FF0000", ball: black.id }), row("Jose", { font: "chunky", qty: 3, size: true }), row("Ana", { nameColor: "#0000FF" })],
    });
    assert("added 3 lines", ok.ok && ok.added === 3, JSON.stringify(ok));
    const l1 = await lines();
    assert("three separate cart lines", l1.length === 3);
    const byName = (n: string) => l1.find((l) => (l.config as Record<string, { text?: string }>)[name.id]?.text === n)!;
    assert("each keeps its own name colour, font, part colour and quantity", (() => {
      const m = byName("Maria").config as Record<string, { nameColor?: string; valueId?: string }>, j = byName("Jose"), a = byName("Ana").config as Record<string, { nameColor?: string }>;
      return m[name.id].nameColor === "#FF0000" && m[ball.id].valueId === black.id && (j.config as Record<string, { font?: string }>)[name.id].font === "chunky" && j.qty === 3 && a[name.id].nameColor === "#0000FF";
    })());
    assert("prices are worked out per line on the server (Jose has the +₱25 size)", byName("Maria").unitPriceCents === 15000 && byName("Jose").unitPriceCents === 17500 && byName("Ana").unitPriceCents === 15000);

    console.log("\none bad name adds nothing");
    const before = (await lines()).length;
    const bad = await addManyToCart(user, { productId: p.id, rows: [row("Pedro"), row("Bad!Name"), row("Luis")] });
    assert("refused, naming which name is wrong", !bad.ok && /^Name 2:/.test(bad.error), JSON.stringify(bad));
    assert("and the valid names around it were NOT added", (await lines()).length === before);
    const missing = await addManyToCart(user, { productId: p.id, rows: [{ qty: 1, selection: { [name.id]: { text: "Rita" } } }] });
    assert("a missing required colour is refused", !missing.ok && /Ball colour is required/.test(missing.error), JSON.stringify(missing));

    console.log("\nlimits and tampering");
    assert("more than the limit is refused", !(await addManyToCart(user, { productId: p.id, rows: Array.from({ length: MAX_NAMES_PER_ADD + 1 }, (_, i) => row(`N${i}`)) })).ok);
    assert("no rows is refused", !(await addManyToCart(user, { productId: p.id, rows: [] })).ok);
    assert("quantity above 99 is refused", !(await addManyToCart(user, { productId: p.id, rows: [row("Zed", { qty: 100 })] })).ok);
    assert("exactly the limit is accepted", (await addManyToCart(user, { productId: p.id, rows: Array.from({ length: MAX_NAMES_PER_ADD }, (_, i) => row(`N${i}`)) })).ok);
    const forged = await addManyToCart(user, { productId: p.id, rows: [row("Kim", { nameColor: "#123456" }), row("Lee", { font: "script" })] });
    assert("a name colour or font the product does not offer is dropped, not stored", forged.ok && await (async () => {
      const all = await lines();
      const k = all.find((l) => (l.config as Record<string, { text?: string }>)[name.id]?.text === "Kim")!.config as Record<string, { nameColor?: string; font?: string }>;
      const l = all.find((l2) => (l2.config as Record<string, { text?: string }>)[name.id]?.text === "Lee")!.config as Record<string, { nameColor?: string; font?: string }>;
      return k[name.id].nameColor === undefined && l[name.id].font === undefined;
    })());
    const [draft] = await db.insert(s.products).values({ slug: `${T}-draft`, name: `${T} Draft`, basePriceCents: 100, status: "draft" }).returning();
    assert("an unpublished product cannot be added", !(await addManyToCart(user, { productId: draft.id, rows: [row("Zed")] })).ok);
  } finally {
    // carts first (their lines reference the product); the prefix also sweeps up leftovers of an earlier crashed run
    await db.delete(s.carts).where(like(s.carts.userId, "TEST-MN-%"));
    await db.delete(s.products).where(like(s.products.slug, "TEST-MN-%"));
    await db.delete(s.users).where(like(s.users.id, "TEST-MN-%"));
  }

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll multi-name cart checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
