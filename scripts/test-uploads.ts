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
  const { modelFormatOf, looksLikeZip } = await import("../src/lib/uploads");
  assert("accepts .stl", validateUpload("model", "cube.STL", "", 1000) === null);
  assert("accepts .3mf", validateUpload("model", "stand.3mf", "", 1000) === null);
  assert("accepts .3MF (case-insensitive)", validateUpload("model", "STAND.3MF", "application/octet-stream", 1000) === null);
  assert("rejects .exe as model", validateUpload("model", "a.exe", "", 1000) !== null);
  assert("rejects .obj as model", validateUpload("model", "a.obj", "", 1000) !== null);
  assert("rejects empty file", validateUpload("model", "a.stl", "", 0) !== null);
  assert("rejects 51MB model", validateUpload("model", "a.3mf", "", 51 * 1024 * 1024) !== null);
  assert("accepts png photo", validateUpload("photo", "a.png", "image/png", 1000) === null);
  assert("rejects svg photo", validateUpload("photo", "a.svg", "image/svg+xml", 1000) !== null);
  assert("rejects .jpg with wrong mime", validateUpload("photo", "a.jpg", "text/html", 1000) !== null);
  assert("rejects 6MB photo", validateUpload("photo", "a.jpg", "image/jpeg", 6 * 1024 * 1024) !== null);
  assert("stl content type is forced", storedContentType("model", "a.stl", "text/html") === "model/stl");
  assert("3mf content type is forced", storedContentType("model", "a.3mf", "text/html") === "model/3mf");
  assert("modelFormatOf 3mf (path + query)", modelFormatOf("/api/files/models/x-Stand.3MF?v=1") === "3mf");
  assert("modelFormatOf defaults to stl", modelFormatOf("/api/files/stl/x-cap.stl") === "stl");
  assert("new key pattern allows built key", KEY_PATTERNS.model.test(storage.buildKey("model", "my model.3mf")));
  assert("built model key lives under models/", storage.buildKey("model", "a.3mf").startsWith("models/"));
  assert("legacy stl/ keys stay valid", KEY_PATTERNS.model.test("stl/-xXTcjCOZTB2-obj_1_Assembly_2.stl"));
  assert("key pattern blocks traversal", !KEY_PATTERNS.model.test("models/../customer/x"));
  assert("key pattern blocks other prefix", !KEY_PATTERNS.photo.test("proof/abc.png"));
  assert("key pattern blocks proof/ as model", !KEY_PATTERNS.model.test("proof/abc.3mf"));
  assert("zip signature recognised", looksLikeZip(new Uint8Array([0x50, 0x4b, 0x03, 0x04])));
  assert("non-zip rejected", !looksLikeZip(new Uint8Array([0x3c, 0x68, 0x74, 0x6d])));
  assert("short buffer rejected", !looksLikeZip(new Uint8Array([0x50, 0x4b])));
  assert("fileUrl builds stable path", storage.fileUrl("photos/abc-x.png") === "/api/files/photos/abc-x.png");
  assert("fileUrl null-safe", storage.fileUrl(null) === null);

  // --- live S3 round trip ---
  if (!storage.isStorageConfigured()) {
    console.error("  ✗ storage not configured — skipping live checks");
    failures++;
  } else {
    const key = storage.buildKey("model", `TEST-${Date.now()}.3mf`);
    const body = "PK\u0003\u0004fake-zip-body";
    try {
      const putUrl = await storage.presignUpload(key, "model/3mf", 60);
      const put = await fetch(putUrl, {
        method: "PUT",
        headers: { "Content-Type": "model/3mf" },
        body,
      });
      assert("presigned PUT succeeds", put.ok);
      assert("headObject returns size", (await storage.headObject(key)) === body.length);

      const getUrl = await storage.readUrl(key, 60);
      const got = getUrl ? await fetch(getUrl) : null;
      const head = await storage.peekBytes(key, 4);
      assert("peekBytes reads the first 4 bytes (ranged GET)", looksLikeZip(head));
      assert("signed GET returns the bytes", got?.ok === true && (await got.text()) === body);

      // A PUT signed for model/3mf must not accept a different content type.
      const bad = await fetch(await storage.presignUpload(key, "model/3mf", 60), {
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
