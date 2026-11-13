/**
 * Redrawing a customer's picture as simple art with an AI image model (OpenRouter), so it traces into clean colour
 * areas. SERVER ONLY (it holds the API key). Two modes:
 *   flat     a few flat colours, chosen from the shop's colour inventory, on a solid "key" backdrop that the browser
 *            cuts out (so white or cream parts of the subject are kept);
 *   stencil  pure black and white; the browser thresholds the answer so exactly two tones remain.
 * The cheap model is tried first where it is good enough (stencil: Flux Klein); the other model is the fallback.
 * No `next/*` imports, so scripts can use it. Errors are returned as plain sentences for the customer, never the
 * provider's message.
 */

export type RedrawMode = "flat" | "stencil";
export const REDRAW_MODES: readonly RedrawMode[] = ["flat", "stencil"];

/** Models (OpenRouter slugs). Gemini answers on the chat endpoint, the others on the Image API. */
export const REDRAW_MODELS = {
  flat: "google/gemini-3.1-flash-lite-image",
  stencil: "black-forest-labs/flux-3-image-klein",
  fallback: "google/gemini-3.1-flash-lite-image",
} as const;

/** Pictures one customer may redraw in a day (per server instance; see roadmap G-105). */
export const REDRAW_DAILY_LIMIT = 12;

export const aiConfigured = () => Boolean(process.env.OPENROUTER_API_KEY);

// ---- the backdrop colour ------------------------------------------------------------------------------------------

const KEYS: { hex: string; name: string }[] = [
  { hex: "#ff00ff", name: "pure magenta" },
  { hex: "#00ffff", name: "pure cyan" },
  { hex: "#00ff00", name: "pure bright green" },
  { hex: "#ffff00", name: "pure bright yellow" },
];
const rgb = (hex: string): [number, number, number] => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
const dist = (a: string, b: string) => Math.hypot(...rgb(a).map((v, i) => v - rgb(b)[i]));

/** The backdrop colour furthest from every colour in stock, so cutting it out never takes part of the subject. */
export function keyColourFor(palette: string[]): { hex: string; name: string } {
  let best = KEYS[0], bestGap = -1;
  for (const k of KEYS) {
    const gap = palette.length ? Math.min(...palette.map((p) => dist(k.hex, p))) : 999;
    if (gap > bestGap) { best = k; bestGap = gap; }
  }
  return best;
}

// ---- prompts ------------------------------------------------------------------------------------------------------

export function redrawPrompt(mode: RedrawMode, o: { palette: string[]; colours: number; key: { hex: string; name: string } }): string {
  if (mode === "stencil") {
    return (
      "Redraw this picture as a high-contrast two-tone graphic, like a stencil or a linocut print. Use ONLY pure black and pure white. No grey, no shading, no gradients, no halftone dots, no hatching, " +
      "no thin lines. Large bold black shapes with clean hard edges, keeping the face or subject clearly recognisable through the shapes of its shadows and features. " +
      "The subject is centred and fills the frame. White background, no border."
    );
  }
  return (
    `Redraw this picture as a simple flat-colour illustration, like a sticker or paper cut-out. Use at most ${o.colours} flat solid colours, chosen ONLY from this list (exact codes): ${o.palette.join(", ")}. ` +
    "Stay faithful to the picture: keep its layout, shapes and any lettering exactly, and give each original colour the nearest colour from the list. Every area is filled with exactly one colour. No gradients, no shading, no blending, no highlights, no texture, no thin lines. " +
    "Large bold shapes with clean hard edges. The subject is centred and fills the frame, with no border, outline or shadow around it. " +
    `The background is one flat ${o.key.name} (${o.key.hex}); that colour is NOT one of the subject's colours and must not appear on the subject.`
  );
}

// ---- the call -----------------------------------------------------------------------------------------------------

export type RedrawResult =
  | { ok: true; image: string; model: string; costUsd: number | null }
  | { ok: false; error: string; retryable: boolean };

const GENERIC = "We couldn't redraw that picture right now. Try again in a moment, or use your picture as it is.";
const REFUSED = "The AI service wouldn't redraw that picture. Try a different one, or use your picture as it is.";

