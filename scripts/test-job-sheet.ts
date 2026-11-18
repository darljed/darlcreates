/**
 * Print job sheet (pure): part colours with filament numbers, the "set by hand" warning for a colour outside the 3MF's
 * filaments, the name, the clicker design, and the plain-text copy. Run: npx tsx scripts/test-job-sheet.ts
 */
import { buildJobSheet, sheetText } from "../src/lib/job-sheet";
import { defaultSpec, DEFAULT_CLICKER_CONFIG } from "../src/lib/clicker/spec";
import type { ConfigSelection, ProductOptionInput } from "../src/lib/pricing";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

const val = (id: string, label: string, value: string) => ({ id, label, value, priceDeltaCents: 0 });
const ball: ProductOptionInput = {
  id: "o1", type: "color", label: "Ball colour", required: true, priceDeltaCents: 0,
  constraints: { partName: "dc-slot-0", parts: [{ objectId: "3", partId: "1" }], filaments: { "#F95D73": 1, "#00FF00": 2 }, defaultHex: "#F95D73" },
  values: [val("v1", "Pink", "#f95d73"), val("v2", "Sky blue", "#0ea5e9")],
};
const name: ProductOptionInput = {
  id: "o2", type: "text", label: "Name", required: false, priceDeltaCents: 0,
  constraints: { maxLen: 10, slot: { position: [0, 0, 0], normal: [0, 0, 1], up: [0, 1, 0], maxWidth: 40, height: 6, maxHeight: 9, depth: 1.2, sink: 0.4, font: "bold", nameColor: { hex: "#00FF00", filament: 2 } } },
  values: [],
};

console.log("\nmulti-colour part + name");
const cfg: ConfigSelection = { o1: { valueId: "v1" }, o2: { text: "Ana" } };
const s = buildJobSheet({ options: [ball, name], config: cfg, modelKey: "models/abc/model-ready.3mf" });
assert("model file name kept", s.model === "model-ready.3mf");
assert("part row: Ball, Pink, filament 1, designer colour", s.parts.length === 1 && s.parts[0].part === "Ball" && s.parts[0].colour === "Pink" && s.parts[0].filament === 1 && s.parts[0].designerHex === "#f95d73", JSON.stringify(s.parts));
assert("no warning when the colour is a project filament", !s.warnings.some((w) => w.includes("Ball")));
assert("name text, area and colour with filament", s.name?.text === "Ana" && s.name.areaMm.includes("40") && s.name.filament === 2 && s.name.colour?.hex === "#00ff00", JSON.stringify(s.name));
assert("filaments to load list both, sorted by number", s.filaments.map((f) => f.filament).join() === "1,2");

console.log("\na colour outside the project's filaments");
const s2 = buildJobSheet({ options: [ball], config: { o1: { valueId: "v2" } }, modelKey: null });
assert("filament is null and a hand-set warning names the part and colour", s2.parts[0].filament === null && s2.warnings.some((w) => w.includes("Sky blue") && w.includes("by hand")), JSON.stringify(s2.warnings));

console.log("\nclicker design");
const clicker: ProductOptionInput = { id: "o3", type: "text", label: "Your clicker", required: true, priceDeltaCents: 0, constraints: { maxLen: 20, clicker: DEFAULT_CLICKER_CONFIG }, values: [] };
const spec = defaultSpec(DEFAULT_CLICKER_CONFIG);
const s3 = buildJobSheet({ options: [clicker], config: { o3: { design: spec } }, modelKey: null });
assert("size, base and cap colours, layers and colours to load", !!s3.clicker && s3.clicker.sizeMm.includes("mm") && !!s3.clicker.cap && s3.clicker.colours.length >= 2 && s3.filaments.length >= 2 && s3.clicker.layers.length >= 1, JSON.stringify(s3.clicker));

console.log("\nplain text");
const t = sheetText("Paddle", 2, s);
assert("text has quantity, part colour with hex and filament, name and load list", t.startsWith("2× Paddle") && t.includes("Ball: Pink #f95d73 → filament 1") && t.includes("Name: “Ana”") && t.includes("Load:"), t);

if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
console.log("\nAll job sheet checks passed.");
