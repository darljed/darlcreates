/**
 * Customer image personalization: pure rules + the real addToCart service against live DB + S3.
 * Isolated TEST- data, cleaned up in finally. Run: npx tsx scripts/test-customer-images.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

// Minimal valid file headers (only the magic bytes matter to the sniffer).
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.from([0x10, 0, 0, 0]), Buffer.from("WEBP")]);
const EXE = Buffer.from("MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00", "latin1");

async function main() {
  const up = await import("../src/lib/uploads");
  const pricing = await import("../src/lib/pricing");
  const storage = await import("../src/lib/storage");
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const { addToCart } = await import("../src/lib/cart-service");

  console.log("\npure rules");
  assert("sniff jpeg", up.sniffImageType(JPG) === "jpeg");
  assert("sniff png", up.sniffImageType(PNG) === "png");
  assert("sniff webp", up.sniffImageType(WEBP) === "webp");
  assert("an .exe is not an image", up.sniffImageType(EXE) === null);
  assert("a zip is not an image", up.sniffImageType(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0, 0, 0, 0, 0, 0, 0])) === null);
  assert("html is not an image", up.sniffImageType(Buffer.from("<html><body>")) === null);
  assert("svg (script-capable) is not an allowed upload", up.validateUpload("customer", "x.svg", "image/svg+xml", 100) !== null);
  assert("gif not allowed", up.validateUpload("customer", "x.gif", "image/gif", 100) !== null);
  assert("png accepted", up.validateUpload("customer", "x.png", "image/png", 100) === null);
  assert("6MB customer image refused", up.validateUpload("customer", "x.png", "image/png", 6 * 1024 * 1024) !== null);
  assert("customer kind needs an image content-type", up.validateUpload("customer", "x.png", "text/html", 100) !== null);
  assert("customer key is scoped to the user", storage.buildKey("customer", "a.png", "user_1").startsWith("customer/user_1/"));
  assert("own key accepted", up.isOwnCustomerKey("user_1", "customer/user_1/abc-a.png"));
  assert("someone else's key refused", !up.isOwnCustomerKey("user_1", "customer/user_2/abc-a.png"));
  assert("prefix-sibling user id refused (user_1 vs user_10)", !up.isOwnCustomerKey("user_1", "customer/user_10/abc-a.png"));
  assert("payment proof key refused", !up.isOwnCustomerKey("user_1", "proof/abc.png"));
  assert("catalog photo key refused", !up.isOwnCustomerKey("user_1", "photos/abc.png"));
  assert("path traversal refused", !up.isOwnCustomerKey("user_1", "customer/user_1/../user_2/a.png"));

  const options = [
    { id: "c", type: "color" as const, label: "Color", required: true, priceDeltaCents: 0, constraints: {}, values: [{ id: "v1", label: "Red", value: "#f00", priceDeltaCents: 0 }] },
    { id: "t", type: "text" as const, label: "Name", required: false, priceDeltaCents: 0, constraints: { maxLen: 10 }, values: [] },
    { id: "i", type: "image" as const, label: "Logo", required: false, priceDeltaCents: 500, constraints: {}, values: [] },
  ];
  const own = (k: string) => up.isOwnCustomerKey("u1", k);
  const n1 = pricing.normalizeSelection(options, { c: { valueId: "v1" }, i: { imageKey: "customer/u1/a.png" } }, own);
  assert("normalize keeps a valid own image", n1.errors.length === 0 && n1.config.i?.imageKey === "customer/u1/a.png");
  const n2 = pricing.normalizeSelection(options, { c: { valueId: "v1" }, i: { imageKey: "customer/u2/a.png" } }, own);
  assert("normalize rejects another user's image", n2.errors.length === 1 && !n2.config.i);
  const n3 = pricing.normalizeSelection(options, { c: { valueId: "v1", imageKey: "proof/secret.png" }, t: { text: " Hi ", imageKey: "proof/secret.png" } }, own);
  assert("imageKey smuggled onto a color/text option is dropped", n3.config.c?.imageKey === undefined && n3.config.t?.imageKey === undefined && n3.config.t?.text === "Hi");
  const n4 = pricing.normalizeSelection(options, { zzz: { imageKey: "customer/u1/a.png" }, c: { valueId: "v1" } }, own);
  assert("unknown option ids are dropped", !("zzz" in n4.config));

  if (!storage.isStorageConfigured()) { console.error("  ✗ storage not configured"); failures++; }
  else {
    console.log("\naddToCart (real DB + S3)");
    const T = `TEST-IMG-${Date.now()}`;
    const u1 = `${T}-u1`, u2 = `${T}-u2`;
    const keys: string[] = [];
    let productId = "";
    async function put(userId: string, name: string, body: Buffer, ct: string) {
      const key = storage.buildKey("customer", name, userId);
      const r = await fetch(await storage.presignUpload(key, ct, 60), { method: "PUT", headers: { "Content-Type": ct }, body });
      if (!r.ok) throw new Error("put failed " + r.status);
      keys.push(key);
      return key;
    }
    try {
      await db.insert(s.users).values([u1, u2].map((id) => ({ id, name: id, email: `${id}@test.local`, emailVerified: true, role: "customer" as const })));
      const [p] = await db.insert(s.products).values({ slug: `${T.toLowerCase()}-p`, name: `${T} P`, basePriceCents: 10000, status: "published" }).returning();
      productId = p.id;
      const [oc] = await db.insert(s.productOptions).values({ productId, type: "color", label: "Color", required: true, sort: 0 }).returning();
      const [ov] = await db.insert(s.productOptionValues).values({ optionId: oc.id, label: "Red", value: "#f00" }).returning();
      const [oi] = await db.insert(s.productOptions).values({ productId, type: "image", label: "Logo", required: true, priceDeltaCents: 500, sort: 1 }).returning();
      const [ot] = await db.insert(s.productOptions).values({ productId, type: "text", label: "Name", required: false, constraints: { maxLen: 8 }, sort: 2 }).returning();

      const good = await put(u1, "logo.png", PNG, "image/png");
      const evil = await put(u1, "evil.png", EXE, "image/png");        // not an image, despite name + type
      const foreign = await put(u2, "theirs.png", PNG, "image/png");   // belongs to u2
      const sel = (imageKey?: string, extra: object = {}) => ({ [oc.id]: { valueId: ov.id }, [oi.id]: { imageKey }, ...extra });

      const ok = await addToCart(u1, { productId, qty: 1, selection: sel(good) });
      assert("valid own PNG is accepted", ok.ok, ok.ok ? "" : ok.error);
      const rows = await db.select().from(s.cartItems).where(eq(s.cartItems.productId, productId));
      assert("image option price delta applied (10000 + 500)", rows[0]?.unitPriceCents === 10500, `${rows[0]?.unitPriceCents}`);
      assert("cart item stores the image key", rows[0]?.imageKey === good);

      const r1 = await addToCart(u1, { productId, qty: 1, selection: sel() });
      assert("required image missing => refused", !r1.ok);
      const r2 = await addToCart(u1, { productId, qty: 1, selection: sel(evil) });
      assert("non-image renamed .png => refused (magic bytes)", !r2.ok && /JPEG, PNG or WebP/i.test(r2.ok ? "" : r2.error), r2.ok ? "" : r2.error);
      const r3 = await addToCart(u1, { productId, qty: 1, selection: sel(foreign) });
      assert("another customer's file => refused", !r3.ok);
      const r4 = await addToCart(u1, { productId, qty: 1, selection: sel("customer/" + u1 + "/does-not-exist.png") });
      assert("key that doesn't exist in S3 => refused", !r4.ok);
      const r5 = await addToCart(u1, { productId, qty: 1, selection: sel("proof/some-payment-proof.png") });
      assert("payment-proof key => refused", !r5.ok);
      const cartRows = await db.select().from(s.cartItems).where(eq(s.cartItems.productId, productId));
      assert("only the one valid item landed in the cart", cartRows.length === 1);

      const smuggle = await addToCart(u1, { productId, qty: 1, selection: sel(good, { [ot.id]: { text: "Hi", imageKey: foreign }, bogus: { imageKey: foreign } }) });
      assert("smuggled keys are accepted-but-stripped, not attached", smuggle.ok);
      const all = await db.select().from(s.cartItems).where(eq(s.cartItems.productId, productId));
      const last = all.find((r) => r.id !== rows[0].id)!;
      const cfg = last.config as Record<string, { text?: string; imageKey?: string }>;
      assert("stored config has no foreign key anywhere", JSON.stringify(cfg).indexOf(foreign) === -1 && !("bogus" in cfg));
      assert("text option kept its text", cfg[ot.id]?.text === "Hi" && cfg[ot.id]?.imageKey === undefined);
    } finally {
      for (const k of keys) await storage.deleteObject(k).catch(() => {});
      await db.delete(s.carts).where(inArray(s.carts.userId, [u1, u2]));
      if (productId) await db.delete(s.products).where(eq(s.products.id, productId));
      await db.delete(s.users).where(inArray(s.users.id, [u1, u2]));
      const gone = (await Promise.all(keys.map((k) => storage.headObject(k)))).every((x) => x === null);
      console.log(`  (cleaned up; S3 test objects removed: ${gone})`);
    }
  }

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll customer-image checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
