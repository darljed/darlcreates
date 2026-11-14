/**
 * Documentation guard: fails when code exists that the docs do not mention. Static scan (no DB, no server).
 *   1. every `process.env.X` is in docs/configuration.md
 *   2. every file in src/lib, src/components, src/db and scripts is in docs/code-map.md, and has a header comment
 *   3. every page/route handler path is in docs/code-map.md
 *   4. every database table is in docs/database.md
 *   5. every exported Server Action and every cache tag is in docs/api-routes.md
 *   6. every npm script is in docs/operations.md or docs/configuration.md
 *   7. the docs index (docs/README.md) links every docs/*.md file
 * Add the doc entry in the same change as the code. Run: npx tsx scripts/test-docs.ts
 * ponytail: regex scan, not a parser; a name mentioned anywhere in the right doc counts as documented.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative } from "node:path";

const ROOT = join(__dirname, "..");
const read = (p: string) => readFileSync(join(ROOT, p), "utf8");
const SKIP_DIRS = new Set(["node_modules", ".next", ".next-build", ".git", ".playwright-mcp"]);

function walk(dir: string, keep: (f: string) => boolean): string[] {
  const abs = join(ROOT, dir);
  if (!existsSync(abs)) return [];
  return readdirSync(abs).flatMap((n) => {
    if (SKIP_DIRS.has(n)) return [];
    const rel = join(dir, n);
    return statSync(join(ROOT, rel)).isDirectory() ? walk(rel, keep) : keep(rel) ? [rel] : [];
  });
}

let failures = 0;
let checks = 0;
function check(ok: boolean, message: string) {
  checks++;
  if (!ok) {
    failures++;
    console.log(`  FAIL  ${message}`);
  }
}

const configuration = read("docs/configuration.md");
const codeMap = read("docs/code-map.md");
const database = read("docs/database.md");
const apiRoutes = read("docs/api-routes.md");
const operations = read("docs/operations.md");
const docsIndex = read("docs/README.md");

const isCode = (f: string) => /\.(ts|tsx|py|mjs)$/.test(f);

// 1. environment variables --------------------------------------------------------------------------------------
console.log("env vars");
const envNames = new Set<string>();
for (const f of [...walk("src", isCode), ...walk("scripts", isCode), "drizzle.config.ts", "next.config.ts"]) {
  if (f === "scripts/test-docs.ts") continue;
  const src = read(f);
  for (const m of src.matchAll(/process\.env\.([A-Z][A-Z0-9_]+)/g)) envNames.add(m[1]);
  for (const m of src.matchAll(/process\.env\[\s*["']([A-Z][A-Z0-9_]+)["']\s*\]/g)) envNames.add(m[1]);
}
check(envNames.size > 10, `found env vars (${envNames.size})`);
for (const name of [...envNames].sort()) check(configuration.includes(`\`${name}\``), `env var ${name} is not in docs/configuration.md`);

// 2. files ------------------------------------------------------------------------------------------------------
console.log("files");
const fileList = [
  ...walk("src/lib", isCode),
  ...walk("src/components", isCode),
  ...walk("src/db", isCode),
  ...walk("scripts", (f) => isCode(f) || /\.(stl|3mf)$/.test(f)),
];
const mentioned = (name: string) => {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp("`(?:[\\w./\\[\\]-]*/)?" + esc + "`").test(codeMap);
};
for (const f of fileList) check(mentioned(basename(f)), `${f} is not in docs/code-map.md`);

// header comment: after directives ("use client"), a shebang and import statements, the first thing in the file must be
// a comment saying what the file is for (python: module docstring or # comment)
const HEADER_EXEMPT = new Set(["src/lib/utils.ts", "src/lib/auth-client.ts", "src/db/schema/index.ts"]);
function firstCodeLine(src: string): string | undefined {
  let inImport = false;
  for (const raw of src.split("\n")) {
    const l = raw.trim();
    if (!l || l.startsWith("#!") || /^["']use (client|server)["'];?$/.test(l)) continue;
    if (inImport) {
      if (/\bfrom\s+["'][^"']+["'];?$/.test(l)) inImport = false;
      continue;
    }
    if (/^import\s/.test(l) || /^from\s+\S+\s+import\s/.test(l)) {
      inImport = /^import\s+(type\s+)?[\w*{]/.test(l) && !/\bfrom\s+["'][^"']+["'];?$/.test(l) && !/^import\s+\w+$/.test(l) && /\{\s*$|,\s*$|^import\s+type\s*\{?\s*$/.test(l);
      continue;
    }
    return l;
  }
  return undefined;
}
for (const f of fileList.filter((x) => /\.(ts|tsx|py)$/.test(x) && !x.includes("/ui/") && !HEADER_EXEMPT.has(x))) {
  const first = firstCodeLine(read(f));
  check(!!first && /^(\/\*|\/\/|"""|#)/.test(first), `${f} has no header comment (first code line: ${first?.slice(0, 40)})`);
}

// 3. routes -----------------------------------------------------------------------------------------------------
console.log("routes");
const appFiles = walk("src/app", (f) => /\/(page\.tsx|route\.ts)$/.test(f));
check(appFiles.length > 20, `found routes (${appFiles.length})`);
for (const f of appFiles) {
  const route =
    "/" +
    relative("src/app", f)
      .replace(/\/(page\.tsx|route\.ts)$/, "")
      .split("/")
      .filter((seg) => seg && !/^\(.*\)$/.test(seg) && !/^(page|route)\.(tsx|ts)$/.test(seg))
      .join("/");
  check(codeMap.includes(`\`${route}\``), `route ${route} (${f}) is not in docs/code-map.md`);
}
// metadata files generate routes too
for (const [file, route] of [["robots.ts", "/robots.txt"], ["sitemap.ts", "/sitemap.xml"], ["manifest.ts", "/manifest.webmanifest"]] as const) {
  if (existsSync(join(ROOT, "src/app", file))) check(codeMap.includes(`\`${route}\``), `route ${route} (src/app/${file}) is not in docs/code-map.md`);
}
for (const nf of walk("src/app", (f) => f.endsWith("/not-found.tsx") || f === "src/app/not-found.tsx")) {
  const short = nf.replace("src/app/", "");
  check(codeMap.includes(short.replace(/\/not-found\.tsx$/, "")) || codeMap.includes("not-found.tsx"), `${nf} is not in docs/code-map.md`);
}

