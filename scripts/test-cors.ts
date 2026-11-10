/**
 * Browser-style CORS check for direct S3 uploads from each dev origin.
 * A failure here shows up in the browser as a failed upload even though
 * /api/uploads/presign returned 200 (the PUT is blocked, never reaches S3).
 * Run: npx tsx scripts/test-cors.ts   (needs AWS_* + S3_BUCKET in .env.local)
 *
 * To add an origin, update the bucket CORS (see docs/setup.md) and add it below.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

const ORIGINS = [
  "http://localhost:3000",
  "http://localhost:3001",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:3001",
  "http://macbook-01.tail85990d.ts.net:3000",
  "http://macbook-01.tail85990d.ts.net:3001",
];

let failures = 0;
function assert(name: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${name}`);
  } else console.log(`  ✓ ${name}`);
}

async function main() {
  const s = await import("../src/lib/storage");
  if (!s.isStorageConfigured()) {
    console.error("storage not configured");
    process.exit(1);
  }
  for (const origin of ORIGINS) {
    const key = s.buildKey("stl", `TEST-cors-${Date.now()}.stl`);
    try {
      const url = await s.presignUpload(key, "model/stl", 60);
      const pre = await fetch(url, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "PUT",
          "Access-Control-Request-Headers": "content-type",
        },
      });
      assert(
        `preflight allowed from ${origin}`,
        pre.ok && pre.headers.get("access-control-allow-origin") === origin,
      );
      const put = await fetch(url, {
        method: "PUT",
        headers: { Origin: origin, "Content-Type": "model/stl" },
        body: "solid x\nendsolid x\n",
      });
      assert(
        `PUT succeeds + exposes CORS header from ${origin}`,
        put.ok && put.headers.get("access-control-allow-origin") === origin,
      );
    } finally {
      await s.deleteObject(key).catch(() => {});
    }
  }
  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll CORS checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