type Raw = {
  error?: { message?: string };
  usage?: { cost?: number };
  choices?: { message?: { images?: { image_url?: { url?: string } }[] } }[];
  data?: { b64_json?: string; url?: string }[];
};

async function callModel(model: string, prompt: string, imageDataUrl: string): Promise<RedrawResult> {
  const chat = model.startsWith("google/");
  let res: Response;
  try {
    res = await fetch(chat ? "https://openrouter.ai/api/v1/chat/completions" : "https://openrouter.ai/api/v1/images", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(
        chat
          ? { model, modalities: ["image", "text"], messages: [{ role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageDataUrl } }] }] }
          : { model, prompt, n: 1, aspect_ratio: "1:1", input_references: [{ type: "image_url", image_url: { url: imageDataUrl } }] },
      ),
      signal: AbortSignal.timeout(90_000),
    });
  } catch {
    return { ok: false, error: GENERIC, retryable: true }; // timeout or network
  }
  const json = (await res.json().catch(() => ({}))) as Raw;
  if (!res.ok || json.error) {
    // 400 from the image providers = content moderation or a bad request; 402/429/5xx = capacity, money or an outage
    console.error("AI redraw failed:", model, res.status, json.error?.message?.slice(0, 200));
    return { ok: false, error: res.status === 400 ? REFUSED : GENERIC, retryable: res.status !== 401 && res.status !== 402 };
  }
  let image: string | undefined;
  if (chat) image = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  else if (json.data?.[0]?.b64_json) image = `data:image/png;base64,${json.data[0].b64_json}`;
  if (!image || !/^data:image\/(png|jpeg|webp);base64,/.test(image)) return { ok: false, error: GENERIC, retryable: true };
  if (image.length > 6_000_000) return { ok: false, error: GENERIC, retryable: true };
  return { ok: true, image, model, costUsd: json.usage?.cost ?? null };
}

/**
 * Redraw a picture. `retry` skips the first-choice model (used when the first answer traced into too much detail).
 * If the first-choice model fails, the fallback is tried once.
 */
export async function redrawPicture(o: { mode: RedrawMode; imageDataUrl: string; palette: string[]; colours: number; retry?: boolean }): Promise<RedrawResult & { key?: string }> {
  if (!aiConfigured()) return { ok: false, error: "AI redraw isn't switched on for this shop.", retryable: false };
  const key = keyColourFor(o.palette);
  const prompt = redrawPrompt(o.mode, { palette: o.palette, colours: o.colours, key });
  const first = o.retry ? REDRAW_MODELS.fallback : REDRAW_MODELS[o.mode];
  let r = await callModel(first, prompt, o.imageDataUrl);
  if (!r.ok && r.retryable && first !== REDRAW_MODELS.fallback) r = await callModel(REDRAW_MODELS.fallback, prompt, o.imageDataUrl);
  return r.ok && o.mode === "flat" ? { ...r, key: key.hex } : r;
}

const MAX_IMAGE_BYTES = 1_100_000;

/** True when the data URL really holds a PNG, JPEG or WebP (checked by its first bytes, not by what it claims). */
export function looksLikeImageDataUrl(dataUrl: string): boolean {
  const m = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) return false;
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length < 16 || bytes.length > MAX_IMAGE_BYTES) return false;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const webp = bytes.subarray(0, 4).toString("latin1") === "RIFF" && bytes.subarray(8, 12).toString("latin1") === "WEBP";
  return png || jpeg || webp;
}

// ---- the daily limit ----------------------------------------------------------------------------------------------

const used = new Map<string, number[]>();
/**
 * Count one redraw for this customer; false when they are over the day's limit. ponytail: in memory, per server
 * instance, so the real ceiling is limit x instances and it resets on restart. Upgrade: a counter in the database.
 */
export function takeRedrawSlot(userId: string, now = Date.now()): boolean {
  const day = 24 * 60 * 60 * 1000;
  const recent = (used.get(userId) ?? []).filter((t) => now - t < day);
  if (recent.length >= REDRAW_DAILY_LIMIT) {
    used.set(userId, recent);
    return false;
  }
  recent.push(now);
  used.set(userId, recent);
  if (used.size > 5000) for (const [k, v] of used) if (v.every((t) => now - t >= day)) used.delete(k); // keep the map small
  return true;
}
