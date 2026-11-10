/**
 * Test-only tooling for authenticated browser E2E (Google login can't be automated).
 *   npx tsx scripts/e2e-session.ts setup    -> creates TEST-E2E-* customer + admin + a throwaway product,
 *                                              real BetterAuth sessions, prints signed cookie values as JSON
 *   npx tsx scripts/e2e-session.ts cleanup  -> removes every TEST-E2E-* row and S3 object
 * Refuses to run in production. The cookie is signed exactly like BetterAuth signs it (better-call).
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { inArray, like } from "drizzle-orm";
import { refreshStorefrontCache } from "./lib/revalidate";

const PREFIX = "TEST-E2E-";
const IDS = { customer: `${PREFIX}customer`, admin: `${PREFIX}admin` };

async function main() {
  if (process.env.NODE_ENV === "production") throw new Error("never run test tooling in production");
  const cmd = process.argv[2];
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const storage = await import("../src/lib/storage");
  const PRIVACY_VERSION = (await (await import("../src/lib/site-content-store")).loadLegal("privacy")).version;

  async function cleanup() {
    const uids = [IDS.customer, IDS.admin];
    await db.delete(s.orders).where(inArray(s.orders.userId, uids));
    await db.delete(s.reviews).where(inArray(s.reviews.userId, uids));
    await db.delete(s.carts).where(inArray(s.carts.userId, uids));
    await db.delete(s.addresses).where(inArray(s.addresses.userId, uids));
    await db.delete(s.sessions).where(inArray(s.sessions.userId, uids));
    await db.delete(s.accounts).where(inArray(s.accounts.userId, uids));
    await db.delete(s.products).where(like(s.products.slug, "test-e2e-%"));
    await db.delete(s.users).where(inArray(s.users.id, uids));
    if (storage.isStorageConfigured()) {
      for (const id of uids) await storage.deletePrefix(`customer/${id}/`).catch(() => 0);
    }
  }

  if (cmd === "cleanup") {
    await cleanup();
    await refreshStorefrontCache(["test-e2e-keychain"]); // the deleted test product must not linger in the cached shop listing
    const left = await db.select().from(s.users).where(like(s.users.id, `${PREFIX}%`));
    console.log(JSON.stringify({ cleaned: true, leftoverUsers: left.length }));
    process.exit(0);
  }
  if (cmd !== "setup") throw new Error("usage: e2e-session.ts setup|cleanup");

  await cleanup(); // idempotent

  const { auth } = await import("../src/lib/auth");
  const { serializeSignedCookie } = await import("better-call");
  const ctx = await auth.$context;

  await db.insert(s.users).values([
    { id: IDS.customer, name: "E2E Customer", email: "e2e-customer@test.local", emailVerified: true, role: "customer" as const, consentAt: new Date(), consentVersion: PRIVACY_VERSION },
    { id: IDS.admin, name: "E2E Admin", email: "e2e-admin@test.local", emailVerified: true, role: "admin" as const, consentAt: new Date(), consentVersion: PRIVACY_VERSION },
  ]);

  async function cookieFor(userId: string) {
    const session = await ctx.internalAdapter.createSession(userId);
    const name = ctx.authCookies.sessionToken.name;
    const header = await serializeSignedCookie(name, session.token, ctx.secret, { path: "/", httpOnly: true, sameSite: "lax" });
    // header looks like "name=<value>; Path=/; ..." -> keep just name + value for the browser context
    const [pair] = header.split(";");
    const value = pair.slice(name.length + 1);
    return { name, value: decodeURIComponent(value) };
  }

  // Throwaway product with every option type, so the customizer + checkout are exercised for real.
  const [p] = await db.insert(s.products).values({
    slug: "test-e2e-keychain", name: "TEST E2E Keychain", description: "Throwaway product for automated E2E.",
    category: "test", basePriceCents: 12000, status: "published",
  }).returning();
  const [oc] = await db.insert(s.productOptions).values({ productId: p.id, type: "color", label: "Color", required: true, sort: 0 }).returning();
  await db.insert(s.productOptionValues).values([
    { optionId: oc.id, label: "Green", value: "#22c55e", sort: 0 },
    { optionId: oc.id, label: "Blue", value: "#2563eb", sort: 1, priceDeltaCents: 1000 },
  ]);
  await db.insert(s.productOptions).values({ productId: p.id, type: "text", label: "Name", required: true, priceDeltaCents: 2000, constraints: { maxLen: 10, pattern: "^[A-Za-z0-9 ]*$" }, sort: 1 });
  await db.insert(s.productOptions).values({ productId: p.id, type: "image", label: "Logo", required: false, priceDeltaCents: 500, sort: 2 });

  console.log(JSON.stringify({
    customer: await cookieFor(IDS.customer),
    admin: await cookieFor(IDS.admin),
    slug: p.slug,
    customerId: IDS.customer,
  }));
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
