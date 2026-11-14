/**
 * Admin control over customer accounts: listing/search, block + unblock (including the sign-in hook), ending sessions,
 * re-consent, fixing profile/address data, deletion rules, and the audit trail. Real service functions + live DB,
 * isolated TEST- data, cleaned up in finally.
 * Run: npx tsx scripts/test-user-admin.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { eq, inArray, like } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

async function main() {
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const ua = await import("../src/lib/user-admin");
  const { auth } = await import("../src/lib/auth");
  const priv = await import("../src/lib/privacy");

  const T = `TEST-UA-${Date.now()}`;
  const admin = `${T}-admin`, admin2 = `${T}-admin2`, c1 = `${T}-c1`, c2 = `${T}-c2`, c3 = `${T}-c3`;
  const ids = [admin, admin2, c1, c2, c3];
  const email = (id: string) => `${id.toLowerCase()}@test.local`;
  const addr = { recipient: "Test Person", phone: "09171234567", line1: "1 Test Street", city: "Manila", province: "NCR" };

  async function addSessions(userId: string, n: number) {
    for (let i = 0; i < n; i++) {
      await db.insert(s.sessions).values({ id: `${userId}-s${i}`, token: `${userId}-tok${i}`, userId, expiresAt: new Date(Date.now() + 86400000), createdAt: new Date(), updatedAt: new Date(), ipAddress: "10.0.0.1", userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36" });
    }
  }
  const sessionCount = (userId: string) => ua.countSessions([userId]);
  const trail = async (userId: string) => (await ua.getUserDetail(userId))!.audit;

  try {
    await db.insert(s.users).values([
      { id: admin, name: `Alice Admin ${T}`, email: email(admin), emailVerified: true, role: "admin" as const },
      { id: admin2, name: `Bob Admin ${T}`, email: email(admin2), emailVerified: true, role: "admin" as const },
      { id: c1, name: `Carla_100% ${T}`, email: email(c1), emailVerified: true, role: "customer" as const, consentAt: new Date(), consentVersion: "v1" },
      { id: c2, name: `Dan Customer ${T}`, email: email(c2), emailVerified: true, role: "customer" as const },
      { id: c3, name: `Eve Customer ${T}`, email: email(c3), emailVerified: true, role: "customer" as const },
    ]);
    await addSessions(c1, 3);
    await addSessions(c3, 2);
    await addSessions(admin2, 1);
    await db.insert(s.addresses).values([{ userId: c1, label: "Home", ...addr, isDefault: 1 }, { userId: c3, label: "Home", ...addr, isDefault: 1 }]);

    // ---------------------------------------------------------------- list
    console.log("\nlist + search");
    const all = await ua.listUsers({ q: T });
    assert("search by name finds all five test users", all.total === 5, String(all.total));
    assert("search by email works (case-insensitive)", (await ua.listUsers({ q: email(c2).toUpperCase() })).total === 1);
    assert("a % in the query is literal (matches only 'Carla_100%')", (await ua.listUsers({ q: "100% " + T })).total === 1);
    assert("an _ in the query is literal", (await ua.listUsers({ q: "Carla_" })).rows.every((r) => r.name.includes("Carla_")));
    assert("a lone % does not match everything", (await ua.listUsers({ q: "%" })).total < (await ua.listUsers({})).total);
    assert("filter: admins", (await ua.listUsers({ q: T, filter: "admins" })).total === 2);
    assert("pagination", (await ua.listUsers({ q: T, pageSize: 2 })).rows.length === 2 && (await ua.listUsers({ q: T, pageSize: 2, page: 3 })).rows.length === 1);
    const row = all.rows.find((r) => r.id === c1)!;
    assert("rows carry order count and spend (zero for a new user)", row.orders === 0 && row.spentCents === 0 && row.lastOrderAt === null);

    // ---------------------------------------------------------------- block
    console.log("\nblock / unblock");
    assert("a reason is required", !(await ua.blockUser(admin, c1, "  ")).ok);
    assert("you can't block yourself", !(await ua.blockUser(admin, admin, "testing it")).ok);
    assert("you can't block an admin", !(await ua.blockUser(admin, admin2, "testing it")).ok);
    assert("an unknown user is refused", !(await ua.blockUser(admin, "TEST-UA-nobody", "testing it")).ok);
    const b = await ua.blockUser(admin, c1, "Chargeback abuse");
    assert("blocking works and reports the sessions it ended", b.ok && b.endedSessions === 3, JSON.stringify(b));
    assert("all of the user's sessions are gone", (await sessionCount(c1)) === 0);
    assert("other users' sessions are untouched", (await sessionCount(c3)) === 2 && (await sessionCount(admin2)) === 1);
    const [u1] = await db.select().from(s.users).where(eq(s.users.id, c1));
    assert("blocked state + reason are stored", Boolean(u1.blockedAt) && u1.blockedReason === "Chargeback abuse" && ua.userStateOf(u1) === "blocked");
    assert("blocking twice is refused", !(await ua.blockUser(admin, c1, "again please")).ok);
    assert("the blocked list and counts see it", (await ua.listUsers({ q: T, filter: "blocked" })).total === 1 && (await ua.userCounts()).blocked >= 1);
    assert("the audit trail records who, what and why", (await trail(c1)).some((a) => a.action === "user.block" && (a.detail as { reason: string }).reason === "Chargeback abuse" && a.actorName?.startsWith("Alice")));

    console.log("\nthe sign-in hook (BetterAuth)");
    const ctx = await auth.$context;
    let blockedSession: unknown = "unset";
    try { blockedSession = await ctx.internalAdapter.createSession(c1); } catch { blockedSession = null; }
    assert("a blocked user cannot get a new session", !blockedSession, JSON.stringify(blockedSession));
    assert("…and no session row was written", (await sessionCount(c1)) === 0);
    const okSession = await ctx.internalAdapter.createSession(c2);
    assert("an ordinary user still can", Boolean(okSession?.token));
    await db.delete(s.sessions).where(eq(s.sessions.userId, c2));

    assert("unblocking an account that isn't blocked is refused", !(await ua.unblockUser(admin, c3)).ok);
    assert("unblock works", (await ua.unblockUser(admin, c1)).ok);
    const [u1b] = await db.select().from(s.users).where(eq(s.users.id, c1));
    assert("the block fields are cleared", u1b.blockedAt === null && u1b.blockedReason === null);
    const again = await ctx.internalAdapter.createSession(c1);
    assert("after unblocking they can sign in again", Boolean(again?.token));
    await db.delete(s.sessions).where(eq(s.sessions.userId, c1));
    assert("unblock is in the audit trail", (await trail(c1)).some((a) => a.action === "user.unblock"));

    // ---------------------------------------------------------------- sessions
    console.log("\nsessions (the 'reset' for a Google-only app)");
    assert("you can't end your own sessions here", !(await ua.endAllSessions(admin, admin)).ok);
    const ended = await ua.endAllSessions(admin, c3);
    assert("ending all sessions reports the count", ended.ok && ended.ended === 2);
    assert("…and removes them", (await sessionCount(c3)) === 0);
    assert("it is allowed on another admin's account", (await ua.endAllSessions(admin, admin2)).ok);
    await addSessions(c3, 2);
    assert("ending a single session removes only that one", (await ua.endSession(admin, c3, `${c3}-s0`)).ok && (await sessionCount(c3)) === 1);
    assert("a session id belonging to someone else can't be removed through this user", !(await ua.endSession(admin, c3, `${admin2}-s0`)).ok);
    assert("an already-removed session is reported, not crashed on", !(await ua.endSession(admin, c3, `${c3}-s0`)).ok);

    console.log("\nre-consent");
    await db.update(s.users).set({ consentAt: new Date(), consentVersion: "v1" }).where(eq(s.users.id, c3));
    assert("the user currently has valid consent", priv.hasCurrentConsent(await priv.getConsent(c3), "v1"));
    assert("requiring re-consent works", (await ua.requireReconsent(admin, c3)).ok);
    assert("…so they must accept again", !priv.hasCurrentConsent(await priv.getConsent(c3), "v1"));

    // ---------------------------------------------------------------- profile
    console.log("\nfixing profile data");
    assert("a too-short name is refused", !(await ua.updateUserProfile(admin, c2, { name: "A", email: email(c2) })).ok);
    assert("an invalid email is refused", !(await ua.updateUserProfile(admin, c2, { name: "Dan C", email: "not-an-email" })).ok);
    const dup = await ua.updateUserProfile(admin, c2, { name: "Dan Customer", email: email(c3) });
    assert("an email already used by another account is refused", !dup.ok && /already/i.test(dup.ok ? "" : dup.error));
    const before = (await trail(c2)).length;
    assert("saving with no changes succeeds quietly", (await ua.updateUserProfile(admin, c2, { name: `Dan Customer ${T}`, email: email(c2), adminNote: "" })).ok);
    assert("…and writes no audit entry", (await trail(c2)).length === before);
    const up = await ua.updateUserProfile(admin, c2, { name: `Daniel Customer ${T}`, email: `  NEW-${email(c2).toUpperCase()}  `, adminNote: "Prefers J&T" });
    assert("a real edit succeeds", up.ok);
    const [u2] = await db.select().from(s.users).where(eq(s.users.id, c2));
    assert("name, lower-cased email and note are saved", u2.name === `Daniel Customer ${T}` && u2.email === `new-${email(c2)}` && u2.adminNote === "Prefers J&T", u2.email);
    const ev = (await trail(c2)).find((a) => a.action === "user.profile_updated")!;
    const d = ev.detail as Record<string, { from: string; to: string }>;
    assert("the audit entry records each changed field from → to", d.name.from.startsWith("Dan Customer") && d.name.to.startsWith("Daniel") && d.email.to === u2.email && d.adminNote.to === "Prefers J&T");
    assert("an admin's own profile can be fixed too", (await ua.updateUserProfile(admin, admin, { name: `Alice A. Admin ${T}`, email: email(admin) })).ok);

    console.log("\nfixing addresses");
    const [a1] = await db.select().from(s.addresses).where(eq(s.addresses.userId, c1));
    const [a3] = await db.select().from(s.addresses).where(eq(s.addresses.userId, c3));
    assert("an invalid address is refused", !(await ua.updateUserAddress(admin, c1, a1.id, { ...addr, city: "" })).ok);
    assert("a valid edit saves", (await ua.updateUserAddress(admin, c1, a1.id, { ...addr, line1: "99 Corrected Road" })).ok);
    assert("…and is stored", (await db.select().from(s.addresses).where(eq(s.addresses.id, a1.id)))[0].line1 === "99 Corrected Road");
    assert("another user's address can't be edited through this user", !(await ua.updateUserAddress(admin, c1, a3.id, addr)).ok);
    assert("…nor deleted", !(await ua.deleteUserAddress(admin, c1, a3.id)).ok);
    assert("deleting their own address works", (await ua.deleteUserAddress(admin, c1, a1.id)).ok);
    assert("address edits are audited", (await trail(c1)).filter((a) => a.action.startsWith("user.address_")).length === 2);

    // ---------------------------------------------------------------- delete
    console.log("\ndeleting an account");
    const [o] = await db.insert(s.orders).values({ orderNo: `${T}-001`, userId: c2, status: "paid", subtotalCents: 100, shippingCents: 8000, totalCents: 8100, shipAddress: { ...addr } }).returning();
    assert("refused while an order is in progress", !(await ua.deleteUserAccount(admin, c2)).ok);
    assert("refused for an admin", !(await ua.deleteUserAccount(admin, admin2)).ok);
    assert("refused for yourself", !(await ua.deleteUserAccount(admin, admin)).ok);
    await db.update(s.orders).set({ status: "delivered" }).where(eq(s.orders.id, o.id));
    assert("allowed once the order is finished", (await ua.deleteUserAccount(admin, c2)).ok);
    const [u2d] = await db.select().from(s.users).where(eq(s.users.id, c2));
    assert("the account is anonymized", Boolean(u2d.deletedAt) && u2d.name === "Deleted user" && u2d.email.endsWith("@deleted.invalid") && ua.userStateOf(u2d) === "deleted");
    assert("the order row is kept (business records)", (await db.select().from(s.orders).where(eq(s.orders.id, o.id))).length === 1);
    assert("a deleted account can no longer be edited", !(await ua.updateUserProfile(admin, c2, { name: "Zombie Name", email: "z@test.local" })).ok);
    assert("…or blocked", !(await ua.blockUser(admin, c2, "no point")).ok);
    assert("the audit trail survives and records the deletion", (await trail(c2)).some((a) => a.action === "user.deleted"));

    // ---------------------------------------------------------------- detail + helpers
    console.log("\ndetail + helpers");
    const detail = await ua.getUserDetail(c1);
    assert("detail returns the user, addresses, sessions, orders and audit", detail !== null && Array.isArray(detail.addresses) && Array.isArray(detail.sessions) && detail.audit.length >= 3);
    assert("the audit trail is newest first", detail!.audit.every((a, i, arr) => i === 0 || arr[i - 1].createdAt >= a.createdAt));
    assert("an unknown id gives null", (await ua.getUserDetail("TEST-UA-nobody")) === null);
    assert("describeAgent: Chrome on macOS", ua.describeAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0 Safari/537.36") === "Chrome on macOS");
    assert("describeAgent: Safari on iOS", ua.describeAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1") === "Safari on iOS");
    assert("describeAgent: Edge on Windows", ua.describeAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36 Edg/120") === "Edge on Windows");
    assert("describeAgent: missing → Unknown device", ua.describeAgent(null) === "Unknown device");
    assert("describeAudit reads naturally", ua.describeAudit("user.block", { reason: "Spam" }) === "Blocked: Spam" && ua.describeAudit("user.sessions_ended", { ended: 2 }).includes("2"));
    assert("userStateOf precedence: deleted beats blocked", ua.userStateOf({ blockedAt: new Date(), deletedAt: new Date() }) === "deleted");
  } finally {
    await db.delete(s.adminAudit).where(inArray(s.adminAudit.targetUserId, ids));
    await db.delete(s.orders).where(like(s.orders.orderNo, `${T}%`));
    await db.delete(s.sessions).where(inArray(s.sessions.userId, ids));
    await db.delete(s.addresses).where(inArray(s.addresses.userId, ids));
    await db.delete(s.users).where(inArray(s.users.id, ids));
  }

  console.log(failures ? `\n${failures} FAILED` : "\nAll user-admin tests passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
