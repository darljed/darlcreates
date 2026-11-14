/**
 * POC (not part of the app): does an AI redraw make clicker pictures trace better?
 *
 *   npx tsx scripts/poc-ai-vectorize.ts [modelId ...]      (inputs in /tmp/ai-poc/in, results in /tmp/ai-poc/out)
 *
 * For every input picture and model: ask OpenRouter to redraw it as flat-colour art, then trace the result with the
 * app's own tracer (4 colours from the default palette) and make one contact sheet per picture to look at:
 *   original | traced original | (model output | traced model output) ...
 */
import { config } from "dotenv";
config({ path: ".env.local" });
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import sharp from "sharp";
import { analyzeImage, defaultTrace, traceAnalysis } from "../src/lib/clicker/trace";
import { DEFAULT_PALETTE } from "../src/lib/clicker/spec";

const IN = "/tmp/ai-poc/in", OUT = "/tmp/ai-poc/out";
const MODELS = process.argv.slice(2).length ? process.argv.slice(2) : [
  "google/gemini-3.1-flash-image",
  "google/gemini-3.1-flash-lite-image",
  "black-forest-labs/flux-3-image-klein",
  "qwen/qwen-image-3",
  "recraft/recraft-v4-styles-vector",
];
const BASE_PROMPT =
  "Redraw this picture as a flat-colour vector illustration. Use at most 4 solid colours. " +
  "No gradients, no shading, no textures, no tiny details, no thin lines. Bold simple shapes with clear edges; keep the subject " +
  "recognisable and make it fill the frame. No border, outline or shadow around the subject. Plain pure white background. Return the image only.";
// PALETTE=1: tell the model which filament colours the shop offers, so its colours land on printable ones
const STRICT_PROMPT =
  "Convert this photo into a flat poster-style vector illustration, like a screen print or a paper cut-out. STRICT RULE: the subject uses at most 4 flat solid colours in total, " +
  "and every area of it is filled with exactly one of those colours. The background is pure white. Absolutely no gradients, no soft shading, no blending between colours, no highlights, " +
  "no texture, no fur or hair strands, no thin lines. Large bold shapes with clean hard edges. The subject is centred and fills the frame, with no border, outline or shadow around it.";
// MODE=flat: simple flat art in colours the shop has in stock (small palette); MODE=stencil: black and white only, thresholded in code
const MODE = process.env.MODE;
const STOCK = ["#f8fafc", "#111827", "#ef4444", "#facc15", "#22c55e", "#2563eb"];
const FLAT_PROMPT =
  "Redraw this picture as a simple flat-colour illustration, like a sticker or paper cut-out. Use at most 3 flat solid colours, chosen ONLY from this list (exact codes): " + STOCK.join(", ") + ". " +
  "Pick the ones that suit the subject best. Every area is filled with exactly one colour. No gradients, no shading, no blending, no highlights, no texture, no thin lines. " +
  "Large bold shapes with clean hard edges. The subject is centred and fills the frame, with no border, outline or shadow around it. " +
  "The background is one flat pure magenta (#ff00ff); magenta is NOT one of the subject's colours and must not appear on the subject.";
const STENCIL_PROMPT =
  "Redraw this picture as a high-contrast two-tone graphic, like a stencil or a linocut print. Use ONLY pure black and pure white. No grey, no shading, no gradients, no halftone dots, no hatching, " +
  "no thin lines. Large bold black shapes with clean hard edges, keeping the face or subject clearly recognisable through the shapes of its shadows and features. " +
  "The subject is centred and fills the frame. White background, no border.";
const PROMPT = MODE === "flat" ? FLAT_PROMPT : MODE === "stencil" ? STENCIL_PROMPT : process.env.STRICT ? STRICT_PROMPT : process.env.PALETTE ? BASE_PROMPT + " Use ONLY colours from this list, at most 4 of them, exactly as written: " + DEFAULT_PALETTE.join(", ") + "." : BASE_PROMPT;
const KEY = process.env.OPENROUTER_API_KEY;
if (!KEY) throw new Error("OPENROUTER_API_KEY is not set in .env.local");

