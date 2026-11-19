/**
 * Shipping fee: the rate table (zone from the province, weight tier from the items plus packaging, extra kilograms, free shipping,
 * the owner's province overrides), the saved settings (damaged settings fall back to the defaults), and real orders: the fee on the
 * order is the table's, names and codes are checked and replaced from the data, a forged location is refused, and the order keeps a
 * snapshot of how its fee was worked out. Isolated TEST-SH data, removed in finally. Run: npx tsx scripts/test-shipping.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, like } from "drizzle-orm";
import { DEFAULT_SHIPPING_CONFIG, parseShippingConfig, quoteShipping, rateRange, shippingConfigSchema, zoneOf, type ShippingConfig } from "../src/lib/shipping";
import { loadPsgcIndex } from "../src/lib/psgc-server";
import { CEBU_ALCANTARA, DAVAO_BANSALAN, PALAWAN_ABORLAN, QUEZON_CITY, SAN_PABLO } from "./fixtures/ph-address";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

async function main() {
  const index = await loadPsgcIndex();
  const prov = (code: string) => index.provinces.find((p) => p.code === code)!;
  const cfg = DEFAULT_SHIPPING_CONFIG;
  const one = (g: number) => [{ qty: 1, weightGrams: g }];

  console.log("\nthe rate table");
  const a = quoteShipping(cfg, prov(SAN_PABLO.provinceCode), one(300), 1000);
  assert("300 g + 100 g packaging = 400 g to Laguna: Luzon, first tier, ₱85", a.zone === "luzon" && a.grams === 400 && a.feeCents === 8500 && a.tierLabel === "up to 0.5 kg");
  assert("the tier edge is inclusive: exactly 500 g is still the first tier, 501 g is the next", quoteShipping(cfg, prov(SAN_PABLO.provinceCode), one(400), 0).feeCents === 8500 && quoteShipping(cfg, prov(SAN_PABLO.provinceCode), one(401), 0).feeCents === 15500);
  assert("the same parcel costs more further away (Metro Manila 95, Visayas 100, Mindanao 105, island 115)", [QUEZON_CITY, CEBU_ALCANTARA, DAVAO_BANSALAN, PALAWAN_ABORLAN].map((l) => quoteShipping(cfg, prov(l.provinceCode), one(300), 0).feeCents).join() === "9500,10000,10500,11500");
  const heavy = quoteShipping(cfg, prov(SAN_PABLO.provinceCode), one(7900), 0); // 8000 g: 2 kg over the 6 kg tier
  assert("over the last tier: the last tier's price plus ₱90 for each started extra kg", heavy.feeCents === 45500 + 2 * 9000 && heavy.tierLabel.startsWith("over 6 kg"), JSON.stringify(heavy));
  const many = quoteShipping(cfg, prov(SAN_PABLO.provinceCode), [{ qty: 3, weightGrams: 200 }, { qty: 2, weightGrams: null }], 0);
  assert("quantities multiply, and an item with no weight uses the default (150 g): 600 + 300 + 100 = 1000 g", many.grams === 1000 && many.feeCents === 15500);
  assert("a zero or negative quantity or weight cannot make the parcel lighter than one default item", quoteShipping(cfg, prov(SAN_PABLO.provinceCode), [{ qty: 0, weightGrams: -5 }], 0).grams === 250);
  const free: ShippingConfig = { ...cfg, freeOverCents: 50000 };
  assert("free shipping at or above the threshold (the table fee is still reported)", quoteShipping(free, prov(SAN_PABLO.provinceCode), one(300), 50000).feeCents === 0 && quoteShipping(free, prov(SAN_PABLO.provinceCode), one(300), 50000).baseCents === 8500 && quoteShipping(free, prov(SAN_PABLO.provinceCode), one(300), 49999).feeCents === 8500);
  const moved: ShippingConfig = { ...cfg, provinceZones: { [SAN_PABLO.provinceCode]: "visayas" } };
  assert("the owner can move a province to another zone", zoneOf(moved, prov(SAN_PABLO.provinceCode)) === "visayas" && quoteShipping(moved, prov(SAN_PABLO.provinceCode), one(300), 0).feeCents === 10000 && zoneOf(moved, prov(QUEZON_CITY.provinceCode)) === "metro-manila");
  assert("the range for 'from ₱X' text", rateRange(cfg).minCents === 8500 && rateRange(cfg).maxCents === 56000);

  console.log("\nsettings");
  assert("the starting table is valid", shippingConfigSchema.safeParse(cfg).success);
  assert("tiers must go up", !shippingConfigSchema.safeParse({ ...cfg, tiers: [1000, 500, 2000, 3000, 4000, 5000] }).success);
  assert("every zone needs a price for every tier", !shippingConfigSchema.safeParse({ ...cfg, rates: { ...cfg.rates, luzon: [8500] } }).success);
  assert("a negative price or a bad province code is refused", !shippingConfigSchema.safeParse({ ...cfg, rates: { ...cfg.rates, luzon: [-1, 1, 2, 3, 4, 5] } }).success && !shippingConfigSchema.safeParse({ ...cfg, provinceZones: { abc: "luzon" } }).success);
  assert("nothing saved = the starting table; damaged = the starting table (checkout must not break)", parseShippingConfig(undefined) === cfg && parseShippingConfig({ tiers: "no" }) === cfg && parseShippingConfig({ freeOverCents: 20000 }).freeOverCents === 20000);

  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const svc = await import("../src/lib/order-service");
  const store = await import("../src/lib/site-content-store");
  const T = `TEST-SH-${Date.now()}`;
  const buyer = `${T}-b`;
  const key = `shipping-test-${Date.now()}`;
  try {
    console.log("\nsaved in the database");
    await store.saveShippingConfig({ ...cfg, freeOverCents: 12345, note: "J&T, 3-5 days" }, null, key);
    const back = await store.loadShippingConfig(key);
    assert("saved and read back", back.freeOverCents === 12345 && back.note === "J&T, 3-5 days");
    let threw = false;
    try { await store.saveShippingConfig({ ...cfg, tiers: [5, 1] }, null, key); } catch { threw = true; }
    assert("an invalid table is not saved", threw && (await store.loadShippingConfig(key)).freeOverCents === 12345);

    console.log("\nreal orders");
    await db.insert(s.users).values({ id: buyer, name: "Ship Buyer", email: `${buyer}@test.local`, emailVerified: true, role: "customer" });
    const [heavyP] = await db.insert(s.products).values({ slug: `${T}-heavy`, name: `${T} Heavy`, basePriceCents: 10000, status: "published", weightGrams: 2000 }).returning();
    const [lightP] = await db.insert(s.products).values({ slug: `${T}-light`, name: `${T} Light`, basePriceCents: 5000, status: "published" }).returning();
    const cart = async (lines: { productId: string; qty: number }[]) => {
      const [c] = await db.insert(s.carts).values({ userId: buyer }).onConflictDoNothing().returning();
      const cartId = c?.id ?? (await db.select().from(s.carts).where(eq(s.carts.userId, buyer)))[0].id;
      await db.delete(s.cartItems).where(eq(s.cartItems.cartId, cartId));
      for (const l of lines) await db.insert(s.cartItems).values({ cartId, productId: l.productId, qty: l.qty, config: {}, unitPriceCents: 1 });
    };
    const base = { recipient: "Ship Buyer", phone: "09170000000", line1: "1 Test St" };

    await cart([{ productId: heavyP.id, qty: 1 }]); // 2000 + 100 = 2100 g: 3 kg tier
    const r1 = await svc.placeOrder(buyer, { ...base, ...SAN_PABLO });
    assert("order placed", r1.ok);
    if (!r1.ok) throw new Error(r1.error);
    const [o1] = await db.select().from(s.orders).where(eq(s.orders.orderNo, r1.orderNo));
    assert("a 2 kg product to Laguna: the 3 kg tier, ₱180", o1.shippingCents === 18000 && o1.totalCents === 10000 + 18000);
    const ship = o1.shipAddress as Record<string, unknown> & { shipping: { zone: string; grams: number; feeCents: number } };
    assert("the order keeps how its fee was worked out", ship.shipping.zone === "luzon" && ship.shipping.grams === 2100 && ship.shipping.feeCents === 18000);
    assert("the address on the order has the data's names and codes", ship.province === "Laguna" && ship.city === "City of San Pablo" && ship.barangay === "Atisan" && ship.barangayCode === SAN_PABLO.barangayCode && ship.regionCode === "0400000000");

    await cart([{ productId: heavyP.id, qty: 1 }]);
    const r2 = await svc.placeOrder(buyer, { ...base, ...PALAWAN_ABORLAN });
    if (!r2.ok) throw new Error(r2.error);
    const [o2] = await db.select().from(s.orders).where(eq(s.orders.orderNo, r2.orderNo));
    assert("the same parcel to Palawan is in the island zone: ₱230", o2.shippingCents === 23000);

    await cart([{ productId: lightP.id, qty: 2 }]); // 2 x 150 + 100 = 400 g
    const r3 = await svc.placeOrder(buyer, { ...base, ...QUEZON_CITY });
    if (!r3.ok) throw new Error(r3.error);
    const [o3] = await db.select().from(s.orders).where(eq(s.orders.orderNo, r3.orderNo));
    assert("light products with no weight use the default: ₱95 to Metro Manila", o3.shippingCents === 9500);

    console.log("\nthe location is checked");
    await cart([{ productId: lightP.id, qty: 1 }]);
    const forged = await svc.placeOrder(buyer, { ...base, ...SAN_PABLO, cityCode: QUEZON_CITY.cityCode });
    assert("a city that is not in that province is refused", !forged.ok);
    assert("a barangay that is not in that city is refused", !(await svc.placeOrder(buyer, { ...base, ...SAN_PABLO, barangayCode: QUEZON_CITY.barangayCode })).ok);
    const noCodes = await svc.placeOrder(buyer, { ...base, province: "Laguna", city: "San Pablo", barangay: "Atisan" });
    assert("text with no codes is refused with a message that says what to do", !noCodes.ok && /choose your province, city and barangay/i.test(noCodes.error), JSON.stringify(noCodes));
    assert("the cart is untouched after a refusal", (await db.select().from(s.cartItems)).some((c) => c.productId === lightP.id));
    const names = await svc.placeOrder(buyer, { ...base, ...SAN_PABLO, province: "Atlantis", city: "Nowhere", barangay: "Fake" }, { saveAddress: true });
    if (!names.ok) throw new Error(names.error);
    const [o4] = await db.select().from(s.orders).where(eq(s.orders.orderNo, names.orderNo));
    assert("forged names sent with real codes are replaced by the data's", (o4.shipAddress as { city: string }).city === "City of San Pablo" && (o4.shipAddress as { province: string }).province === "Laguna");
    const [saved] = await db.select().from(s.addresses).where(eq(s.addresses.userId, buyer));
    assert("a saved address keeps the codes and the data's names", saved.barangayCode === SAN_PABLO.barangayCode && saved.city === "City of San Pablo" && saved.regionCode === "0400000000" && saved.provinceCode === SAN_PABLO.provinceCode);
  } finally {
    await db.delete(s.orders).where(eq(s.orders.userId, buyer));
    await db.delete(s.carts).where(eq(s.carts.userId, buyer));
    await db.delete(s.addresses).where(eq(s.addresses.userId, buyer));
    await db.delete(s.products).where(like(s.products.slug, `${T}%`));
    await db.delete(s.users).where(eq(s.users.id, buyer));
    await store.resetContent(key);
  }
  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll shipping checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
