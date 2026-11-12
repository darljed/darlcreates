/**
 * Server side of the clicker designer: checking a design before it is ordered, the print file, and a small picture of the
 * design for the cart and order pages. The design is plain data from the browser; everything made from it is made here.
 */
import { createHash } from "node:crypto";
import { isWatertight, meshBounds, NAME_FONT_IDS, type Font, type NameFontId } from "../name-mesh";
import { loadFont } from "../name-3mf";
import { clickerTo3mf, moveMesh, type PrintObject } from "./export-3mf";
import { DEFAULT_TUNE, FIT, type Tune } from "./fit";
import { extrudeLayout, meshOfPart } from "./extrude";
import { buildLayout, plateLayout } from "./layout";
import { designToSvg } from "./svg";
import { checkAgainstConfig, clickerSpecSchema, MAX_SPEC_JSON, type ClickerConfig, type ClickerSpec } from "./spec";

/** All six fonts, parsed once per server process. */
let fontsReady: Promise<Map<NameFontId, Font>> | null = null;
export function loadAllFonts(): Promise<Map<NameFontId, Font>> {
  fontsReady ??= Promise.all(NAME_FONT_IDS.map(async (id) => [id, await loadFont(id)] as const)).then((e) => new Map(e));
  return fontsReady;
}

/** Why a design cannot be ordered, or the design as the server understood it. */
export async function checkDesign(input: unknown, cfg: ClickerConfig): Promise<{ ok: true; spec: ClickerSpec } | { ok: false; error: string }> {
  const parsed = clickerSpecSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "The design is not valid." };
  if (JSON.stringify(parsed.data).length > MAX_SPEC_JSON) return { ok: false, error: "The design is too detailed. Use fewer colours or less detail in the pictures." };
  const problem = checkAgainstConfig(parsed.data, cfg);
  if (problem) return { ok: false, error: problem };
  const fonts = await loadAllFonts();
  const layout = buildLayout(parsed.data, (id) => fonts.get(id), cfg.tune);
  if (layout.errors.length) return { ok: false, error: layout.errors[0] };
  if (layout.parts.length === 0) return { ok: false, error: "There is nothing to print. Check the sizes." };
  return { ok: true, spec: parsed.data };
}

export type ClickerPrint =
  | { ok: false; error: string }
  | {
      ok: true;
      file: Uint8Array;
      report: {
        pieces: { name: string; object: string; color: string; watertight: boolean; bounds: number[] }[];
        warnings: string[];
        capSize: [number, number];
        baseSize: [number, number];
        totalHeightMm: number;
        filaments: string[];
        switches: number;
        switchType: string;
      };
    };

/** The 3MF for a design (base and cap(s) laid out on the plate), with a check that every piece is a closed solid. */
export async function buildClickerPrint(spec: ClickerSpec, title = "Custom clicker", tune: Tune = DEFAULT_TUNE): Promise<ClickerPrint> {
  const fonts = await loadAllFonts();
  const layout = buildLayout(spec, (id) => fonts.get(id), tune);
  if (layout.errors.length) return { ok: false, error: layout.errors[0] };
  const plate = plateLayout(layout);
  if (!plate) return { ok: false, error: "This is too big to print on one plate." };
  const solids = extrudeLayout(layout);
  if (solids.length === 0) return { ok: false, error: "There is nothing to print." };

  const made = solids.map((p) => {
    const [dx, dy] = p.object === "housing" ? plate.housing : plate.cap;
    // the cap prints where it was drawn, at the bed: bring it down from its raised, assembled height
    const mesh = moveMesh(meshOfPart(p), dx, dy, p.object === "cap" ? -FIT.capRestZ : 0);
    return { part: p, piece: { name: p.name, color: p.color, mesh } };
  });
  const objectOf = (which: "housing" | "cap"): PrintObject => ({
    name: `${title} - ${which === "housing" ? "BASE" : "TOP"}`,
    wallLoops: which === "housing" ? FIT.wallLoopsBase : FIT.wallLoopsCap,
    pieces: made.filter((m) => m.part.object === which).map((m) => m.piece),
  });
  const objects = [objectOf("housing"), objectOf("cap")].filter((o) => o.pieces.length);
  const colours = [...new Set(made.map((m) => m.piece.color))];
  return {
    ok: true,
    file: clickerTo3mf(objects, title),
    report: {
      pieces: made.map((m) => ({ name: m.piece.name, object: m.part.object, color: m.piece.color, watertight: isWatertight(m.piece.mesh), bounds: meshBounds(m.piece.mesh) })),
      warnings: layout.warnings,
      capSize: layout.capSize,
      baseSize: layout.baseSize,
      totalHeightMm: layout.totalHeight,
      filaments: colours,
      switches: layout.keys.length,
      switchType: spec.switchType,
    },
  };
}

const svgCache = new Map<string, string>();
/** A picture of the design as a data: URL for an <img> (an image cannot run scripts), cached by the design's content. */
export async function designSvgDataUri(spec: ClickerSpec): Promise<string> {
  const key = createHash("sha1").update(JSON.stringify(spec)).digest("hex");
  const hit = svgCache.get(key);
  if (hit) return hit;
  const fonts = await loadAllFonts();
  const uri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(designToSvg(spec, (id) => fonts.get(id), { margin: 1.5 }));
  if (svgCache.size >= 200) svgCache.delete(svgCache.keys().next().value as string);
  svgCache.set(key, uri);
  return uri;
}
