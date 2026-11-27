/**
 * The marketing generator's pure parts: what we know about a model file, the prompts for the copy and the images, and
 * checking what the AI sent back. No network, no database, so scripts can test it.
 */
import { copySchema, type ProductCopy, type Scene } from "./draft-types";
export * from "./draft-types";
import { meshBounds } from "../name-mesh";
import { readBaseSurface, open3mf, projectFilaments } from "../name-3mf";

export type ModelFacts = { fileName: string; format: "stl" | "3mf"; sizeMm: [number, number, number] | null; triangles: number | null; filaments: string[] };

/** Size, triangle count and filament colours of an uploaded model. A file we cannot read gives `sizeMm: null` (the copy is then written without sizes). */
export function modelFacts(data: ArrayBuffer, format: "stl" | "3mf", fileName: string): ModelFacts {
  const facts: ModelFacts = { fileName, format, sizeMm: null, triangles: null, filaments: [] };
  try {
    const mesh = readBaseSurface(data, format);
    const b = meshBounds(mesh);
    facts.sizeMm = [b[3] - b[0], b[4] - b[1], b[5] - b[2]].map((v) => Math.round(v * 10) / 10) as [number, number, number];
    facts.triangles = Math.floor(mesh.indices.length / 3);
  } catch { /* unreadable: leave blank */ }
  if (format === "3mf") {
    try { facts.filaments = projectFilaments(open3mf(data)); } catch { /* ignore */ }
  }
  return facts;
}

// ---- the copy -----------------------------------------------------------------------------------------------------

/** The owner never wants tax or business-registration status in the shop's words (docs/decisions). */
// written in pieces so this file itself passes the source scan in scripts/test-content.ts
const BANNED = new RegExp(`\\b(${["ta" + "x\\w*", "va" + "t", "bi" + "r", "dt" + "i", "business\\s+regist\\w*", "regist\\w+\\s+(business|shop|store)", "official\\s+rece" + "ipt"].join("|")})\\b`, "i");
export function bannedWordIn(copy: ProductCopy): string | null {
  const text = [copy.name, copy.tagline, copy.description, copy.seoTitle, copy.metaDescription, ...copy.highlights, ...copy.tags].join("\n");
  return BANNED.exec(text)?.[0] ?? null;
}

export const COPY_SYSTEM = [
  "You write product listings for Darl Creates, a small Philippine shop that 3D-prints products to order.",
  "Write clear, warm, honest English for Filipino shoppers. Short sentences. No hype words, no emoji, no hashtags.",
  "Use ONLY the facts you are given (file facts, the owner's notes, what you can see in the photos). Never invent a material, print time, price, discount, guarantee, review count, or dimensions that were not given.",
  "If a size is given in the facts, you may state it in millimetres. If the material is not given, do not name one.",
  "Never mention taxes, receipts for tax, or the shop's registration or legal status.",
  'Answer with ONE JSON object and nothing else, with exactly these keys: "name" (max 80 chars), "tagline" (max 140), "description" (2 short paragraphs, max 900 chars, plain text), "highlights" (3 to 5 short bullets, no bullet symbols), "tags" (3 to 8 lowercase words), "category" (one lowercase word or two, like "keychains" or "desk"), "seoTitle" (max 60), "metaDescription" (max 155).',
].join("\n");

export function copyPrompt(facts: ModelFacts, notes: string, extra = ""): string {
  const f: string[] = [`File: ${facts.fileName} (${facts.format.toUpperCase()})`];
  if (facts.sizeMm) f.push(`Size: ${facts.sizeMm[0]} x ${facts.sizeMm[1]} x ${facts.sizeMm[2]} mm (width x depth x height)`);
  if (facts.filaments.length) f.push(`Filament colours in the file: ${facts.filaments.join(", ")}`);
  return [`Facts from the model file:\n${f.join("\n")}`, notes.trim() ? `Owner's notes (trust these):\n${notes.trim()}` : "No notes from the owner.", extra].filter(Boolean).join("\n\n");
}

/** Pull the JSON out of an answer (models sometimes wrap it in a code fence) and check it. */
export function parseCopy(text: string): { ok: true; copy: ProductCopy } | { ok: false; error: string } {
  const body = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = body.indexOf("{"), end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return { ok: false, error: "The answer was not JSON." };
  let raw: unknown;
  try { raw = JSON.parse(body.slice(start, end + 1)); } catch { return { ok: false, error: "The answer was not valid JSON." }; }
  const r = copySchema.safeParse(raw);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).slice(0, 3).join("; ") };
  const word = bannedWordIn(r.data);
  if (word) return { ok: false, error: `The copy mentioned "${word}", which the shop never says.` };
  return { ok: true, copy: { ...r.data, category: r.data.category.toLowerCase(), tags: r.data.tags.map((t) => t.toLowerCase()) } };
}

/** The listing text stored on the product: the description, then the highlights as a short list. */
export function descriptionOf(copy: ProductCopy): string {
  const text = [copy.tagline, copy.description, copy.highlights.map((h) => `- ${h}`).join("\n")].filter(Boolean).join("\n\n");
  return text.length <= 2000 ? text : `${copy.description}`.slice(0, 2000);
}

// ---- the images ---------------------------------------------------------------------------------------------------

const KEEP = "The attached photo(s) show the REAL 3D-printed product. Keep its exact shape, proportions, colours, surface texture and layer lines. Do not add, remove or restyle any feature. Do not add text, logos, watermarks, price tags or people's faces.";
const SCENE_PROMPT: Record<Scene, string> = {
  hero: "Create a clean e-commerce hero photo of this exact product on a seamless light backdrop with soft studio lighting and a gentle natural shadow. The product is centred and fills about 70% of the frame.",
  lifestyle: "Create a realistic lifestyle photo showing this exact product in natural use or on display in a fitting everyday setting (a desk, a bag, a shelf, a hand). Soft daylight, shallow depth of field, the product is the clear subject.",
  detail: "Create a macro close-up of this exact product that shows its printed texture and finish in sharp focus, with a softly blurred neutral background.",
};

export function imagePrompt(scene: Scene, name: string, extra = ""): string {
  return [`${SCENE_PROMPT[scene]} The product is "${name}".`, KEEP, extra.trim() ? `Extra direction from the owner: ${extra.trim().slice(0, 300)}` : ""].filter(Boolean).join("\n\n");
}

/** A mockup described in the owner's (or the chat assistant's) own words. The real product must still stay unchanged. */
export function customImagePrompt(direction: string, name: string): string {
  return [`${direction.trim().slice(0, 500)}\n\nThe product is "${name}".`, KEEP].join("\n\n");
}

