/** Shop search + category filter (pure). Run: npx tsx scripts/test-product-filter.ts */
import { categoryCounts, filterProducts, matchesQuery, normalize } from "../src/lib/product-filter";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}
const P = [
  { name: "Outdoor Phone Stand", description: "Compact stand for camping, hiking and travel.", category: "keychain" },
  { name: "Minimalist Phone Stand", description: "Desk stand at the perfect angle.", category: "stands" },
  { name: "Custom Name Keychain", description: "Your name as a durable 3D-printed keychain.", category: "keychains" },
  { name: "Fidget Desk Clicker", description: "A satisfying tactile clicker.", category: "toys" },
  { name: "Café Mug Holder", description: "Holds a mug.", category: "stands" },
];
const names = (xs: { name: string }[]) => xs.map((x) => x.name);

console.log("\nmatching");
assert("empty query matches everything", filterProducts(P, "", null).length === 5);
assert("whitespace-only query matches everything", filterProducts(P, "   ", null).length === 5);
assert("case-insensitive", names(filterProducts(P, "KEYCHAIN", null)).includes("Custom Name Keychain"));
assert("matches the name", names(filterProducts(P, "clicker", null)).join() === "Fidget Desk Clicker");
assert("matches the description", names(filterProducts(P, "camping", null)).join() === "Outdoor Phone Stand");
assert("matches the category text", names(filterProducts(P, "toys", null)).join() === "Fidget Desk Clicker");
assert("every word must match (AND)", names(filterProducts(P, "phone stand", null)).length === 2);
assert("word order doesn't matter", names(filterProducts(P, "stand phone", null)).length === 2);
assert("narrowing: 'outdoor phone' -> 1", names(filterProducts(P, "outdoor phone", null)).join() === "Outdoor Phone Stand");
assert("extra spaces between words ok", names(filterProducts(P, "  outdoor    phone ", null)).length === 1);
assert("no match => empty list", filterProducts(P, "zzzz", null).length === 0);
assert("accent-insensitive: 'cafe' finds 'Café'", names(filterProducts(P, "cafe", null)).join() === "Café Mug Holder");
assert("accent-insensitive the other way: 'café' finds 'Cafe'", matchesQuery({ name: "Cafe Stand", description: "", category: "x" }, "café"));
assert("regex characters are treated literally (no crash)", filterProducts(P, ".*(", null).length === 0);
assert("normalize collapses whitespace + lowercases", normalize("  HeLLo   WORLD ") === "hello world");

console.log("\ncategory");
assert("category filter is exact (keychain != keychains)", names(filterProducts(P, "", "keychain")).join() === "Outdoor Phone Stand");
assert("category + query combine", names(filterProducts(P, "mug", "stands")).join() === "Café Mug Holder");
assert("category + non-matching query => empty", filterProducts(P, "clicker", "stands").length === 0);
assert("null category = all", filterProducts(P, "", null).length === 5);
const cc = categoryCounts(P);
assert("counts: stands=2 first", cc[0].category === "stands" && cc[0].count === 2);
assert("counts sum to the total", cc.reduce((a, c) => a + c.count, 0) === P.length);
assert("ties sort alphabetically", cc.slice(1).map((c) => c.category).join() === "keychain,keychains,toys");
assert("input order is not mutated", P[0].name === "Outdoor Phone Stand");

const MIXED = [
  { name: "A", description: "", category: "Keychains" },
  { name: "B", description: "", category: "keychains " },
  { name: "C", description: "", category: "KEYCHAINS" },
  { name: "D", description: "", category: "Toys" },
];
assert("categories differing only in case/spaces are one category", categoryCounts(MIXED).length === 2 && categoryCounts(MIXED)[0].count === 3);
assert("the category filter ignores case and surrounding spaces", names(filterProducts(MIXED, "", "keychains")).join() === "A,B,C" && names(filterProducts(MIXED, "", "  KEYCHAINS")).join() === "A,B,C");

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll product-filter checks passed.");
