/**
 * Guard against the dev-only "Instant / blocking route" overlay (the build does NOT catch it).
 * A layout's `export const instant = false` does NOT cover child pages. Rules:
 *   A) every admin page that awaits data must `export const instant = false` or use <Suspense>
 *   B) ANY page that awaits params/searchParams must use <Suspense> or `instant = false`
 *      (otherwise a slug not known at build time, e.g. a newly created product, blocks navigation)
 * Static scan, no server needed. Run: npx tsx scripts/test-instant.ts
 * ponytail: text heuristic, not a parser.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const APP = join(__dirname, "..", "src", "app");
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return pages(p);
    return n === "page.tsx" ? [p] : [];
  });
}

const OPT_OUT = /export const instant\s*=\s*false/;
let failures = 0;
for (const file of pages(APP)) {
  const src = readFileSync(file, "utf8");
  const rel = relative(APP, file);
  const isAdmin = rel.startsWith("(admin)");
  const guarded = OPT_OUT.test(src) || src.includes("<Suspense");
  const problems: string[] = [];
  if (isAdmin && /\bawait\s/.test(src) && !guarded) problems.push("admin page reads data without instant=false / <Suspense>");
  if (/await\s+(params|searchParams)\b/.test(src) && !guarded) problems.push("awaits params/searchParams without <Suspense> / instant=false");
  console.log(`  ${problems.length ? "✗" : "✓"} ${rel}${problems.length ? "  -> " + problems.join("; ") : ""}`);
  if (problems.length) failures++;
}
if (failures) {
  console.error(`\n${failures} page(s) would trigger the Instant overlay`);
  process.exit(1);
}
console.log("\nAll pages are covered.");
