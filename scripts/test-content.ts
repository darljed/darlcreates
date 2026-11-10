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

  console.log("\nstore info + footer schema");
  const { DEFAULT_SITE_INFO, siteInfoSchema, telHref, parseLegalBody, parseInline, legalDocSchema, DEFAULT_LEGAL, parseLegal } = sc;
  assert("default store info is valid", siteInfoSchema.safeParse(DEFAULT_SITE_INFO).success);
  const si1 = structuredClone(DEFAULT_SITE_INFO); si1.links.push({ label: "x", href: "javascript:alert(1)" });
  assert("a javascript: footer link is rejected", !siteInfoSchema.safeParse(si1).success);
  const si2 = structuredClone(DEFAULT_SITE_INFO); si2.social.push({ label: "fb", href: "//evil.com" });
  assert("a protocol-relative social link is rejected", !siteInfoSchema.safeParse(si2).success);
  const si3 = structuredClone(DEFAULT_SITE_INFO); si3.store.email = "not-an-email";
  assert("a bad email is rejected", !siteInfoSchema.safeParse(si3).success);
  const si4 = structuredClone(DEFAULT_SITE_INFO); si4.store.email = "";
  assert("an empty email is allowed (hidden in the footer)", siteInfoSchema.safeParse(si4).success);
  const si5 = structuredClone(DEFAULT_SITE_INFO); si5.links = Array.from({ length: 9 }, () => ({ label: "a", href: "/" }));
  assert("more than 8 footer links is rejected", !siteInfoSchema.safeParse(si5).success);
  assert("telHref turns a PH mobile number into tel:", telHref("0995 900 7319") === "tel:09959007319");
  assert("telHref keeps +63", telHref("+63 995 900 7319") === "tel:+639959007319");
  assert("telHref refuses text", telHref("call us!") === null && telHref("") === null);

  console.log("\nlegal text format");
  const blocks = parseLegalBody("Intro line\nsecond line\n\n## Heading\n\n- one\n- two\n\nSee [terms](/terms) and [bad](javascript:alert(1)).");
  assert("blocks: paragraph, heading, list, paragraph", blocks.map((b) => b.type).join(",") === "p,h2,ul,p", blocks.map((b) => b.type).join(","));
  const last = blocks[3]; const parts = last.type === "p" ? last.parts : [];
  assert("a safe link becomes a link", parts.some((x) => x.href === "/terms" && x.text === "terms"));
  assert("an unsafe link stays plain text, never a link", !parts.some((x) => x.href?.startsWith("javascript")) && parts.some((x) => x.text.includes("javascript:alert(1)") && !x.href));
  assert("HTML is kept as plain text", parseInline("<img src=x onerror=alert(1)>")[0].text.includes("<img"));
  const glued = parseLegalBody("## Heading\nText right below it\nsecond line\n\n## Next\n- a\n- b");
  assert("a heading with text on the next line splits into heading + paragraph", glued.map((b) => b.type).join(",") === "h2,p,h2,ul", glued.map((b) => b.type).join(","));
  const g1 = glued[0], g2 = glued[1];
  assert("the heading holds only the heading text", g1.type === "h2" && g1.text === "Heading" && g2.type === "p" && g2.parts[0].text === "Text right below it\nsecond line");
  assert("no default legal heading swallows a paragraph", [DEFAULT_LEGAL.privacy, DEFAULT_LEGAL.terms].every((d) => parseLegalBody(d.body).every((b) => b.type !== "h2" || b.text.length < 60)));
  assert("windows line endings parse", parseLegalBody("a\r\n\r\n## B\r\n\r\nc").length === 3);
  assert("empty body yields no blocks", parseLegalBody("  \n\n ").length === 0);
  assert("default legal docs are valid", legalDocSchema.safeParse(DEFAULT_LEGAL.privacy).success && legalDocSchema.safeParse(DEFAULT_LEGAL.terms).success);
  assert("an empty body is rejected", !legalDocSchema.safeParse({ ...DEFAULT_LEGAL.terms, body: "   " }).success);
  assert("garbage legal data falls back to the default", parseLegal("terms", { x: 1 }) === DEFAULT_LEGAL.terms);
  assert("default terms text contains no unsafe links", !parseLegalBody(DEFAULT_LEGAL.terms.body).some((b) => b.type === "p" && b.parts.some((x) => x.href && !sc.isSafeHref(x.href))));

  console.log("\nrendering never uses raw HTML");
  for (const f of ["src/app/(shop)/page.tsx", "src/components/cms.tsx", "src/components/site-footer.tsx", "src/components/legal-body.tsx", "src/components/admin/content-editor.tsx", "src/components/admin/store-editor.tsx", "src/components/admin/legal-editor.tsx"])
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

    // ---- store info ----
    const SKEY = `${KEY}-site`;
    assert("missing site row loads the defaults", (await store.loadSiteInfo(SKEY)).store.name === DEFAULT_SITE_INFO.store.name);
    const info = structuredClone(DEFAULT_SITE_INFO); info.store.phone = "0917 111 2222"; info.social.push({ label: "Facebook", href: "https://facebook.com/x" });
    await store.saveSiteInfo(info, UID, SKEY);
    const infoBack = await store.loadSiteInfo(SKEY);
    assert("store info round-trips", infoBack.store.phone === "0917 111 2222" && infoBack.social.length === 1);
    let threw2 = false; try { await store.saveSiteInfo(si1, UID, SKEY); } catch { threw2 = true; }
    assert("the store refuses an invalid footer link", threw2);

    // ---- legal pages + privacy version ----
    const LKEY = `${KEY}-legal`;
    const base = await store.loadLegal("privacy", LKEY);
    assert("missing legal row loads the default (with its version)", base.version === sc.DEFAULT_PRIVACY_VERSION && base.title === "Privacy Policy");
    const edit = { title: "Privacy Policy", effective: "Effective today", body: "Hello\n\n## World\n\nText" };
    const saved1 = await store.saveLegal("privacy", edit, UID, false, LKEY);
    assert("a normal edit keeps the same version (customers are NOT re-asked)", saved1.version === base.version);
    const saved2 = await store.saveLegal("privacy", { ...edit, body: "Changed" }, UID, true, LKEY);
    assert("'ask again' creates a new version", saved2.version !== base.version);
    const saved3 = await store.saveLegal("privacy", { ...edit, body: "Typo fix" }, UID, false, LKEY);
    assert("a later normal edit keeps the new version", saved3.version === saved2.version);
    const withVersion = { ...edit, version: "attacker-chosen" };
    const saved4 = await store.saveLegal("privacy", withVersion, UID, false, LKEY);
    assert("the browser cannot choose the version", saved4.version === saved2.version);
    let threw3 = false; try { await store.saveLegal("privacy", { ...edit, body: " " }, UID, false, LKEY); } catch { threw3 = true; }
    assert("an empty policy is refused", threw3);
    assert("a refused save leaves the last saved text", (await store.loadLegal("privacy", LKEY)).body === edit.body);

    // consent follows the version: accepted v1, then 'ask again' -> must accept again
    const priv = await import("../src/lib/privacy");
    await db.update(s.users).set({ consentAt: new Date(), consentVersion: base.version }).where(eq(s.users.id, UID));
    const c = await priv.getConsent(UID);
    assert("consent to the old version is valid while the version is unchanged", priv.hasCurrentConsent(c, saved1.version));
    assert("consent to the old version is NOT valid after 'ask again'", !priv.hasCurrentConsent(c, saved2.version));
    await priv.recordConsent(UID, saved2.version);
    assert("accepting the new version restores consent", priv.hasCurrentConsent(await priv.getConsent(UID), saved2.version));
    await db.delete(s.siteContent).where(eq(s.siteContent.key, SKEY));
    await db.delete(s.siteContent).where(eq(s.siteContent.key, LKEY));
  } finally {
    await db.delete(s.siteContent).where(eq(s.siteContent.key, KEY));
    await db.delete(s.users).where(eq(s.users.id, UID));
  }

  console.log(failures ? `\n${failures} FAILED` : "\nAll content tests passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
