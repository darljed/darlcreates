import { buildLayout } from "../src/lib/clicker/layout";
import { extrudeLayout, meshOfPart } from "../src/lib/clicker/extrude";
import { defaultSpec, clickerSpecSchema } from "../src/lib/clicker/spec";
import { SHAPE_IDS } from "../src/lib/clicker/shapes";
import { isWatertight, meshBounds, NAME_FONT_IDS } from "../src/lib/name-mesh";
import { loadFont } from "../src/lib/name-3mf";
(async () => {
  const fonts = new Map<string, any>();
  for (const id of NAME_FONT_IDS) fonts.set(id, await loadFont(id));
  const look = (id: any) => fonts.get(id);
  for (const shape of SHAPE_IDS) {
    const spec = { ...defaultSpec(), shape };
    const ok = clickerSpecSchema.safeParse(spec);
    if (!ok.success) { console.log(shape, "SPEC FAIL", ok.error.issues[0]); continue; }
    const t = performance.now();
    const layout = buildLayout(ok.data, look);
    const solids = extrudeLayout(layout);
    const rows = solids.map((p) => { const m = meshOfPart(p); const b = meshBounds(m); return `${p.id}:${isWatertight(m) ? "ok" : "OPEN"}:z${b[2].toFixed(1)}-${b[5].toFixed(1)}`; });
    console.log(shape.padEnd(9), Math.round(performance.now() - t) + "ms", layout.errors.join("|"), layout.warnings.join("|"), rows.join(" "));
  }
  process.exit(0);
})();
