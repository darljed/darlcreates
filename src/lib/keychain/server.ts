/**
 * Server side of the name keychain: checking a design before it is ordered, the print file, and a small picture of the
 * design for the cart and order pages. The design is plain data from the browser; everything made from it is made here.
 */
import { createHash } from "node:crypto";
import { isWatertight, meshBounds } from "../name-mesh";
import { BudgetCache } from "../clicker/budget-cache";
import { clickerTo3mf, moveMesh, type PrintObject } from "../clicker/export-3mf";
import { extrudeParts, meshOfPart } from "../clicker/extrude";
import { FIT } from "../clicker/fit";
import { loadAllFonts } from "../clicker/server";
import { buildKeychainLayout, keychainToSvg, layoutProblem } from "./layout";
import { checkKeychainAgainstConfig, keychainSpecSchema, MAX_KEYCHAIN_JSON, type KeychainConfig, type KeychainSpec } from "./spec";

/** Why a design cannot be ordered, or the design as the server understood it. */
export async function checkKeychain(input: unknown, cfg: KeychainConfig): Promise<{ ok: true; spec: KeychainSpec } | { ok: false; error: string }> {
  const parsed = keychainSpecSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "The design is not valid." };
  if (JSON.stringify(parsed.data).length > MAX_KEYCHAIN_JSON) return { ok: false, error: "The design is not valid." };
  const problem = checkKeychainAgainstConfig(parsed.data, cfg);
  if (problem) return { ok: false, error: problem };
  const fonts = await loadAllFonts();
  const layout = buildKeychainLayout(parsed.data, (id) => fonts.get(id));
  const bad = layoutProblem(layout, cfg);
  if (bad) return { ok: false, error: bad };
  if (layout.parts.length === 0) return { ok: false, error: "There is nothing to print. Check the name." };
  // the price follows the length on the design: it may not be smaller than the real one (a long name must not be priced as a short one)
  if (layout.lengthMm > parsed.data.lengthMm + 0.6) return { ok: false, error: "The size of this keychain does not match its design. Open the designer and try again." };
  return { ok: true, spec: parsed.data };
}

export type KeychainPrint =
  | { ok: false; error: string }
  | { ok: true; file: Uint8Array; objects: PrintObject[]; report: { pieces: { name: string; color: string; watertight: boolean; bounds: number[] }[]; warnings: string[]; lengthMm: number; heightMm: number; filaments: string[] } };

/** The 3MF for a design: one object lying flat on the plate (plate, name, icon, frame), one part per colour piece. */
export async function buildKeychainPrint(spec: KeychainSpec, title = "Name keychain"): Promise<KeychainPrint> {
  const fonts = await loadAllFonts();
  const layout = buildKeychainLayout(spec, (id) => fonts.get(id));
  if (layout.errors.length) return { ok: false, error: layout.errors[0] };
  const solids = extrudeParts(layout.parts);
  if (solids.length === 0) return { ok: false, error: "There is nothing to print." };
  if (layout.widthMm + 2 * FIT.plateMarginMm > FIT.plateMm || layout.lengthMm + 2 * FIT.plateMarginMm > FIT.plateMm) return { ok: false, error: "This is too big to print on one plate." };
  const dx = FIT.plateMarginMm - layout.bounds.minX, dy = FIT.plateMarginMm - layout.bounds.minY;
  const pieces = solids.map((p) => ({ name: p.name, color: p.color, mesh: moveMesh(meshOfPart(p), dx, dy, 0) }));
  const objects: PrintObject[] = [{ name: title, wallLoops: 2, pieces }];
  return {
    ok: true,
    file: clickerTo3mf(objects, title),
    objects,
    report: {
      pieces: pieces.map((p) => ({ name: p.name, color: p.color, watertight: isWatertight(p.mesh), bounds: meshBounds(p.mesh) })),
      warnings: layout.warnings,
      lengthMm: layout.lengthMm,
      heightMm: layout.totalHeight,
      filaments: [...new Set(pieces.map((p) => p.color))],
    },
  };
}

const svgCache = new BudgetCache(8_000_000, 200_000);
/** A picture of the design as a data: URL for an <img> (an image cannot run scripts), cached by the design's content. */
export async function keychainSvgDataUri(spec: KeychainSpec): Promise<string> {
  const key = createHash("sha256").update(JSON.stringify(spec)).digest("hex");
  const hit = svgCache.get(key);
  if (hit) return hit;
  const fonts = await loadAllFonts();
  const uri = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(keychainToSvg(buildKeychainLayout(spec, (id) => fonts.get(id)), { margin: 1.5 }));
  svgCache.set(key, uri);
  return uri;
}
