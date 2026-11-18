/**
 * Clicker designer as a service, and product deletion, against the live DB (isolated TEST- data, removed in finally):
 * every product holding a clicker config is a service; a deleted product takes its options and values with it.
 * The actions themselves sit behind requireAdmin, so this checks the data rules they rely on.
 * Run: npx tsx scripts/test-service-delete.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, like, sql } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  try {
    console.log("\nclicker products are services");
    const rows = await db.execute(sql`select count(*)::int as n from products p where p.is_service = false and exists (select 1 from product_options o where o.product_id = p.id and o.constraints ? 'clicker')`);
    assert("no clicker product is left as a normal product", (rows[0] as { n: number }).n === 0);

    console.log("\ndeleting a product removes its options and choices");
    const [p] = await db.insert(s.products).values({ slug: "test-svc-1", name: "test svc", category: "test" }).returning();
    assert("new products are not services", p.isService === false);
    const [o] = await db.insert(s.productOptions).values({ productId: p.id, type: "color", label: "Ball colour" }).returning();
    await db.insert(s.productOptionValues).values({ optionId: o.id, label: "Pink", value: "#f95d73" });
    await db.delete(s.products).where(eq(s.products.id, p.id));
    const left = await db.select().from(s.productOptionValues).where(eq(s.productOptionValues.optionId, o.id));
    assert("options and values are gone", left.length === 0 && (await db.select().from(s.productOptions).where(eq(s.productOptions.id, o.id))).length === 0);
  } finally {
    await db.delete(s.products).where(like(s.products.slug, "test-svc-%"));
  }
  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll service/delete checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
