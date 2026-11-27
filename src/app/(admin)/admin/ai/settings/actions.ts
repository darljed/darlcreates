"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { adminAudit } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { chat, listImageModels, listModels, type ModelInfo } from "@/lib/ai/providers";
import { getAiKey, getAiPrefs, PROVIDERS, prefsSchema, saveAiKey, saveAiPrefs } from "@/lib/ai/settings";

type Result = { ok: true; message?: string } | { ok: false; error: string };
const provider = z.enum(PROVIDERS);

async function audit(actorId: string, action: string, detail: Record<string, unknown>) {
  await db.insert(adminAudit).values({ id: randomUUID(), actorId, targetUserId: actorId, action, detail });
}

/** Save (or replace) a provider's API key. It is encrypted before it is stored and never sent back to the browser. */
export async function saveKeyAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = z.object({ provider, key: z.string().trim().min(8).max(300).regex(/^\S+$/, "no spaces") }).safeParse(input);
  if (!p.success) return { ok: false, error: "That does not look like an API key." };
  try {
    await saveAiKey(p.data.provider, p.data.key, admin.id);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the key." };
  }
  await audit(admin.id, "ai.key.save", { provider: p.data.provider });
  revalidatePath("/admin/ai/settings");
  return { ok: true, message: "Key saved (encrypted)." };
}

export async function removeKeyAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = z.object({ provider }).safeParse(input);
  if (!p.success) return { ok: false, error: "Unknown provider." };
  await saveAiKey(p.data.provider, null, admin.id);
  await audit(admin.id, "ai.key.remove", { provider: p.data.provider });
  revalidatePath("/admin/ai/settings");
  return { ok: true, message: "Saved key removed." };
}

export async function listModelsAction(input: unknown): Promise<{ ok: true; models: ModelInfo[] } | { ok: false; error: string }> {
  await requireAdmin();
  const p = z.object({ provider }).safeParse(input);
  if (!p.success) return { ok: false, error: "Unknown provider." };
  return listModels(p.data.provider);
}

/** OpenRouter's image-making models, for the image model pickers. */
export async function listImageModelsAction(): Promise<{ ok: true; models: ModelInfo[] } | { ok: false; error: string }> {
  await requireAdmin();
  return listImageModels();
}

export async function savePrefsAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const p = prefsSchema.safeParse(input);
  if (!p.success || !p.data.copyModel) return { ok: false, error: "Pick a model first." };
  await saveAiPrefs(p.data, admin.id);
  await audit(admin.id, "ai.prefs.save", { ...p.data });
  revalidatePath("/admin/ai/settings");
  return { ok: true, message: "Model saved." };
}

/** One tiny call to confirm the key works with the chosen model. */
export async function testConnectionAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const p = z.object({ provider, model: z.string().trim().min(1).max(120).optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Unknown provider." };
  const key = await getAiKey(p.data.provider);
  if (!key) return { ok: false, error: "No API key for this provider yet." };
  const model = p.data.model || (await getAiPrefs()).copyModel;
  if (!model) return { ok: false, error: "Pick a model first." };
  const r = await chat({ provider: p.data.provider, apiKey: key, model, messages: [{ role: "user", content: "Reply with the single word: ok" }], maxTokens: 300, timeoutMs: 45_000 });
  return r.ok ? { ok: true, message: `Works. The model answered: ${r.text.trim().slice(0, 40)}` } : { ok: false, error: r.error };
}