const SIZE = 512;

async function pixelsOf(png: Buffer) {
  const { data, info } = await sharp(png).resize(256, 256, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { width: info.width, height: info.height, data };
}

/** Trace with the app's tracer and draw the result (4 colours, nearest default-palette filament) to a PNG. */
async function traceToPng(png: Buffer) {
  let pixels;
  if (MODE === "stencil") {
    // only two tones can survive: threshold to pure black / white before tracing
    const bw = await sharp(png).greyscale().threshold(128).toBuffer();
    pixels = await pixelsOf(bw);
  } else pixels = await pixelsOf(png);
  if (MODE === "flat") {
    // the magenta backdrop is cut out (so white or cream parts of the subject stay), including its blended edge pixels
    const d = pixels.data as Buffer;
    for (let i = 0; i < d.length; i += 4) if (d[i] > 150 && d[i + 2] > 150 && d[i + 1] < 110) d[i + 3] = 0;
  }
  const a = analyzeImage(pixels, MODE === "stencil" ? 2 : MODE === "flat" ? 3 : 4);
  const opts =
    MODE === "stencil"
      ? { keep: a.palette.map(() => true), target: a.palette.map((p) => (p.rgb[0] + p.rgb[1] + p.rgb[2] < 384 ? "#111827" : "#f8fafc")) }
      : defaultTrace(a, MODE === "flat" ? STOCK : DEFAULT_PALETTE);
  const t = traceAnalysis(a, { ...opts, smoothing: 1, detail: 0.6 });
  const S = SIZE;
  const path = (r: { outer: number[][]; holes: number[][][] }) =>
    [r.outer, ...r.holes].map((ring) => "M" + ring.map(([x, y]) => `${(x * S + S / 2).toFixed(1)} ${(S / 2 - y * S).toFixed(1)}`).join("L") + "Z").join("");
  const body = t.groups.map((g) => `<path fill="${g.color}" fill-rule="evenodd" d="${g.shapes.map(path).join("")}"/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}"><rect width="${S}" height="${S}" fill="#d9dde3"/>${body}</svg>`;
  return { png: await sharp(Buffer.from(svg)).png().toBuffer(), colours: t.groups.length, points: t.points };
}

async function redraw(model: string, input: Buffer): Promise<{ png: Buffer; costUsd: number | null; ms: number; svg?: string }> {
  const started = Date.now();
  const dataUrl = "data:image/png;base64," + input.toString("base64");
  // Gemini answers on the chat endpoint; every other image model uses the dedicated Image API
  const chat = model.startsWith("google/");
  const res = await fetch(chat ? "https://openrouter.ai/api/v1/chat/completions" : "https://openrouter.ai/api/v1/images", {
    method: "POST",
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      chat
        ? { model, modalities: ["image", "text"], messages: [{ role: "user", content: [{ type: "text", text: PROMPT }, { type: "image_url", image_url: { url: dataUrl } }] }] }
        : { model, prompt: PROMPT, n: 1, aspect_ratio: "1:1", ...(model.includes("vector") ? { output_format: "svg" } : {}), input_references: [{ type: "image_url", image_url: { url: dataUrl } }] },
    ),
    signal: AbortSignal.timeout(180_000),
  });
  const json = (await res.json()) as {
    error?: { message?: string };
    usage?: { cost?: number };
    choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
    data?: { b64_json?: string; url?: string; media_type?: string }[];
  };
  if (!res.ok || json.error) throw new Error(`${res.status} ${json.error?.message ?? "request failed"}`);
  let bytes: Buffer;
  if (chat) {
    const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
    if (!url) throw new Error("no image in the answer: " + JSON.stringify(json).slice(0, 300));
    const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(url);
    bytes = m ? (m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]))) : Buffer.from(await (await fetch(url)).arrayBuffer());
  } else {
    const d = json.data?.[0];
    if (!d) throw new Error("no image in the answer: " + JSON.stringify(json).slice(0, 300));
    bytes = d.b64_json ? Buffer.from(d.b64_json, "base64") : Buffer.from(await (await fetch(d.url!)).arrayBuffer());
  }
  const isSvg = bytes.subarray(0, 400).toString("utf8").includes("<svg");
  return {
    png: await sharp(bytes, isSvg ? { density: 150 } : {}).resize(768, 768, { fit: "inside" }).flatten({ background: "#fff" }).png().toBuffer(),
    costUsd: json.usage?.cost ?? null,
    ms: Date.now() - started,
    svg: isSvg ? bytes.toString("utf8") : undefined,
  };
}

