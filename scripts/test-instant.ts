/**
 * Guard against the dev-only "Instant / blocking route" overlay on admin pages.
 * A layout's `export const instant = false` does NOT cover child pages, so every
 * admin page that awaits data must opt out itself (or wrap the read in <Suspense>).
 * Static scan (no server needed). Run: npx tsx scripts/test-instant.ts
 * ponytail: text heuristic, not a parser — it checks for `await ` + the opt-out.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "src", "app", "(admin)");
function pages(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return pages(p);
    return n === "page.tsx" ? [p] : [];
  });
}

let failures = 0;
for (const file of pages(ROOT)) {
  const src = readFileSync(file, "utf8");
  const rel = file.slice(ROOT.length - "(admin)".length);
  const awaits = /\bawait\s/.test(src);
  const ok =
    !awaits || /export const instant\s*=\s*false/.test(src) || src.includes("<Suspense");
  console.log(`  ${ok ? "✓" : "✗"} ${rel}${awaits ? "" : " (no data reads)"}`);
  if (!ok) failures++;
}
if (failures) {
  console.error(`\n${failures} admin page(s) read data without \`export const instant = false\` or <Suspense>`);
  process.exit(1);
}
console.log("\nAll admin pages are covered.");
