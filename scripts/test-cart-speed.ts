/**
 * Cart read speed against the live DB (isolated TEST- data, removed in finally). The cart page used to read each line's
 * product one after another (several queries each), so a bulk order of 20 names took 20 times as long as one name. The
 * lines of one product must now cost one product read, run together, so the time hardly grows with the number of lines.
 * Run: npx tsx scripts/test-cart-speed.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { like } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

async function timed<T>(f: () => Promise<T>, runs = 3): Promise<{ ms: number; value: T }> {
  let best = Infinity, value!: T;
  for (let i = 0; i < runs; i++) {
    const t = performance.now();
    value = await f();
    best = Math.min(best, performance.now() - t);
  }
  return { ms: Math.round(best), value };
}

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { getCartLines, getOrCreateCart } = await import("../src/lib/cart");
  const { getProductById } = await import("../src/lib/catalog");

  const T = `TEST-SPEED-${Date.now()}`;
  const user = `${T}-u`;
  try {
    await db.insert(s.users).values({ id: user, name: "T", email: `${user}@test.local`, emailVerified: true, role: "customer" });
    const [p] = await db.insert(s.products).values({ slug: `${T}-prod`, name: `${T} Clicker`, basePriceCents: 15000, status: "published" }).returning();
    await db.insert(s.productPhotos).values({ productId: p.id, s3Key: "products/test-speed.jpg", alt: "x", sort: 0 });
    const [name] = await db.insert(s.productOptions).values({ productId: p.id, type: "text", label: "Name", required: false, priceDeltaCents: 0, constraints: { maxLen: 12 }, sort: 0 }).returning();
    const colours: string[] = [];
    for (let o = 0; o < 3; o++) {
      const [c] = await db.insert(s.productOptions).values({ productId: p.id, type: "color", label: `Part ${o} colour`, required: true, priceDeltaCents: 0, constraints: {}, sort: o + 1 }).returning();
      const vs = await db.insert(s.productOptionValues).values(["Yellow", "Cream", "Black", "Blue"].map((label, i) => ({ optionId: c.id, label, value: `#00000${i}`, sort: i }))).returning();
      colours.push(c.id, vs[0].id);
    }
    const cartId = await getOrCreateCart(user);
    const line = (i: number) => ({
      cartId, productId: p.id, qty: 1, unitPriceCents: 15000,
      config: { [name.id]: { text: `Name${i}` }, [colours[0]]: { valueId: colours[1] }, [colours[2]]: { valueId: colours[3] }, [colours[4]]: { valueId: colours[5] } },
    });

    console.log("\none line vs twenty lines of the same product");
    await db.insert(s.cartItems).values(line(0));
    const one = await timed(() => getCartLines(user));
    await db.insert(s.cartItems).values(Array.from({ length: 19 }, (_, i) => line(i + 1)));
    const twenty = await timed(() => getCartLines(user));
    console.log(`    1 line: ${one.ms} ms, 20 lines: ${twenty.ms} ms`);
    assert("the lines come back complete and correct", twenty.value.length === 20 && twenty.value.every((l) => l.productName === `${T} Clicker` && l.summary.some((x) => x.label === "Part 0 colour" && x.value === "Yellow") && l.unitPriceCents === 15000 && l.lineTotalCents === 15000), JSON.stringify(twenty.value[0]?.summary));
    assert("twenty lines cost about the same as one (not twenty times)", twenty.ms < one.ms * 2 + 150, `${one.ms} -> ${twenty.ms}`);

    console.log("\nreading a product");
    const prod = await timed(() => getProductById(p.id));
    console.log(`    getProductById: ${prod.ms} ms`);
    assert("the product has its photo, options and values, in order", prod.value?.photos.length === 1 && prod.value.options.length === 4 && prod.value.options.slice(1).every((o) => o.values.map((v) => v.label).join() === "Yellow,Cream,Black,Blue") && prod.value.options.map((o) => o.label).join() === `Name,Part 0 colour,Part 1 colour,Part 2 colour`);
  } finally {
    await db.delete(s.carts).where(like(s.carts.userId, "TEST-SPEED-%"));
    await db.delete(s.products).where(like(s.products.slug, "TEST-SPEED-%"));
    await db.delete(s.users).where(like(s.users.id, "TEST-SPEED-%"));
  }

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll cart speed checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