async function label(text: string) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="28"><rect width="100%" height="100%" fill="#111"/><text x="8" y="19" font-size="14" font-family="Helvetica, Arial" fill="#fff">${esc}</text></svg>`)).png().toBuffer();
}
const fit = (b: Buffer) => sharp(b).resize(SIZE, SIZE, { fit: "contain", background: "#fff" }).png().toBuffer();

(async () => {
  mkdirSync(OUT, { recursive: true });
  const files = readdirSync(IN).filter((f) => /\.(jpe?g|png|svg|webp)$/i.test(f) && (!process.env.ONLY || process.env.ONLY.split(",").some((o) => f.startsWith(o))));
  const summary: string[] = [];
  let total = 0;
  for (const f of files) {
    const name = f.replace(/\.[^.]+$/, "");
    const input = await sharp(`${IN}/${f}`).resize(768, 768, { fit: "inside" }).flatten({ background: "#fff" }).png().toBuffer();
    const cells: { title: string; img: Buffer }[] = [{ title: "original", img: await fit(input) }];
    const base = await traceToPng(input);
    cells.push({ title: `trace of original (${base.points} pts)`, img: base.png });
    for (const model of MODELS) {
      const short = model.split("/")[1];
      try {
        const r = await redraw(model, input);
        total += r.costUsd ?? 0;
        writeFileSync(`${OUT}/${name}-${short}.png`, r.png);
        if (r.svg) writeFileSync(`${OUT}/${name}-${short}.svg`, r.svg);
        const t = await traceToPng(r.png);
        cells.push({ title: `${short} ${(r.ms / 1000).toFixed(0)}s ${r.costUsd != null ? "$" + r.costUsd.toFixed(3) : ""}`, img: await fit(r.png) });
        cells.push({ title: `trace (${t.colours} col, ${t.points} pts)`, img: t.png });
        summary.push(`${name}\t${short}\tok\t${(r.ms / 1000).toFixed(0)}s\t${r.costUsd ?? "?"}\t${t.points} pts`);
      } catch (e) {
        summary.push(`${name}\t${short}\tFAILED\t${(e as Error).message.slice(0, 160)}`);
      }
    }
    const cols = 4, rows = Math.ceil(cells.length / cols);
    const sheet = sharp({ create: { width: cols * SIZE, height: rows * (SIZE + 28), channels: 3, background: "#222" } });
    const comps = [];
    for (let i = 0; i < cells.length; i++) {
      const x = (i % cols) * SIZE, y = Math.floor(i / cols) * (SIZE + 28);
      comps.push({ input: await label(cells[i].title), left: x, top: y }, { input: cells[i].img, left: x, top: y + 28 });
    }
    await sheet.composite(comps).jpeg({ quality: 82 }).toFile(`${OUT}/sheet-${name}${process.env.TAG ?? ""}.jpg`);
    console.log("sheet", name);
  }
  console.log(summary.join("\n"));
  console.log(`Total cost reported: $${total.toFixed(3)}`);
})().catch((e) => { console.error(e); process.exit(1); });
