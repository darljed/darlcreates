/**
 * SEO / answer-engine markup: URL and text helpers, JSON-LD shape and escaping, robots.txt rules, and a static scan
 * that every private page is kept out of search while the public ones carry metadata. No DB, no server.
 * Run: npx tsx scripts/test-seo.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import {
  absoluteUrl, ANSWER_ENGINE_BOTS, breadcrumbLd, clip, faqLd, itemListLd, jsonLd, organizationLd, pageMetadata, PRIVATE_PATHS, productLd, websiteLd,
} from "../src/lib/seo";
import robots from "../src/app/robots";
import { DEFAULT_SITE_INFO, parseSiteInfo, siteInfoSchema } from "../src/lib/site-content-schema";

// schema.org JSON is deeply nested and loosely typed; the tests only poke at known paths
type Json = any; // eslint-disable-line @typescript-eslint/no-explicit-any
let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}
process.env.BETTER_AUTH_URL = "https://shop.example.ph/";

console.log("\nurls and text");
assert("absoluteUrl joins host and path, trims the trailing slash", absoluteUrl("/products/x") === "https://shop.example.ph/products/x");
assert("absoluteUrl leaves absolute URLs alone", absoluteUrl("https://cdn.example.com/a.png") === "https://cdn.example.com/a.png");
assert("clip keeps short text", clip("Short text.") === "Short text.");
const long = "Custom 3D printed gifts made to order in the Philippines. ".repeat(10);
assert("clip cuts long text at a word under the limit with an ellipsis", clip(long, 155).length <= 155 && clip(long, 155).endsWith("…") && !/\s…$/.test(clip(long, 155)));
assert("clip collapses whitespace and newlines", clip("a\n\n  b\t c") === "a b c");

console.log("\njson-ld escaping");
const evil = jsonLd({ name: "</script><script>alert(1)</script>", sep: "a\u2028b" });
assert("cannot close the script tag", !evil.includes("</script>") && !evil.includes("<"));
assert("still valid JSON that round-trips", JSON.parse(evil).name === "</script><script>alert(1)</script>");

console.log("\nschema.org markup");
const info = { ...DEFAULT_SITE_INFO, store: { ...DEFAULT_SITE_INFO.store, phone: "+63 995 000 0000" }, social: [{ label: "Facebook", href: "https://facebook.com/x" }, { label: "Bad", href: "/local" }] };
const org = organizationLd(info, "/brand/icon.png") as Record<string, unknown>;
assert("Organization has name, url, absolute logo, country", org["@type"] === "Organization" && org.name === "Darl Creates" && org.url === "https://shop.example.ph" && org.logo === "https://shop.example.ph/brand/icon.png" && (org.areaServed as { name: string }).name === "Philippines");
assert("sameAs keeps only https links", JSON.stringify(org.sameAs) === JSON.stringify(["https://facebook.com/x"]));
assert("WebSite points at the Organization", (websiteLd(DEFAULT_SITE_INFO).publisher as { "@id": string })["@id"] === org["@id"]);
const prod = productLd({ name: "Phone Stand", slug: "phone-stand", description: "A stand.", category: "stands", basePriceCents: 12550 }, { storeName: "Darl Creates", imageUrls: ["/api/files/photos/a.jpg"], rating: { average: 4.666, count: 3 } }) as Record<string, Json>;
assert("Product price is pesos with two decimals in PHP", prod.offers.price === "125.50" && prod.offers.priceCurrency === "PHP");
assert("Product images are absolute", prod.image[0] === "https://shop.example.ph/api/files/photos/a.jpg");
assert("rating present with reviews, rounded to one decimal", prod.aggregateRating.ratingValue === 4.7 && prod.aggregateRating.reviewCount === 3);
assert("no rating block when there are no reviews", !("aggregateRating" in (productLd({ name: "x", slug: "x", description: "", category: "c", basePriceCents: 100 }, { storeName: "s", imageUrls: [], rating: { average: 0, count: 0 } }) as object)));
assert("breadcrumb positions start at 1 with absolute links", (breadcrumbLd([{ name: "Shop", path: "/products" }, { name: "X", path: "/products/x" }]).itemListElement[1] as Json).item === "https://shop.example.ph/products/x" && (breadcrumbLd([{ name: "S", path: "/" }]).itemListElement[0] as Json).position === 1);
assert("FAQPage mirrors the questions", (faqLd([{ q: "How do I pay?", a: "GCash." }])!.mainEntity[0] as Json).acceptedAnswer.text === "GCash." && faqLd([]) === null);
assert("ItemList links to product pages", (itemListLd([{ name: "A", slug: "a" }]).itemListElement[0] as Json).url === "https://shop.example.ph/products/a");

console.log("\npage metadata");
const m = pageMetadata({ title: "T", description: long, path: "/products", image: { url: "https://shop.example.ph/i.jpg" } });
assert("canonical is the page's own path", (m.alternates as { canonical: string }).canonical === "/products");
assert("description is clipped to 160", (m.description ?? "").length <= 160);
assert("share image makes a large Twitter card", (m.twitter as { card?: string }).card === "summary_large_image");
assert("absoluteTitle skips the store-name suffix", JSON.stringify(pageMetadata({ title: "Home", description: "d", path: "/", absoluteTitle: true }).title) === '{"absolute":"Home"}');
assert("noindex option sets robots", (pageMetadata({ title: "T", description: "d", path: "/x", noindex: true }).robots as { index: boolean }).index === false);

console.log("\nrobots.txt");
const r = robots();
const rule = (Array.isArray(r.rules) ? r.rules : [r.rules])[0];
const agents = ([] as string[]).concat(rule.userAgent ?? []);
assert("all answer-engine bots are named, plus *", ANSWER_ENGINE_BOTS.every((b) => agents.includes(b)) && agents.includes("*"));
assert("every private path is disallowed", PRIVATE_PATHS.every((p) => ([] as string[]).concat(rule.disallow ?? []).includes(p)));
assert("product photos under /api/files stay crawlable (longer Allow beats /api/)", ([] as string[]).concat(rule.allow ?? []).includes("/api/files/"));
assert("sitemap is absolute", r.sitemap === "https://shop.example.ph/sitemap.xml");

console.log("\nstore info schema");
assert("an old stored row without seo still parses and gets the default SEO text", (() => {
  const { seo: _seo, ...old } = DEFAULT_SITE_INFO; void _seo;
  const p = siteInfoSchema.safeParse(old);
  return p.success && p.data.seo.title === DEFAULT_SITE_INFO.seo.title;
})());
assert("parseSiteInfo never throws on junk", parseSiteInfo({ nope: 1 }).seo.title.length > 0);
assert("seo title over 70 chars is rejected", !siteInfoSchema.safeParse({ ...DEFAULT_SITE_INFO, seo: { title: "x".repeat(71), description: "d" } }).success);
assert("default title and description fit their limits", DEFAULT_SITE_INFO.seo.title.length <= 70 && DEFAULT_SITE_INFO.seo.description.length <= 170);

console.log("\npages: private ones are noindex, public ones have metadata");
const APP = join(__dirname, "..", "src", "app");
const read = (rel: string) => readFileSync(join(APP, rel), "utf8");
for (const f of ["(admin)/admin/layout.tsx", "(portal)/layout.tsx"]) assert(`${f} sets robots noindex for the whole area`, /index:\s*false/.test(read(f)));
for (const f of ["(shop)/cart/page.tsx", "(shop)/checkout/page.tsx", "(shop)/sign-in/page.tsx", "(shop)/consent/page.tsx"]) assert(`${f} is noindex`, read(f).includes("NOINDEX"));
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? pages(p) : n === "page.tsx" ? [p] : []; });
}
const publicPages = pages(join(APP, "(shop)")).filter((p) => !/cart|checkout|sign-in|consent/.test(p));
for (const p of publicPages) {
  const src = readFileSync(p, "utf8");
  assert(`${relative(APP, p)} has metadata and a canonical`, /generateMetadata|export const metadata/.test(src) && /pageMetadata/.test(src));
}

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll SEO checks passed.");
