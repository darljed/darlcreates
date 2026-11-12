/**
 * Every page shows a skeleton while it loads: each page.tsx has a loading.tsx in its own folder or above it (inside src/app),
 * and no page falls back to a bare "Loading…" line. Static check, no DB. Run: npx tsx scripts/test-loading.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

const APP = join(__dirname, "..", "src", "app");
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}
const files = walk(APP);

console.log("\nevery page has a loading skeleton");
for (const page of files.filter((f) => /\/page\.tsx$/.test(f))) {
  const rel = relative(APP, page);
  if (rel === "page.tsx") continue; // the bare root has no layout group of its own
  let dir = dirname(page), found = false;
  while (dir.startsWith(APP) && dir !== APP) {
    if (existsSync(join(dir, "loading.tsx"))) { found = true; break; }
    dir = dirname(dir);
  }
  assert(rel, found);
}

console.log("\nloading files use the shared skeletons");
for (const f of files.filter((x) => /\/loading\.tsx$/.test(x))) {
  assert(relative(APP, f), /from "@\/components\/skeletons"/.test(readFileSync(f, "utf8")));
}

console.log("\nno bare Loading… text left");
const sources = [...files, ...walk(join(APP, "..", "components"))].filter((f) => /\.tsx$/.test(f));
const offenders = sources.filter((f) => /["'>]\s*Loading(…|\.\.\.)/.test(readFileSync(f, "utf8")) && !/skeletons\.tsx$/.test(f));
assert("no page or component shows a plain Loading… line", offenders.length === 0, offenders.map((o) => relative(APP, o)).join(", "));

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll loading checks passed.");
