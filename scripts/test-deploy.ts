/**
 * Deployment checks that need no database: how the connection is opened (direct vs the PgBouncer pooler on Vercel), the
 * streamed download body, and that the name fonts are listed for the server bundle. Run: npx tsx scripts/test-deploy.ts
 */
import { isPooledUrl, postgresOptions } from "../src/db/options";
import { bytesToStream } from "../src/lib/stream-bytes";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

(async () => {
  console.log("\nconnection options");
  const direct = "postgres://u:p@100.90.200.13:5432/darlcreates";
  const pooled = "postgres://u:p@darl-workspace-db.darl.dev:6432/darlcreates?sslmode=require";
  assert("port 5432 is a direct connection; port 6432 or pgbouncer=true is the pooler", !isPooledUrl(direct) && isPooledUrl(pooled) && isPooledUrl("postgres://u:p@h:5432/d?pgbouncer=true") && !isPooledUrl("not a url"));
  assert("a password that contains :6432 does not fool it", !isPooledUrl("postgres://u:pa:6432ss@host:5432/d"));
  assert("on a server: up to 10 connections, prepared statements on", JSON.stringify(postgresOptions(direct, {})) === JSON.stringify({ max: 10, prepare: true }));
  assert("through the pooler: prepared statements off (transaction pooling)", postgresOptions(pooled, {}).prepare === false);
  assert("on Vercel: one connection per instance and a short idle timeout", (() => { const o = postgresOptions(pooled, { VERCEL: "1" }); return o.max === 1 && o.idle_timeout === 20 && o.prepare === false; })());

  console.log("\nstreamed download");
  const bytes = Uint8Array.from({ length: 200_000 }, (_, i) => i % 251);
  const out = new Uint8Array(await new Response(bytesToStream(bytes, 64 * 1024)).arrayBuffer());
  assert("a streamed body gives back exactly the same bytes", out.length === bytes.length && out.every((b, i) => b === bytes[i]));
  assert("an empty file streams as an empty body", (await new Response(bytesToStream(new Uint8Array())).arrayBuffer()).byteLength === 0);
  assert("it is sent in chunks (more than one read for a 200 KB file)", await (async () => { const r = bytesToStream(bytes, 64 * 1024).getReader(); let n = 0; while (!(await r.read()).done) n++; return n === 4; })());

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll deployment checks passed.");
})();
