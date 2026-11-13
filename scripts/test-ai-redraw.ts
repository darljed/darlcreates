/**
 * AI picture redraw, everything that does not call the AI (so it costs nothing): the browser's post-processing
 * (threshold, key-out), the backdrop colour choice, the prompts, the image check, the daily limit, the owner switch.
 * The real AI call is covered by scripts/make-redraw-examples.ts and the browser run.
 * Run: npx tsx scripts/test-ai-redraw.ts
 */
import { flatColourCount, keyOutPixels, thresholdPixels } from "../src/lib/clicker/redraw-post";
import { keyColourFor, looksLikeImageDataUrl, redrawPicture, redrawPrompt, REDRAW_DAILY_LIMIT, REDRAW_MODELS, takeRedrawSlot } from "../src/lib/clicker/redraw";
import { clickerConfigOf, DEFAULT_CLICKER_CONFIG, DEFAULT_PALETTE } from "../src/lib/clicker/spec";
import { analyzeImage, looksLikeGraphic } from "../src/lib/clicker/trace";
import sharp from "sharp";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}
const px = (w: number, h: number, f: (x: number, y: number) => [number, number, number, number]) => {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(f(x, y), (y * w + x) * 4);
  return { width: w, height: h, data };
};

async function main() {
  console.log("\nstencil: exactly two tones");
  const greys = px(8, 8, (x, y) => { const v = (x * 32 + y * 3) % 256; return [v, v, v, 255]; });
  const t = thresholdPixels(greys);
  const tones = new Set<number>();
  let grey = true;
  for (let i = 0; i < 64; i++) { tones.add(t.data[i * 4]); grey &&= t.data[i * 4] === t.data[i * 4 + 1] && t.data[i * 4 + 1] === t.data[i * 4 + 2] && t.data[i * 4 + 3] === 255; }
  assert("only pure black and pure white are left", grey && [...tones].every((v) => v === 0 || v === 255) && tones.size === 2);
  const coloured = thresholdPixels(px(2, 1, () => [200, 40, 40, 255]));
  assert("a colour becomes black or white by brightness", coloured.data[0] === 0);
  assert("transparent stays transparent", thresholdPixels(px(1, 1, () => [255, 255, 255, 0])).data[3] === 0);
  const traced = analyzeImage(thresholdPixels(greys), 2);
  assert("the tracer then finds exactly two colours", traced.palette.length === 2);

  console.log("\nlogo or photo?");
  // the example pictures: the left half of each is the "before" (a drawn logo, an AI-made cat photo, an AI-made portrait)
  const left = async (name: string): Promise<{ width: number; height: number; data: Uint8ClampedArray }> => {
    const { data, info } = await sharp(`public/clicker-examples/${name}.jpg`).extract({ left: 0, top: 0, width: 300, height: 300 }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  };
  assert("a logo is a graphic", looksLikeGraphic(await left("trace")));
  assert("a photo of a cat is not", !looksLikeGraphic(await left("flat")));
  assert("a portrait photo is not", !looksLikeGraphic(await left("stencil")));
  assert("a fully transparent picture is not (nothing to judge)", !looksLikeGraphic(px(4, 4, () => [0, 0, 0, 0])));

  console.log("\nflat: the backdrop is cut out");
  // a yellow square on magenta, with a blended pink rim between them
  const sheet = px(20, 20, (x, y) => {
    if (x >= 6 && x < 14 && y >= 6 && y < 14) return [250, 204, 21, 255];
    if (x >= 5 && x < 15 && y >= 5 && y < 15) return [250, 100, 140, 255]; // blended edge
    return [255, 0, 255, 255];
  });
  const k = keyOutPixels(sheet, "#ff00ff");
  const alpha = (x: number, y: number) => k.data[(y * 20 + x) * 4 + 3];
  assert("the backdrop is transparent", alpha(0, 0) === 0 && alpha(19, 19) === 0);
  assert("the blended rim is gone", alpha(5, 10) === 0 && alpha(10, 5) === 0);
  assert("the middle of the subject is kept", alpha(10, 10) === 255);
  assert("a white part of the subject is kept (white is not the key)", keyOutPixels(px(3, 3, (x) => (x === 1 ? [248, 250, 252, 255] : [255, 0, 255, 255])), "#ff00ff", 120, 0).data[(1 * 3 + 1) * 4 + 3] === 255);
  assert("the input is not changed", sheet.data[3] === 255 && sheet.data[(10 * 20 + 10) * 4 + 3] === 255);
  const found = analyzeImage(k, 3);
  assert("the tracer sees one colour (the yellow), no pink fringe", found.palette.filter((p) => !p.background).length === 1, JSON.stringify(found.palette.map((p) => p.hex)));

  assert("flat colours: what the printer has left after the base and the key (2 to 3)", flatColourCount(4) === 2 && flatColourCount(5) === 3 && flatColourCount(8) === 3 && flatColourCount(2) === 2);

  console.log("\nthe backdrop colour");
  assert("the usual stock gets one of the backdrop colours, far from every colour in it", ["#ff00ff", "#00ffff", "#00ff00", "#ffff00"].includes(keyColourFor(DEFAULT_PALETTE).hex));
  assert("magenta in stock: a different backdrop is chosen", keyColourFor(["#ff00ff", "#111111"]).hex !== "#ff00ff");
  assert("pink-ish stock (#ec4899) still avoids a near match", keyColourFor(["#ec4899", "#ff00ee"]).hex !== "#ff00ff");
  assert("an empty stock still gives a backdrop", keyColourFor([]).hex === "#ff00ff");

  console.log("\nthe prompts");
  const key = keyColourFor(["#111111", "#facc15", "#22c55e"]);
  const flat = redrawPrompt("flat", { palette: ["#111111", "#facc15", "#22c55e"], colours: 3, key });
  assert("flat names every colour in stock, the count and the backdrop", flat.includes("#111111") && flat.includes("#facc15") && flat.includes("#22c55e") && flat.includes("at most 3") && flat.includes(key.hex));
  const sten = redrawPrompt("stencil", { palette: [], colours: 2, key });
  assert("stencil asks for pure black and white only", /pure black and pure white/.test(sten) && !sten.includes("#"));

  console.log("\nthe image check");
  const png = "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]).toString("base64");
  const jpg = "data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).toString("base64");
  assert("a PNG and a JPEG are accepted", looksLikeImageDataUrl(png) && looksLikeImageDataUrl(jpg));
  assert("text pretending to be an image is refused", !looksLikeImageDataUrl("data:image/png;base64," + Buffer.from("this is not an image at all").toString("base64")));
  assert("an SVG, a URL and other types are refused", !looksLikeImageDataUrl("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=") && !looksLikeImageDataUrl("https://example.com/a.png") && !looksLikeImageDataUrl("data:text/html;base64,PGI+"));
  assert("an image over the size cap is refused", !looksLikeImageDataUrl("data:image/png;base64," + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(1_200_000)]).toString("base64")));

  console.log("\nthe daily limit");
  const t0 = 1_000_000_000_000;
  let allowed = 0;
  for (let i = 0; i < REDRAW_DAILY_LIMIT + 5; i++) if (takeRedrawSlot("TEST-AI-user", t0 + i)) allowed++;
  assert(`only ${REDRAW_DAILY_LIMIT} redraws a day`, allowed === REDRAW_DAILY_LIMIT);
  assert("another customer is not affected", takeRedrawSlot("TEST-AI-other", t0));
  assert("the next day the same customer can redraw again", takeRedrawSlot("TEST-AI-user", t0 + 25 * 60 * 60 * 1000));

  console.log("\nthe owner's switch and the key");
  assert("AI redraw is OFF unless the owner switches it on", DEFAULT_CLICKER_CONFIG.allowAi === false);
  assert("settings saved before this feature existed read as off", clickerConfigOf({ clicker: { maxColours: 4 } })?.allowAi === false);
  assert("and a saved 'on' is kept", clickerConfigOf({ clicker: { allowAi: true } })?.allowAi === true);
  const saved = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  const r = await redrawPicture({ mode: "flat", imageDataUrl: png, palette: DEFAULT_PALETTE, colours: 3 });
  assert("without an API key nothing is sent and the customer is told", !r.ok && /isn't switched on/.test(r.error));
  if (saved) process.env.OPENROUTER_API_KEY = saved;
  assert("stencil uses the cheap model first, flat the other; the fallback is the other one", REDRAW_MODELS.stencil.startsWith("black-forest-labs/") && REDRAW_MODELS.flat === REDRAW_MODELS.fallback);

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll AI redraw checks passed.");
  process.exit(0);
}
main().catch((e) => { console.error(e); process.exit(1); });
