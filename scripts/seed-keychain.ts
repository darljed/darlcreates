/**
 * Creates the name keychain designer product (a published service) with the default settings, so /keychain works.
 * Idempotent: does nothing if a keychain product already exists. Same result as Admin -> Products -> a product -> "Make this a
 * keychain product". Run: npx tsx scripts/seed-keychain.ts (uses DATABASE_URL from .env.local; refuses to run in production).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { sql } from "drizzle-orm";
import { refreshStorefrontCache } from "./lib/revalidate";

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("never run seed tooling in production");
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { DEFAULT_KEYCHAIN_CONFIG } = await import("../src/lib/keychain/spec");
  const existing = await db.select({ id: s.productOptions.id }).from(s.productOptions).where(sql`${s.productOptions.constraints} ? 'keychain'`).limit(1);
  if (existing.length) {
    console.log("a keychain product already exists");
    process.exit(0);
  }
  const [p] = await db.insert(s.products).values({
    slug: "custom-name-keychain", name: "Custom Name Keychain", description: "A 3D-printed name keychain made to order. Pick the style, font, icon, colours and thickness.",
    category: "keychains", basePriceCents: 12900, status: "published", isService: true,
  }).returning();
  await db.insert(s.productOptions).values({ productId: p.id, type: "text", label: "Your keychain", required: true, priceDeltaCents: 0, constraints: { maxLen: 20, keychain: DEFAULT_KEYCHAIN_CONFIG }, sort: 0 });
  await refreshStorefrontCache(["custom-name-keychain"]);
  console.log("created /products/custom-name-keychain (open /keychain)");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
