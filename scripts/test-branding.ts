/**
 * Logos & branding: image-size reader, per-slot rules, schema, store round trip, "every slot is actually used",
 * and the server-side verifier against real S3 objects (valid, wrong shape, fake image). Isolated test keys.
 * Run: npx tsx scripts/test-branding.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { readFileSync, readdirSync, statSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { eq } from "drizzle-orm";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

// ---- tiny image builders ----
function crc32(buf: Uint8Array): number {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
const be32 = (n: number) => Uint8Array.from([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
function chunk(type: string, data: Uint8Array) {
  const t = new TextEncoder().encode(type);
  const body = new Uint8Array(t.length + data.length); body.set(t); body.set(data, t.length);
  return Buffer.concat([be32(data.length), body, be32(crc32(body))]);
}
/** A real, valid, solid-colour PNG of the given size. */
function makePng(w: number, h: number): Buffer {
  const ihdr = Buffer.concat([be32(w), be32(h), Uint8Array.from([8, 2, 0, 0, 0])]);
  const row = Buffer.alloc(1 + w * 3, 0x66); row[0] = 0;
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())]);
}
function jpegHeader(w: number, h: number, padApp = 0) {
  const app = Buffer.concat([Uint8Array.from([0xff, 0xe1, ((padApp + 2) >> 8) & 255, (padApp + 2) & 255]), Buffer.alloc(padApp, 1)]);
  const sof = Uint8Array.from([0xff, 0xc0, 0, 17, 8, (h >> 8) & 255, h & 255, (w >> 8) & 255, w & 255, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  return Buffer.concat([Uint8Array.from([0xff, 0xd8]), app, sof]);
}
function webpX(w: number, h: number) {
  const b = Buffer.alloc(30); b.write("RIFF", 0); b.write("WEBP", 8); b.write("VP8X", 12);
  b.writeUIntLE(w - 1, 24, 3); b.writeUIntLE(h - 1, 27, 3); return b;
}
function webpL(w: number, h: number) {
  const b = Buffer.alloc(30); b.write("RIFF", 0); b.write("WEBP", 8); b.write("VP8L", 12); b[20] = 0x2f;
  b.writeUInt32LE(((w - 1) & 0x3fff) | (((h - 1) & 0x3fff) << 14), 21); return b;
}
function webpLossy(w: number, h: number) {
  const b = Buffer.alloc(30); b.write("RIFF", 0); b.write("WEBP", 8); b.write("VP8 ", 12);
  b[23] = 0x9d; b[24] = 0x01; b[25] = 0x2a; b.writeUInt16LE(w, 26); b.writeUInt16LE(h, 28); return b;
}

async function main() {
  const { imageSize } = await import("../src/lib/image-size");
  const bs = await import("../src/lib/branding-schema");
  const { LOGO_SLOTS, LOGO_SPECS, checkLogo, logoWarning } = bs;

  console.log("\nimage size reader");
  const p = imageSize(makePng(640, 480));
  assert("PNG", p?.type === "png" && p.width === 640 && p.height === 480, JSON.stringify(p));
  const j = imageSize(jpegHeader(1200, 630));
  assert("JPEG", j?.type === "jpeg" && j.width === 1200 && j.height === 630, JSON.stringify(j));
  const j2 = imageSize(jpegHeader(800, 600, 3000));
  assert("JPEG with a big metadata block before the frame header", j2?.width === 800 && j2?.height === 600, JSON.stringify(j2));
  const w1 = imageSize(webpX(300, 200));
  assert("WebP (extended)", w1?.type === "webp" && w1.width === 300 && w1.height === 200, JSON.stringify(w1));
  const w2 = imageSize(webpL(512, 512));
  assert("WebP (lossless)", w2?.width === 512 && w2?.height === 512, JSON.stringify(w2));
  const w3 = imageSize(webpLossy(256, 128));
  assert("WebP (lossy)", w3?.width === 256 && w3?.height === 128, JSON.stringify(w3));
  assert("GIF is not read", imageSize(Buffer.from("GIF89a" + "\0".repeat(40))) === null);
  assert("SVG/text is not read", imageSize(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"></svg>')) === null);
  assert("a truncated PNG is not read", imageSize(makePng(10, 10).subarray(0, 20)) === null);
  assert("empty input is not read", imageSize(new Uint8Array()) === null);
  assert("a JPEG that never reaches a frame header is not read", imageSize(Buffer.concat([Uint8Array.from([0xff, 0xd8]), Buffer.alloc(100, 0)])) === null);
  for (const [file, w, h] of [["logo-horizontal.png", 1000, 234], ["logo-horizontal-dark.png", 1000, 234], ["logo-icon.png", 512, 633], ["icon.png", 512, 512], ["apple-icon.png", 180, 180]] as const) {
    const i = imageSize(readFileSync(`public/brand/${file}`));
    assert(`real file ${file} is ${w}×${h}`, i?.width === w && i?.height === h, JSON.stringify(i));
  }

  console.log("\nper-slot rules");
  const rec: Record<string, [number, number]> = { horizontal: [1000, 234], horizontalDark: [1000, 234], icon: [512, 512], favicon: [512, 512], appleIcon: [180, 180], og: [1200, 630] };
  for (const slot of LOGO_SLOTS) {
    const [w, h] = rec[slot];
    assert(`${slot}: the recommended size passes`, checkLogo(slot, { width: w, height: h, bytes: 50_000, type: LOGO_SPECS[slot].types[0] }) === null, String(checkLogo(slot, { width: w, height: h, bytes: 50_000 })));
  }
  assert("the built-in logo files all pass their own slot", checkLogo("horizontal", { width: 1000, height: 234, bytes: 40000 }) === null && checkLogo("icon", { width: 512, height: 633, bytes: 112000 }) === null && checkLogo("appleIcon", { width: 180, height: 180, bytes: 11000 }) === null);
  assert("favicon must be square", checkLogo("favicon", { width: 512, height: 480, bytes: 1000 }) !== null);
  assert("favicon too small is refused", checkLogo("favicon", { width: 128, height: 128, bytes: 1000 }) !== null);
  assert("apple icon must be square", checkLogo("appleIcon", { width: 180, height: 200, bytes: 1000 }) !== null);
  assert("a tall image is not a wide logo", checkLogo("horizontal", { width: 400, height: 400, bytes: 1000 }) !== null);
  assert("a very thin banner is not a wide logo", checkLogo("horizontal", { width: 4000, height: 100, bytes: 1000 }) !== null);
  assert("wide logo too small is refused", checkLogo("horizontal", { width: 200, height: 48, bytes: 1000 }) !== null);
  assert("og must be roughly 1.9:1", checkLogo("og", { width: 1000, height: 1000, bytes: 1000 }) !== null);
  assert("oversized dimensions are refused", checkLogo("og", { width: 9000, height: 4700, bytes: 1000 }) !== null);
  assert("file too large is refused", checkLogo("horizontal", { width: 1000, height: 234, bytes: 5 * 1024 * 1024 }) !== null);
  assert("a zero-size image is refused", checkLogo("icon", { width: 0, height: 0, bytes: 10 }) !== null);
  assert("apple icon must be PNG", checkLogo("appleIcon", { width: 180, height: 180, bytes: 1000, type: "webp" }) !== null);
  assert("og accepts JPEG", checkLogo("og", { width: 1200, height: 630, bytes: 1000, type: "jpeg" }) === null);
  assert("og refuses WebP", checkLogo("og", { width: 1200, height: 630, bytes: 1000, type: "webp" }) !== null);
  assert("wide logo accepts WebP", checkLogo("horizontal", { width: 1000, height: 234, bytes: 1000, type: "webp" }) === null);
  assert("wide logo refuses JPEG (no transparency)", checkLogo("horizontal", { width: 1000, height: 234, bytes: 1000, type: "jpeg" }) !== null);
  assert("warning for a short wide logo", logoWarning("horizontal", { width: 300, height: 60 }) !== null);
  assert("no warning at the recommended size", logoWarning("horizontal", { width: 1000, height: 234 }) === null);
  assert("every slot has a label, usage list and recommended size", LOGO_SLOTS.every((s) => LOGO_SPECS[s].label && LOGO_SPECS[s].usedIn.length && LOGO_SPECS[s].recommended));

  console.log("\nschema");
  const ok = { logos: { horizontal: { key: "site/abc-1.png", width: 10, height: 5 }, horizontalDark: null, icon: null, favicon: null, appleIcon: null, og: null } };
  assert("a valid branding doc parses", bs.brandingSchema.safeParse(ok).success);
  assert("a key outside site/ is refused", !bs.brandingSchema.safeParse({ logos: { ...ok.logos, icon: { key: "photos/x.png", width: 1, height: 1 } } }).success);
  assert("a path-traversal key is refused", !bs.brandingSchema.safeParse({ logos: { ...ok.logos, icon: { key: "site/../x.png", width: 1, height: 1 } } }).success);
  assert("garbage falls back to the built-in logos", bs.parseBranding({ nope: 1 }) === bs.DEFAULT_BRANDING);
  assert("brandingKeys lists uploaded keys", bs.brandingKeys(ok).join() === "site/abc-1.png");

  console.log("\nevery slot is used by a page");
  const files: string[] = [];
  (function walk(dir: string) {
    for (const f of readdirSync(dir)) {
      const full = `${dir}/${f}`;
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(tsx?)$/.test(f)) files.push(full);
    }
  })("src");
  const consumers = files.filter((f) => !/branding-schema|branding-editor|admin\/content\/actions|branding-verify|site-content-store/.test(f));
  for (const slot of LOGO_SLOTS) {
    const user = consumers.find((f) => readFileSync(f, "utf8").includes(`logos.${slot}`));
    assert(`slot "${slot}" is rendered somewhere (${user ?? "NOWHERE"})`, Boolean(user));
  }
  assert("no SVG is accepted for logos", !LOGO_SLOTS.some((s) => /svg/i.test(LOGO_SPECS[s].formats)));

  console.log("\nstore (live DB, TEST key)");
  const { db } = await import("../src/db");
  const s = await import("../src/db/schema");
  const store = await import("../src/lib/site-content-store");
  const KEY = `TEST-brand-${Date.now()}`;
  try {
    assert("missing row = built-in logos", (await store.loadBranding(KEY)).logos.horizontal === null);
    await store.saveBranding(ok, null, KEY);
    assert("saved branding round-trips", (await store.loadBranding(KEY)).logos.horizontal?.key === "site/abc-1.png");
    let threw = false; try { await store.saveBranding({ logos: { ...ok.logos, icon: { key: "x/y.png", width: 1, height: 1 } } }, null, KEY); } catch { threw = true; }
    assert("the store refuses a bad key", threw);
    await db.update(s.siteContent).set({ data: { corrupted: true } }).where(eq(s.siteContent.key, KEY));
    assert("a corrupt row falls back to built-in logos", (await store.loadBranding(KEY)).logos.horizontal === null);
  } finally {
    await db.delete(s.siteContent).where(eq(s.siteContent.key, KEY));
  }

  console.log("\nserver verifier (live S3)");
  const storage = await import("../src/lib/storage");
  const { verifyLogoUpload } = await import("../src/lib/branding-verify");
  if (!storage.isStorageConfigured()) { console.log("  (skipped: S3 not configured)"); }
  else {
    const made: string[] = [];
    async function put(name: string, bytes: Buffer, type = "image/png") {
      const key = `site/TEST-brand-${Date.now()}-${name}`;
      const url = await storage.presignUpload(key, type, 120);
      const r = await fetch(url, { method: "PUT", headers: { "Content-Type": type }, body: new Uint8Array(bytes) });
      if (!r.ok) throw new Error(`PUT failed ${r.status}`);
      made.push(key);
      return key;
    }
    try {
      const good = await put("fav.png", makePng(512, 512));
      const v1 = await verifyLogoUpload("favicon", good);
      assert("a real 512×512 PNG passes for the favicon", v1.ok && v1.asset.width === 512 && v1.asset.height === 512, JSON.stringify(v1));
      assert("the stored size comes from the file", v1.ok && v1.asset.key === good);

      const notSquare = await put("wide.png", makePng(600, 300));
      const v2 = await verifyLogoUpload("favicon", notSquare);
      assert("a non-square PNG is refused for the favicon", !v2.ok, JSON.stringify(v2));
      assert("a refused upload is deleted from the bucket", (await storage.headObject(notSquare)) === null);

      const fake = await put("fake.png", Buffer.from("this is not an image, just text pretending to be a PNG file".repeat(5)));
      const v3 = await verifyLogoUpload("horizontal", fake);
      assert("a text file renamed .png is refused", !v3.ok, JSON.stringify(v3));
      assert("…and deleted", (await storage.headObject(fake)) === null);

      const svg = await put("x.png", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="140"><script>alert(1)</script></svg>'));
      assert("an SVG with a script, renamed .png, is refused", !(await verifyLogoUpload("horizontal", svg)).ok);

      const missing = await verifyLogoUpload("icon", "site/TEST-brand-does-not-exist.png");
      assert("a key that was never uploaded is refused", !missing.ok);
      assert("a key outside site/ is refused", !(await verifyLogoUpload("icon", "customer/someone/else.png")).ok);

      const wrongType = await put("apple.png", makePng(180, 180));
      assert("a PNG is accepted for the apple icon", (await verifyLogoUpload("appleIcon", wrongType)).ok);
    } finally {
      for (const k of made) await storage.deleteObject(k).catch(() => undefined);
    }
  }

  console.log(failures ? `\n${failures} FAILED` : "\nAll branding tests passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