// 4. tables -----------------------------------------------------------------------------------------------------
console.log("tables");
const tables = walk("src/db/schema", isCode).flatMap((f) => [...read(f).matchAll(/pgTable\(\s*"([a-z_]+)"/g)].map((m) => m[1]));
check(tables.length >= 20, `found tables (${tables.length})`);
for (const t of tables) check(database.includes(`\`${t}\``), `table ${t} is not in docs/database.md`);

// 5. Server Actions and cache tags ------------------------------------------------------------------------------
console.log("actions and cache tags");
const actionFiles = walk("src/app", (f) => f.endsWith(".ts") && /^\s*["']use server["']/m.test(read(f)));
check(actionFiles.length >= 10, `found Server Action files (${actionFiles.length})`);
for (const f of actionFiles) {
  for (const m of read(f).matchAll(/^export (?:async )?function (\w+)/gm)) check(apiRoutes.includes(`\`${m[1]}\``), `action ${m[1]} (${f}) is not in docs/api-routes.md`);
  check(codeMap.includes(f.replace("src/app/", "").replace(/^\(admin\)\/admin\//, "(admin)/admin/")), `${f} is not in docs/code-map.md`);
}

const tags = new Set<string>();
for (const f of walk("src", isCode).concat(walk("scripts", isCode))) {
  if (f.startsWith("scripts/test-")) continue; // tests mention tags in strings and regexes
  const src = read(f);
  for (const m of src.matchAll(/export const \w+_TAG = "([^"]+)"/g)) tags.add(m[1]);
  for (const m of src.matchAll(/\b(?:cacheTag|updateTag|revalidateTag)\(\s*(["`])([a-z][a-z0-9:_-]*)/g)) tags.add(m[2]);
  for (const m of src.matchAll(/=>\s*`(site:legal:)\$\{/g)) tags.add(m[1]);
}
check(tags.size >= 6, `found cache tags (${tags.size})`);
for (const t of [...tags].sort()) check(apiRoutes.includes(t), `cache tag "${t}" is not in docs/api-routes.md`);

// 6. npm scripts ------------------------------------------------------------------------------------------------
console.log("npm scripts");
const npmScripts = Object.keys(JSON.parse(read("package.json")).scripts ?? {});
for (const s of npmScripts) check(operations.includes(`\`${s}\``) || configuration.includes(`\`${s}\``) || operations.includes(`npm run ${s}`), `npm script "${s}" is not in docs/operations.md or docs/configuration.md`);

// 7. docs index -------------------------------------------------------------------------------------------------
console.log("docs index");
for (const f of readdirSync(join(ROOT, "docs")).filter((n) => n.endsWith(".md") && n !== "README.md")) check(docsIndex.includes(`(./${f})`), `docs/${f} is not linked from docs/README.md`);

console.log(failures ? `\n${failures} of ${checks} checks FAILED` : `\nOK: ${checks} checks passed`);
process.exit(failures ? 1 : 0);
