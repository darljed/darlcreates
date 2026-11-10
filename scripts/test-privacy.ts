/**
 * Privacy (RA 10173): consent versioning, data export, account deletion/anonymization, plus the
 * address book. Real service functions, live DB + S3. Isolated TEST- data, cleaned up in finally.
 * Run: npx tsx scripts/test-privacy.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const ADDR = { recipient: "Pat Privacy", phone: "09171112222", line1: "9 Secret Lane", barangay: "Brgy X", city: "Quezon City", province: "NCR", postalCode: "1100" };

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const priv = await import("../src/lib/privacy");
  const svc = await import("../src/lib/order-service");
  const addrBook = await import("../src/lib/addresses");
  const storage = await import("../src/lib/storage");
  const { PRIVACY_VERSION } = await import("../src/lib/business");

  const T = `TEST-PV-${Date.now()}`;
  const me = `${T}-me`, other = `${T}-other`, admin = `${T}-admin`;
  const orderIds: string[] = [];
  let productId = "";
  const keys: string[] = [];

  try {
    await db.insert(s.users).values([
      { id: me, name: "Pat Privacy", email: `${me}@test.local`, emailVerified: true, role: "customer" as const },
      { id: other, name: "Olive Other", email: `${other}@test.local`, emailVerified: true, role: "customer" as const },
      { id: admin, name: "Admin", email: `${admin}@test.local`, emailVerified: true, role: "admin" as const },
    ]);
    const [p] = await db.insert(s.products).values({ slug: `${T.toLowerCase()}-p`, name: `${T} Item`, basePriceCents: 10000, status: "published" }).returning();
    productId = p.id;

    // ---- consent ----
    console.log("\nconsent");
    assert("new user has no consent", !priv.hasCurrentConsent(await priv.getConsent(me)));
    await priv.recordConsent(me);
    const c1 = await priv.getConsent(me);
    assert("consent recorded with timestamp + current version", priv.hasCurrentConsent(c1) && c1?.consentVersion === PRIVACY_VERSION);
    await db.update(s.users).set({ consentVersion: "1999-01-01" }).where(eq(s.users.id, me));
    assert("an OLD policy version is not current consent (re-ask after policy changes)", !priv.hasCurrentConsent(await priv.getConsent(me)));
    await priv.recordConsent(me);
    assert("re-accepting restores consent", priv.hasCurrentConsent(await priv.getConsent(me)));

    // ---- address book ----
    console.log("\naddress book");
    const cartId = (await db.insert(s.carts).values({ userId: me }).returning())[0].id;
    await db.insert(s.cartItems).values({ cartId, productId, qty: 1, config: {}, unitPriceCents: 1 });
    const placed = await svc.placeOrder(me, ADDR, { saveAddress: true });
    if (!placed.ok) throw new Error(placed.error);
    const [order] = await db.select().from(s.orders).where(eq(s.orders.orderNo, placed.orderNo)); orderIds.push(order.id);
    let book = await addrBook.listAddresses(me);
    assert("address saved at checkout; first one is the default", book.length === 1 && book[0].isDefault);
    await db.insert(s.cartItems).values({ cartId, productId, qty: 1, config: {}, unitPriceCents: 1 });
    const placed2 = await svc.placeOrder(me, ADDR, { saveAddress: true });
    if (!placed2.ok) throw new Error(placed2.error);
    const [order2] = await db.select().from(s.orders).where(eq(s.orders.orderNo, placed2.orderNo)); orderIds.push(order2.id);
    book = await addrBook.listAddresses(me);
    assert("the same address is not saved twice", book.length === 1);
    await db.insert(s.cartItems).values({ cartId, productId, qty: 1, config: {}, unitPriceCents: 1 });
    const placed3 = await svc.placeOrder(me, { ...ADDR, line1: "10 Other Road" }, { saveAddress: true });
    if (!placed3.ok) throw new Error(placed3.error);
    const [order3] = await db.select().from(s.orders).where(eq(s.orders.orderNo, placed3.orderNo)); orderIds.push(order3.id);
    book = await addrBook.listAddresses(me);
    assert("a different address is added", book.length === 2);
    await db.insert(s.cartItems).values({ cartId, productId, qty: 1, config: {}, unitPriceCents: 1 });
    const placed4 = await svc.placeOrder(me, { ...ADDR, line1: "11 Unsaved St" }, { saveAddress: false });
    if (!placed4.ok) throw new Error(placed4.error);
    const [order4] = await db.select().from(s.orders).where(eq(s.orders.orderNo, placed4.orderNo)); orderIds.push(order4.id);
    assert("saveAddress=false does not save", (await addrBook.listAddresses(me)).length === 2);

    const second = book.find((a) => !a.isDefault)!;
    assert("other users cannot change my default", !(await addrBook.setDefaultAddress(other, second.id)));
    assert("other users cannot delete my address", !(await addrBook.deleteAddress(other, second.id)));
    assert("I can change my default", await addrBook.setDefaultAddress(me, second.id));
    book = await addrBook.listAddresses(me);
    assert("exactly one default afterwards", book.filter((a) => a.isDefault).length === 1 && book[0].id === second.id);
    assert("deleting the default promotes another", await addrBook.deleteAddress(me, second.id) && (await addrBook.listAddresses(me))[0]?.isDefault === true);

    // a customer upload + a payment, so deletion has real things to remove/keep
    const upKey = storage.buildKey("customer", "mine.png", me); keys.push(upKey);
    await fetch(await storage.presignUpload(upKey, "image/png", 60), { method: "PUT", headers: { "Content-Type": "image/png" }, body: PNG });
    await db.update(s.orderItems).set({ imageKey: upKey }).where(eq(s.orderItems.orderId, order.id));
    await db.insert(s.reviews).values({ productId, userId: me, rating: 5, body: "Great, call me on 0917", approved: true });
    await svc.submitGcashReference(me, placed.orderNo, "PRIV123456");

    // ---- export ----
    console.log("\nexport (right of access)");
    const data = await priv.exportUserData(me);
    assert("export has profile, addresses, orders, reviews", !!data && data.profile.email === `${me}@test.local` && data.addresses.length === 1 && data.orders.length === 4 && data.reviews.length === 1);
    const json = JSON.stringify(data);
    assert("export contains the payment reference", json.includes("PRIV123456"));
    assert("export does NOT include another user's data", !json.includes(other) && !json.includes("Olive Other"));
    assert("export has no auth secrets/tokens", !/accessToken|refreshToken|password|idToken/i.test(json));
    assert("export of an unknown user is null", (await priv.exportUserData("nope")) === null);

    // ---- deletion ----
    console.log("\naccount deletion");
    const blocked = await priv.deleteAccount(me);
    assert("blocked while orders are in progress", !blocked.ok && /in progress/i.test(blocked.ok ? "" : blocked.error), blocked.ok ? "" : blocked.error);
    assert("admin account can't be deleted here", !(await priv.deleteAccount(admin)).ok);
    assert("nothing was removed by the refused attempt", (await priv.getConsent(me))?.deletedAt === null);

    for (const o of [order, order2, order3, order4]) await svc.transitionOrder(admin, o.id, "cancelled", "test");
    await db.insert(s.sessions).values({ id: `${T}-s`, userId: me, token: `${T}-tok`, expiresAt: new Date(Date.now() + 1e7), createdAt: new Date(), updatedAt: new Date() });
    await db.insert(s.accounts).values({ id: `${T}-a`, accountId: "g1", providerId: "google", userId: me, createdAt: new Date(), updatedAt: new Date() });
    const del = await priv.deleteAccount(me);
    assert("deletion succeeds once nothing is in progress", del.ok);
    assert("uploaded images removed from S3", (await storage.headObject(upKey)) === null);

    const [u] = await db.select().from(s.users).where(eq(s.users.id, me));
    assert("name + email anonymized, deletedAt set", u.name === "Deleted user" && u.email.startsWith("deleted-") && u.email.endsWith("@deleted.invalid") && u.deletedAt !== null && u.image === null);
    assert("no personal details left on the user row", !JSON.stringify(u).includes("Pat Privacy") && !JSON.stringify(u).includes("test.local"));
    assert("sessions + linked Google account removed", (await db.select().from(s.sessions).where(eq(s.sessions.userId, me))).length === 0 && (await db.select().from(s.accounts).where(eq(s.accounts.userId, me))).length === 0);
    assert("address book + cart + reviews removed", (await db.select().from(s.addresses).where(eq(s.addresses.userId, me))).length === 0 && (await db.select().from(s.carts).where(eq(s.carts.userId, me))).length === 0 && (await db.select().from(s.reviews).where(eq(s.reviews.userId, me))).length === 0);
    const kept = await db.select().from(s.orders).where(inArray(s.orders.id, orderIds));
    assert("order rows KEPT (financial record)", kept.length === 4);
    assert("...but the delivery address on them is redacted", kept.every((o) => (o.shipAddress as { redacted?: boolean }).redacted === true) && !JSON.stringify(kept).includes("Secret Lane"));
    assert("...totals untouched", kept.every((o) => o.totalCents > 0));
    const pays = await db.select().from(s.payments).where(inArray(s.payments.orderId, orderIds));
    assert("payment rows KEPT with their reference", pays.length === 1 && pays[0].gcashReference === "PRIV123456");
    const items = await db.select().from(s.orderItems).where(inArray(s.orderItems.orderId, orderIds));
    assert("order items kept; uploaded-image link cleared", items.length === 4 && items.every((i) => i.imageKey === null));
    assert("deleting again is a harmless no-op", (await priv.deleteAccount(me)).ok);
    assert("other user untouched", (await db.select().from(s.users).where(eq(s.users.id, other)))[0].name === "Olive Other");
  } finally {
    for (const k of keys) await storage.deleteObject(k).catch(() => {});
    const uids = [me, other, admin];
    if (orderIds.length) await db.delete(s.orders).where(inArray(s.orders.id, orderIds));
    await db.delete(s.reviews).where(inArray(s.reviews.userId, uids));
    await db.delete(s.sessions).where(inArray(s.sessions.userId, uids));
    await db.delete(s.accounts).where(inArray(s.accounts.userId, uids));
    await db.delete(s.carts).where(inArray(s.carts.userId, uids));
    await db.delete(s.addresses).where(inArray(s.addresses.userId, uids));
    if (productId) await db.delete(s.products).where(eq(s.products.id, productId));
    await db.delete(s.users).where(inArray(s.users.id, uids));
    console.log("  (cleaned up)");
  }
  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll privacy checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
