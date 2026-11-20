/**
 * Admin design studio: the STL zip (one valid binary STL per colour piece) built from a keychain and a clicker design.
 * The route itself is admin-gated and checked in the browser. No database. Run: npx tsx scripts/test-studio.ts
 */
import { unzipSync, strFromU8 } from "fflate";
import { DEFAULT_KEYCHAIN_CONFIG, defaultKeychain } from "../src/lib/keychain/spec";
import { buildKeychainPrint } from "../src/lib/keychain/server";
import { DEFAULT_CLICKER_CONFIG, defaultSpec } from "../src/lib/clicker/spec";
import { buildClickerPrint } from "../src/lib/clicker/server";
import { objectsToStlZip } from "../src/lib/stl-export";

let failures = 0;
const assert = (n: string, c: boolean) => { if (!c) { failures++; console.error(`  ✗ ${n}`); } else console.log(`  ✓ ${n}`); };

function checkZip(label: string, zip: Uint8Array, minFiles: number) {
  const files = unzipSync(zip);
  const stls = Object.entries(files).filter(([n]) => n.endsWith(".stl"));
  assert(`${label}: ${stls.length} STL files (>= ${minFiles}, <= 8)`, stls.length >= minFiles && stls.length <= 8);
  for (const [n, b] of stls) {
    const tris = new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(80, true);
    assert(`${label}: ${n} size matches its triangle count (${tris})`, tris > 0 && b.length === 84 + tris * 50);
  }
  assert(`${label}: README lists colours`, strFromU8(files["README.txt"]).includes("colour #"));
}

(async () => {
  const k = await buildKeychainPrint({ ...defaultKeychain(DEFAULT_KEYCHAIN_CONFIG), text: "Ana" }, "kc");
  assert("keychain builds", k.ok);
  if (k.ok) checkZip("keychain", objectsToStlZip(k.objects), 2);
  const c = await buildClickerPrint(defaultSpec(DEFAULT_CLICKER_CONFIG), "ck");
  assert("clicker builds", c.ok);
  if (c.ok) checkZip("clicker", objectsToStlZip(c.objects), 2);
  if (failures) { console.error(`${failures} failed`); process.exit(1); }
  console.log("all passed");
})();
