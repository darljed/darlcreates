/**
 * Makes the three before / after example pictures shown in the clicker designer's "How should we use your picture?"
 * chooser (public/clicker-examples/{trace,flat,stencil}.jpg). The sources are made here (a drawn logo and two AI-made
 * pictures), so no one's photo is used. The "after" halves go through the app's real pipeline (the AI redraw, the browser's
 * post-processing and the tracer), so the examples show what customers really get. Costs a few cents.
 * Run: npx tsx scripts/make-redraw-examples.ts
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync } from "node:fs";
import sharp from "sharp";
import { analyzeImage, defaultTrace, traceAnalysis, type Pixels } from "../src/lib/clicker/trace";
import { DEFAULT_PALETTE } from "../src/lib/clicker/spec";
import { keyOutPixels, thresholdPixels } from "../src/lib/clicker/redraw-post";
import { redrawPicture } from "../src/lib/clicker/redraw";

const OUT = "public/clicker-examples";
const S = 300; // each half is S x S; the file is 2S x S

const LOGO = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="#fff"/>
<circle cx="256" cy="256" r="220" fill="#2563eb"/><circle cx="256" cy="256" r="170" fill="#f8fafc"/>
<path d="M256 140 L290 225 L380 232 L312 290 L334 378 L256 330 L178 378 L200 290 L132 232 L222 225 Z" fill="#ef4444"/></svg>`;

async function pixelsOf(png: Buffer): Promise<Pixels> {
  const { data, info } = await sharp(png).resize(360, 360, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

/** Trace and draw the result the way the designer shows it: shapes in the nearest stock colour on a grey cap. */
async function drawTrace(px: Pixels, colours: number): Promise<Buffer> {
  const a = analyzeImage(px, colours);
  const t = traceAnalysis(a, { ...defaultTrace(a, DEFAULT_PALETTE), smoothing: 1, detail: 0.6 });
  const path = (r: { outer: number[][]; holes: number[][][] }) =>
    [r.outer, ...r.holes].map((ring) => "M" + ring.map(([x, y]) => `${(x * S + S / 2).toFixed(1)} ${(S / 2 - y * S).toFixed(1)}`).join("L") + "Z").join("");
  const body = t.groups.map((g) => `<path fill="${g.color}" fill-rule="evenodd" d="${g.shapes.map(path).join("")}"/>`).join("");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="#e5e7eb"/>${body}</svg>`)).png().toBuffer();
}

async function textToImage(prompt: string): Promise<Buffer> {
  const res = await fetch("https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: "black-forest-labs/flux-3-image-klein", prompt, n: 1, aspect_ratio: "1:1" }),
    signal: AbortSignal.timeout(120_000),
  });
  const json = (await res.json()) as { data?: { b64_json?: string }[]; error?: { message?: string } };
  if (!json.data?.[0]?.b64_json) throw new Error(json.error?.message ?? "no image");
  return Buffer.from(json.data[0].b64_json, "base64");
}

const half = (b: Buffer) => sharp(b).resize(S, S, { fit: "contain", background: "#ffffff" }).flatten({ background: "#ffffff" }).png().toBuffer();
async function save(name: string, before: Buffer, after: Buffer) {
  await sharp({ create: { width: S * 2, height: S, channels: 3, background: "#fff" } })
    .composite([{ input: await half(before), left: 0, top: 0 }, { input: after, left: S, top: 0 }])
    .jpeg({ quality: 82 })
    .toFile(`${OUT}/${name}.jpg`);
  console.log("wrote", `${OUT}/${name}.jpg`);
}

async function viaAi(mode: "flat" | "stencil", source: Buffer): Promise<Buffer> {
  const small = await sharp(source).resize(768, 768, { fit: "inside" }).flatten({ background: "#fff" }).jpeg({ quality: 85 }).toBuffer();
  const r = await redrawPicture({ mode, imageDataUrl: "data:image/jpeg;base64," + small.toString("base64"), palette: DEFAULT_PALETTE, colours: 3 });
  if (!r.ok) throw new Error(r.error);
  const png = Buffer.from(r.image.split(",")[1], "base64");
  const px = await pixelsOf(png);
  const key = "key" in r && r.key ? r.key : "#ff00ff";
  return drawTrace(mode === "stencil" ? thresholdPixels(px) : keyOutPixels(px, key), mode === "stencil" ? 2 : 3);
}

(async () => {
  mkdirSync(OUT, { recursive: true });
  const logo = await sharp(Buffer.from(LOGO)).png().toBuffer();
  await save("trace", logo, await drawTrace(await pixelsOf(logo), 3));

  const cat = await textToImage("A photo of a ginger tabby cat sitting and looking at the camera, soft natural light, plain blurred background");
  await save("flat", cat, await viaAi("flat", cat));

  const person = await textToImage("A studio portrait photo of a smiling young woman with short dark hair, head and shoulders, plain light background");
  await save("stencil", person, await viaAi("stencil", person));
})().catch((e) => { console.error(e); process.exit(1); });
