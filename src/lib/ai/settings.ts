/**
 * AI provider keys and model choices. SERVER ONLY. A key is never sent to the browser: the admin screen only gets
 * whether one is set, where it comes from and its last 4 characters. A key saved here wins over the env var.
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiSettings } from "@/db/schema";
import { decryptSecret, encryptSecret } from "./crypto";
import { MODEL_ID } from "./draft-types";

export const PROVIDERS = ["openrouter", "ollama"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const PROVIDER_LABEL: Record<Provider, string> = { openrouter: "OpenRouter", ollama: "Ollama Cloud" };
const ENV_KEY: Record<Provider, string> = { openrouter: "OPENROUTER_API_KEY", ollama: "OLLAMA_API_KEY" };

/** The image model used until the owner picks another (OpenRouter), see docs/ai-studio.md. */
export const IMAGE_MODEL = "google/gemini-3.1-flash-image";

export const prefsSchema = z.object({
  copyProvider: z.enum(PROVIDERS).default("openrouter"),
  copyModel: z.string().trim().max(120).default(""),
  /** The agent needs a model that can call tools. Empty = use the copy model. */
  agentProvider: z.enum(PROVIDERS).default("openrouter"),
  agentModel: z.string().trim().max(120).default(""),
  /** The default image model for mockups in the Product studio (OpenRouter only). */
  imageModel: z.string().trim().max(120).regex(MODEL_ID).default(IMAGE_MODEL),
});
export type AiPrefs = z.infer<typeof prefsSchema>;

async function read(key: string): Promise<{ data: unknown } | null> {
  const [row] = await db.select({ data: aiSettings.data }).from(aiSettings).where(eq(aiSettings.key, key)).limit(1);
  return row ?? null;
}

/** The API key to use for a provider: the saved one, else the env var, else null. */
export async function getAiKey(p: Provider): Promise<string | null> {
  const row = await read(`key:${p}`);
  const enc = (row?.data as { enc?: string } | undefined)?.enc;
  const saved = enc ? decryptSecret(enc) : null;
  return saved || process.env[ENV_KEY[p]] || null;
}

export type KeyStatus = { configured: boolean; source: "saved" | "env" | null; last4: string | null; unreadable: boolean };

export async function getKeyStatus(p: Provider): Promise<KeyStatus> {
  const row = await read(`key:${p}`);
  const enc = (row?.data as { enc?: string } | undefined)?.enc;
  const saved = enc ? decryptSecret(enc) : null;
  if (saved) return { configured: true, source: "saved", last4: saved.slice(-4), unreadable: false };
  const env = process.env[ENV_KEY[p]];
  if (env) return { configured: true, source: "env", last4: env.slice(-4), unreadable: Boolean(enc) };
  return { configured: false, source: null, last4: null, unreadable: Boolean(enc) };
}

export async function saveAiKey(p: Provider, key: string | null, actorId: string): Promise<void> {
  if (key === null) {
    await db.delete(aiSettings).where(eq(aiSettings.key, `key:${p}`));
    return;
  }
  const data = { enc: encryptSecret(key) };
  await db.insert(aiSettings).values({ key: `key:${p}`, data, updatedBy: actorId }).onConflictDoUpdate({ target: aiSettings.key, set: { data, updatedAt: new Date(), updatedBy: actorId } });
}

export async function getAiPrefs(): Promise<AiPrefs> {
  const parsed = prefsSchema.safeParse((await read("prefs"))?.data ?? {});
  return parsed.success ? parsed.data : prefsSchema.parse({});
}

export async function saveAiPrefs(prefs: AiPrefs, actorId: string): Promise<void> {
  await db.insert(aiSettings).values({ key: "prefs", data: prefs, updatedBy: actorId }).onConflictDoUpdate({ target: aiSettings.key, set: { data: prefs, updatedAt: new Date(), updatedBy: actorId } });
}
