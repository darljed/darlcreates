/**
 * Upload rules + live S3 round trip (presigned PUT -> HEAD -> signed GET -> delete).
 * Needs AWS_* + S3_BUCKET in .env.local. Run: npx tsx scripts/test-uploads.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });

let failures = 0;
function assert(name: string, cond: boolean) {
  if (!cond) {
    failures++;
    console.error(`  ✗ ${name}`);
  } else console.log(`  ✓ ${name}`);
}

async function main() {
  const { validateUpload, storedContentType, KEY_PATTERNS } = await import("../src/lib/uploads");
  const storage = await import("../src/lib/storage");

  // --- pure validation ---
  assert("accepts .stl", validateUpload("stl", "cube.STL", "", 1000) === null);
  assert("rejects .exe as stl", validateUpload("stl", "a.exe", "", 1000) !== null);
  assert("rejects empty file", validateUpload("stl", "a.stl", "", 0) !== null);
  assert("rejects 51MB stl", validateUpload("stl", "a.stl", "", 51 * 1024 * 1024) !== null);
  assert("accepts png photo", validateUpload("photo", "a.png", "image/png", 1000) === null);
  assert("rejects svg photo", validateUpload("photo", "a.svg", "image/svg+xml", 1000) !== null);
  assert("rejects .jpg with wrong mime", validateUpload("photo", "a.jpg", "text/html", 1000) !== null);
  assert("rejects 6MB photo", validateUpload("photo", "a.jpg", "image/jpeg", 6 * 1024 * 1024) !== null);
  assert("stl content type is forced", storedContentType("stl", "text/html") === "model/stl");
  assert("key pattern allows built key", KEY_PATTERNS.stl.test(storage.buildKey("stl", "my model.stl")));
  assert("key pattern blocks traversal", !KEY_PATTERNS.stl.test("stl/../customer/x"));
  assert("key pattern blocks other prefix", !KEY_PATTERNS.photo.test("proof/abc.png"));
  assert("fileUrl builds stable path", storage.fileUrl("photos/abc-x.png") === "/api/files/photos/abc-x.png");
  assert("fileUrl null-safe", storage.fileUrl(null) === null);

  // --- live S3 round trip ---
  if (!storage.isStorageConfigured()) {
    console.error("  ✗ storage not configured — skipping live checks");
    failures++;
  } else {
    const key = storage.buildKey("stl", `TEST-${Date.now()}.stl`);
    const body = "solid test\nendsolid test\n";
    try {
      const putUrl = await storage.presignUpload(key, "model/stl", 60);
      const put = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": "model/stl" },
        body,
      });
      assert("presigned PUT succeeds", put.ok);
      assert("headObject returns size", (await storage.headObject(key)) === body.length);

      const getUrl = await storage.readUrl(key, 60);
      const got = getUrl ? await fetch(getUrl) : null;
      assert("signed GET returns the bytes", got?.ok === true && (await got.text()) === body);

      // A PUT signed for model/stl must not accept a different content type.
      const bad = await fetch(await storage.presignUpload(key, "model/stl", 60), {
        method: "PUT",
        headers: { "Content-Type": "text/html" },
        body: "<script>",
      });
      assert("content-type mismatch is rejected", !bad.ok);
    } finally {
      await storage.deleteObject(key).catch(() => {});
      assert("test object cleaned up", (await storage.headObject(key)) === null);
    }
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log("\nAll upload checks passed.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
