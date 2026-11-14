/**
 * Every form <Label> must be linked to its control (htmlFor/id, or wrap it), otherwise screen
 * readers don't announce it and clicking the label doesn't focus the field. Static scan.
 * Run: npx tsx scripts/test-a11y-labels.ts
 * ponytail: text heuristic over src/**.tsx, not a DOM audit; the browser E2E covers real pages.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = join(__dirname, "..", "src");
function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : p.endsWith(".tsx") ? [p] : [];
  });
}

let failures = 0, checked = 0;
for (const f of files(SRC)) {
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/<Label(?![^>]*htmlFor)[^>]*>([\s\S]*?)<\/Label>/g)) {
    const tail = s.slice(m.index! + m[0].length, m.index! + m[0].length + 260);
    const next = tail.match(/<(Input|Textarea|Select)\b([^>]*)/);
    if (!next) continue; // a Label that doesn't precede a control (e.g. a heading-like label)
    checked++;
    if (!/\sid=/.test(next[2]) && !/SelectTrigger\s+id=/.test(tail)) {
      failures++;
      const line = s.slice(0, m.index).split("\n").length;
      console.error(`  ✗ ${relative(SRC, f)}:${line} <Label> "${m[1].replace(/<[^>]+>|\s+/g, " ").trim().slice(0, 30)}" is not linked to its control`);
    }
  }
}
console.log(`  checked ${checked} unlinked-looking labels`);
if (failures) { console.error(`\n${failures} label(s) not linked`); process.exit(1); }
console.log("\nAll form labels are linked.");
