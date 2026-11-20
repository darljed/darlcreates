/**
 * Talking to the AI providers. SERVER ONLY. OpenRouter and Ollama Cloud both answer the OpenAI chat format, so one
 * `chat` function serves both; they differ in the base URL, the key and how models are listed. Images come from
 * OpenRouter only (Ollama Cloud has no image models we can rely on). Errors come back as plain sentences for the admin,
 * never with the key.
 */
import type { Provider } from "./settings";

const BASE: Record<Provider, string> = { openrouter: "https://openrouter.ai/api/v1", ollama: "https://ollama.com" };
const CHAT_URL: Record<Provider, string> = { openrouter: `${BASE.openrouter}/chat/completions`, ollama: `${BASE.ollama}/v1/chat/completions` };

export type ModelInfo = { id: string; name: string; vision: boolean; tools: boolean; note: string };

// ---- model lists --------------------------------------------------------------------------------------------------

type OrModel = { id: string; name?: string; architecture?: { input_modalities?: string[]; output_modalities?: string[] }; supported_parameters?: string[]; pricing?: { prompt?: string; completion?: string } };
/** OpenRouter models that answer in text only (image-making models are left out: they are not for writing). Prices are per million tokens, as a short note. */
export function parseOpenRouterModels(json: unknown): ModelInfo[] {
  const data = (json as { data?: OrModel[] } | null)?.data;
  if (!Array.isArray(data)) return [];
  return data
    .filter((m) => typeof m.id === "string" && m.architecture?.output_modalities?.includes("text") && !m.architecture.output_modalities.includes("image") && !m.id.startsWith("openrouter/"))
    .map((m) => {
      const inP = Number(m.pricing?.prompt), outP = Number(m.pricing?.completion);
      const note = Number.isFinite(inP) && Number.isFinite(outP) && inP >= 0 ? (inP === 0 && outP === 0 ? "free" : `$${(inP * 1e6).toFixed(2)} in / $${(outP * 1e6).toFixed(2)} out per M`) : "";
      return { id: m.id, name: m.name ?? m.id, vision: Boolean(m.architecture?.input_modalities?.includes("image")), tools: Boolean(m.supported_parameters?.includes("tools")), note };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

type OlModel = { name?: string; model?: string; capabilities?: string[] };
/** Ollama models that can chat (some listed ones only embed). */
export function parseOllamaModels(json: unknown): ModelInfo[] {
  const data = (json as { models?: OlModel[] } | null)?.models;
  if (!Array.isArray(data)) return [];
  return data
    .filter((m) => typeof (m.model ?? m.name) === "string" && (!m.capabilities || m.capabilities.includes("completion")))
    .map((m) => ({ id: (m.model ?? m.name) as string, name: (m.name ?? m.model) as string, vision: Boolean(m.capabilities?.includes("vision")), tools: Boolean(m.capabilities?.includes("tools")), note: "" }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const listCache = new Map<Provider, { at: number; models: ModelInfo[] }>();
const listFailed = new Map<Provider, { at: number; error: string }>();
/** The provider's models (public lists; cached 10 minutes). */
export async function listModels(p: Provider): Promise<{ ok: true; models: ModelInfo[] } | { ok: false; error: string }> {
  const hit = listCache.get(p);
  if (hit && Date.now() - hit.at < 10 * 60_000) return { ok: true, models: hit.models };
  const bad = listFailed.get(p); // a failure is remembered for 30 s, so an outage is not hammered
  if (bad && Date.now() - bad.at < 30_000) return { ok: false, error: bad.error };
  const fail = (error: string): { ok: false; error: string } => { listFailed.set(p, { at: Date.now(), error }); return { ok: false, error }; };
  try {
    const res = await fetch(p === "openrouter" ? `${BASE.openrouter}/models` : `${BASE.ollama}/api/tags`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return fail(`${p} answered ${res.status} when listing models.`);
    const models = (p === "openrouter" ? parseOpenRouterModels : parseOllamaModels)(await res.json());
    if (!models.length) return fail("The provider returned no models.");
    listCache.set(p, { at: Date.now(), models });
    listFailed.delete(p);
    return { ok: true, models };
  } catch {
    return fail("Could not reach the provider to list models.");
  }
}

// ---- chat ---------------------------------------------------------------------------------------------------------

export type ChatPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
export type ChatMessage = { role: "system" | "user" | "assistant"; content: string | ChatPart[] };
export type AiResult<T> = ({ ok: true } & T) | { ok: false; error: string };

type Raw = { error?: { message?: string }; usage?: { cost?: number }; choices?: { message?: { content?: string | null; images?: { image_url?: { url?: string } }[] } }[] };

function failure(status: number, json: Raw, what: string, apiKey: string): { ok: false; error: string } {
  // the provider's wording is shown to the admin, with the key (and anything shaped like one) taken out
  const msg = json.error?.message?.replaceAll(apiKey, "[key]").replace(/\b(sk|or|key)[-_][A-Za-z0-9_-]{8,}/g, "[key]").slice(0, 200);
  if (status === 401 || status === 403) return { ok: false, error: `The provider rejected the API key (${status}). Check it in AI settings.` };
  if (status === 402) return { ok: false, error: "The provider says the account is out of credit." };
  if (status === 429) return { ok: false, error: "The provider is rate limiting. Try again in a minute." };
  return { ok: false, error: `${what} failed (${status})${msg ? `: ${msg}` : ""}` };
}

/** One chat call. `json` asks for a JSON object back. */
export async function chat(o: { provider: Provider; apiKey: string; model: string; messages: ChatMessage[]; json?: boolean; maxTokens?: number; timeoutMs?: number }): Promise<AiResult<{ text: string; costUsd: number | null }>> {
  let res: Response;
  try {
    res = await fetch(CHAT_URL[o.provider], {
      method: "POST",
      headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: o.model, messages: o.messages, max_tokens: o.maxTokens ?? 2000, ...(o.json ? { response_format: { type: "json_object" } } : {}) }),
      signal: AbortSignal.timeout(o.timeoutMs ?? 90_000),
    });
  } catch {
    return { ok: false, error: "Could not reach the provider (network or timeout)." };
  }
  const json = (await res.json().catch(() => ({}))) as Raw;
  if (!res.ok || json.error) return failure(res.status, json, "The model call", o.apiKey);
  const text = json.choices?.[0]?.message?.content;
  if (!text) return { ok: false, error: "The model returned an empty answer." };
  return { ok: true, text, costUsd: json.usage?.cost ?? null };
}

/** An image from OpenRouter (chat endpoint with image output). `refs` are data: URLs of reference pictures. */
export async function generateImage(o: { apiKey: string; model: string; prompt: string; refs: string[]; aspect?: string }): Promise<AiResult<{ bytes: Uint8Array; mime: "image/png" | "image/jpeg" | "image/webp"; costUsd: number | null }>> {
  let res: Response;
  try {
    res = await fetch(CHAT_URL.openrouter, {
      method: "POST",
      headers: { Authorization: `Bearer ${o.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: o.model,
        modalities: ["image", "text"],
        image_config: { aspect_ratio: o.aspect ?? "1:1" },
        messages: [{ role: "user", content: [{ type: "text", text: o.prompt }, ...o.refs.map((url) => ({ type: "image_url", image_url: { url } }))] }],
      }),
      signal: AbortSignal.timeout(120_000),
    });
  } catch {
    return { ok: false, error: "Could not reach OpenRouter (network or timeout)." };
  }
  const json = (await res.json().catch(() => ({}))) as Raw;
  if (!res.ok || json.error) return failure(res.status, json, "Image generation", o.apiKey);
  const url = json.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  const m = url ? /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(url) : null;
  if (!m) return { ok: false, error: "The model did not return an image (it may have refused the request). Try again or change the instruction." };
  const bytes = Uint8Array.from(Buffer.from(m[2], "base64"));
  if (bytes.length < 1000 || bytes.length > 12_000_000) return { ok: false, error: "The model returned an unusable image. Try again." };
  return { ok: true, bytes, mime: `image/${m[1]}` as "image/png", costUsd: json.usage?.cost ?? null };
}
