/**
 * Landing-page CMS: content schema (link/icon allowlists, limits), defaults, DB store round-trip,
 * bad-row fallback, and the `site/` upload rules. Uses an isolated TEST- key, never the live "home" row.
 * Run: npx tsx scripts/test-content.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

async function main() {
  const sc = await import("../src/lib/site-content-schema");
  const up = await import("../src/lib/uploads");
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const store = await import("../src/lib/site-content-store");
  const { DEFAULT_HOME, homeContentSchema, isSafeHref, parseHomeContent } = sc;
  const clone = () => structuredClone(DEFAULT_HOME);

  console.log("\nlinks");
  for (const ok of ["/products", "/", "#how", "https://example.com/a?b=1", "http://example.com", "mailto:a@b.co", "tel:+639171234567"])
    assert(`allows ${ok}`, isSafeHref(ok));
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,x", "//evil.com", "/\\evil.com", " /x", "/x y", "vbscript:x", "ftp://x.com", "", "products", "java\nscript:x"])
    assert(`rejects ${JSON.stringify(bad)}`, !isSafeHref(bad));

  console.log("\nschema");
  assert("defaults are valid", homeContentSchema.safeParse(DEFAULT_HOME).success);
  const bad1 = clone(); bad1.hero.primary.href = "javascript:alert(1)";
  assert("a javascript: link is rejected", !homeContentSchema.safeParse(bad1).success);
  const bad2 = clone(); (bad2.highlights[0] as { icon: string }).icon = "Skull";
  assert("an icon outside the allowlist is rejected", !homeContentSchema.safeParse(bad2).success);
  const bad3 = clone(); for (let i = 0; i < 7; i++) bad3.highlights.push({ icon: "Star", title: "x", body: "" });
  assert("more than 6 highlights is rejected", !homeContentSchema.safeParse(bad3).success);
  const bad4 = clone(); bad4.faq = Array.from({ length: 11 }, () => ({ q: "q", a: "a" }));
  assert("more than 10 FAQ entries is rejected", !homeContentSchema.safeParse(bad4).success);
  const bad5 = clone(); bad5.hero.titleLine1 = "   ";
  assert("a blank hero title is rejected", !homeContentSchema.safeParse(bad5).success);
  const bad6 = clone(); bad6.featured.limit = 99;
  assert("featured limit above 8 is rejected", !homeContentSchema.safeParse(bad6).success);
  for (const key of ["photos/a.png", "site/../x.png", "https://evil/x.png", "customer/u/a.png", "site/"]) {
    const b = clone(); b.hero.imageKey = key;
    assert(`hero image key ${JSON.stringify(key)} is rejected`, !homeContentSchema.safeParse(b).success);
  }
  const good = clone(); good.hero.imageKey = "site/abc123-hero.webp";
  assert("a site/ image key is accepted", homeContentSchema.safeParse(good).success);
  const trimmed = clone(); trimmed.hero.titleLine1 = "  Hi  ";
  assert("text is trimmed", homeContentSchema.parse(trimmed).hero.titleLine1 === "Hi");
  const script = clone(); script.hero.subtext = "<script>alert(1)</script>";
  assert("markup is kept as plain text (React escapes it on render)", homeContentSchema.parse(script).hero.subtext.includes("<script>"));
  assert("garbage falls back to defaults", parseHomeContent({ nope: 1 }) === DEFAULT_HOME && parseHomeContent(null) === DEFAULT_HOME);

  console.log("\nuploads (site/)");
  assert("site images are admin-only", up.ADMIN_ONLY_KINDS.includes("site"));
  assert("site key pattern matches the schema's", up.KEY_PATTERNS.site.test("site/a-b_c.png") && !up.KEY_PATTERNS.site.test("site/x/y.png"));
  assert("a PNG is accepted", up.validateUpload("site", "h.png", "image/png", 1000) === null);
  assert("a 3MF is not accepted as a site image", up.validateUpload("site", "h.3mf", "model/3mf", 1000) !== null);
  assert("an oversize image is rejected", up.validateUpload("site", "h.png", "image/png", 6 * 1024 * 1024) !== null);
  assert("SVG is not accepted (script risk)", up.validateUpload("site", "h.svg", "image/svg+xml", 1000) !== null);

  console.log("\nrendering never uses raw HTML");
  for (const f of ["src/app/(shop)/page.tsx", "src/components/cms.tsx", "src/components/site-footer.tsx", "src/components/admin/content-editor.tsx"])
    assert(`${f} has no dangerouslySetInnerHTML`, !readFileSync(f, "utf8").includes("dangerouslySetInnerHTML"));

  console.log("\nstore (live DB, TEST key)");
  const KEY = `TEST-home-${Date.now()}`;
  const UID = `TEST-CT-${Date.now()}`;
  try {
    assert("missing row loads the defaults", (await store.loadHomeContent(KEY)).hero.titleLine1 === DEFAULT_HOME.hero.titleLine1);
    await db.insert(s.users).values({ id: UID, name: "CMS Tester", email: `${UID}@test.local`, emailVerified: true, role: "admin" as const });
    const edited = clone(); edited.hero.titleLine1 = "Fresh title"; edited.faq.push({ q: "Q3", a: "A3" });
    await store.saveHomeContent(edited, UID, KEY);
    const back = await store.loadHomeContent(KEY);
    assert("saved content round-trips", back.hero.titleLine1 === "Fresh title" && back.faq.length === 3);
    const [row] = await db.select().from(s.siteContent).where(eq(s.siteContent.key, KEY));
    assert("updatedBy is recorded", row?.updatedBy === UID);
    edited.hero.titleLine1 = "Second save";
    await store.saveHomeContent(edited, UID, KEY);
    assert("saving again updates in place (one row)", (await store.loadHomeContent(KEY)).hero.titleLine1 === "Second save");
    let threw = false;
    try { await store.saveHomeContent(bad1, UID, KEY); } catch { threw = true; }
    assert("the store refuses invalid content", threw);
    assert("a refused save leaves the old content", (await store.loadHomeContent(KEY)).hero.titleLine1 === "Second save");
    await db.update(s.siteContent).set({ data: { corrupted: true } }).where(eq(s.siteContent.key, KEY));
    assert("a corrupted row falls back to defaults instead of breaking the page", (await store.loadHomeContent(KEY)).hero.titleLine1 === DEFAULT_HOME.hero.titleLine1);
    await store.resetHomeContent(KEY);
    const rows = await db.select().from(s.siteContent).where(eq(s.siteContent.key, KEY));
    assert("reset removes the saved row", rows.length === 0);
  } finally {
    await db.delete(s.siteContent).where(eq(s.siteContent.key, KEY));
    await db.delete(s.users).where(eq(s.users.id, UID));
  }

  console.log(failures ? `\n${failures} FAILED` : "\nAll content tests passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
