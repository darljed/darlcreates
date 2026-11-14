/**
 * Seed sample catalog data for Darl Creates. Idempotent-ish: clears sample
 * products by slug first, then inserts. Run: npx tsx scripts/seed.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { inArray } from "drizzle-orm";

const SAMPLE_SLUGS = ["phone-stand", "name-keychain", "desk-clicker"];

async function main() {
  // Import after dotenv populated process.env (db reads DATABASE_URL at load).
  const { db } = await import("../src/db");
  const { products, productOptions, productOptionValues } = await import(
    "../src/db/schema"
  );
  // Clear prior samples (cascades to options/values/photos).
  const existing = await db
    .select({ id: products.id })
    .from(products)
    .where(inArray(products.slug, SAMPLE_SLUGS));
  if (existing.length) {
    await db.delete(products).where(inArray(products.slug, SAMPLE_SLUGS));
    console.log(`Cleared ${existing.length} existing sample product(s)`);
  }

  // 1) Phone stand — color + size
  const [stand] = await db
    .insert(products)
    .values({
      slug: "phone-stand",
      name: "Minimalist Phone Stand",
      description:
        "A sleek desk stand that holds your phone at the perfect angle for video calls and watching. Sturdy, lightweight, and fully customizable.",
      category: "stands",
      basePriceCents: 18000, // ₱180.00
      status: "published",
    })
    .returning();

  const [standColor] = await db
    .insert(productOptions)
    .values({
      productId: stand.id,
      type: "color",
      label: "Color",
      required: true,
      priceDeltaCents: 0,
      constraints: {},
      sort: 0,
    })
    .returning();
  await db.insert(productOptionValues).values([
    { optionId: standColor.id, label: "Hot Pink", value: "#ff2d78", sort: 0 },
    { optionId: standColor.id, label: "Cyan", value: "#22d3ee", sort: 1 },
    { optionId: standColor.id, label: "Lime", value: "#bef264", sort: 2 },
    { optionId: standColor.id, label: "Matte Black", value: "#1f2937", sort: 3 },
  ]);

  const [standSize] = await db
    .insert(productOptions)
    .values({
      productId: stand.id,
      type: "size",
      label: "Size",
      required: true,
      priceDeltaCents: 0,
      constraints: {},
      sort: 1,
    })
    .returning();
  await db.insert(productOptionValues).values([
    { optionId: standSize.id, label: "Regular", value: "reg", priceDeltaCents: 0, sort: 0 },
    { optionId: standSize.id, label: "Large (tablets)", value: "lg", priceDeltaCents: 7000, sort: 1 },
  ]);

  // 2) Name keychain — text + color
  const [keychain] = await db
    .insert(products)
    .values({
      slug: "name-keychain",
      name: "Custom Name Keychain",
      description:
        "Your name (or anyone's) as a durable 3D-printed keychain. Great gifts, giveaways, and bag tags.",
      category: "keychains",
      basePriceCents: 12000, // ₱120.00
      status: "published",
    })
    .returning();

  await db.insert(productOptions).values({
    productId: keychain.id,
    type: "text",
    label: "Name / Text",
    required: true,
    priceDeltaCents: 0,
    constraints: { maxLen: 12, pattern: "^[A-Za-z0-9 ]*$" },
    sort: 0,
  });
  const [keyColor] = await db
    .insert(productOptions)
    .values({
      productId: keychain.id,
      type: "color",
      label: "Color",
      required: true,
      priceDeltaCents: 0,
      constraints: {},
      sort: 1,
    })
    .returning();
  await db.insert(productOptionValues).values([
    { optionId: keyColor.id, label: "Hot Pink", value: "#ff2d78", sort: 0 },
    { optionId: keyColor.id, label: "Cyan", value: "#22d3ee", sort: 1 },
    { optionId: keyColor.id, label: "Lime", value: "#bef264", sort: 2 },
  ]);

  // 3) Desk clicker — color, optional engraved text (+₱30)
  const [clicker] = await db
    .insert(products)
    .values({
      slug: "desk-clicker",
      name: "Fidget Desk Clicker",
      description:
        "A satisfying tactile clicker for your desk. Optional engraved text on the top.",
      category: "toys",
      basePriceCents: 15000, // ₱150.00
      status: "published",
    })
    .returning();

  const [clickColor] = await db
    .insert(productOptions)
    .values({
      productId: clicker.id,
      type: "color",
      label: "Color",
      required: true,
      priceDeltaCents: 0,
      constraints: {},
      sort: 0,
    })
    .returning();
  await db.insert(productOptionValues).values([
    { optionId: clickColor.id, label: "Cyan", value: "#22d3ee", sort: 0 },
    { optionId: clickColor.id, label: "Hot Pink", value: "#ff2d78", sort: 1 },
  ]);
  await db.insert(productOptions).values({
    productId: clicker.id,
    type: "text",
    label: "Engraved text (optional)",
    required: false,
    priceDeltaCents: 3000, // +₱30.00 if chosen
    constraints: { maxLen: 10, pattern: "^[A-Za-z0-9 ]*$" },
    sort: 1,
  });

  console.log("Seeded 3 sample products with customization schemas.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
