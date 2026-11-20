"use server";

import { nanoid } from "nanoid";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiDrafts } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { deleteObject, getObject, headObject, peekBytes, putObject } from "@/lib/storage";
import { KEY_PATTERNS, UPLOAD_RULES, looksLikeZip, modelFormatOf, sniffImageType } from "@/lib/uploads";
import { chat, generateImage, listModels, type ChatMessage } from "@/lib/ai/providers";
import { getAiKey, getAiPrefs, IMAGE_MODEL } from "@/lib/ai/settings";
import { COPY_SYSTEM, MAX_IMAGES_PER_DRAFT, SCENES, copyPrompt, copySchema, descriptionOf, draftSchema, imagePrompt, modelFacts, parseCopy, type DraftPayload } from "@/lib/ai/product-copy";
import { addPhotoAction, attachModelAction, createProductAction } from "../products/actions";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function bytesOf(key: string): Promise<Uint8Array | null> {
  const o = await getObject(key);
  return o ? new Uint8Array(await new Response(o.stream).arrayBuffer()) : null;
}

async function loadDraft(id: string): Promise<{ id: string; status: string; payload: DraftPayload } | null> {
  const [row] = await db.select().from(aiDrafts).where(eq(aiDrafts.id, id)).limit(1);
  if (!row || row.kind !== "product") return null;
  const p = draftSchema.safeParse(row.payload);
  return p.success ? { id: row.id, status: row.status, payload: p.data } : null;
}

async function saveDraft(id: string, payload: DraftPayload, title?: string) {
  await db.update(aiDrafts).set({ payload, updatedAt: new Date(), ...(title !== undefined ? { title } : {}) }).where(eq(aiDrafts.id, id));
  revalidatePath("/admin/ai");
}

const uuid = z.string().uuid();

/** Step 1: the model and the real-print photos are already in storage; read the model's facts and open a draft. */
export async function startDraftAction(input: unknown): Promise<Result<{ id: string }>> {
  const admin = await requireAdmin();
  const p = z.object({ modelKey: z.string().regex(KEY_PATTERNS.model), photoKeys: z.array(z.string().regex(KEY_PATTERNS.photo)).max(6), notes: z.string().max(1500).default("") }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid upload." };
  const { modelKey, photoKeys, notes } = p.data;

  const size = await headObject(modelKey);
  if (size === null) return { ok: false, error: "The model upload was not found in storage." };
  if (size > UPLOAD_RULES.model.maxBytes) return { ok: false, error: "Model file too large." };
  const format = modelFormatOf(modelKey);
  if (format === "3mf" && !looksLikeZip(await peekBytes(modelKey, 4))) return { ok: false, error: "That does not look like a valid 3MF file." };
  for (const k of photoKeys) {
    if ((await headObject(k)) === null) return { ok: false, error: "A photo upload was not found in storage." };
    if (!sniffImageType(await peekBytes(k, 12))) return { ok: false, error: "A photo is not a JPEG, PNG or WebP picture." };
  }

  const bytes = await bytesOf(modelKey);
  if (!bytes) return { ok: false, error: "Could not read the model." };
  const fileName = modelKey.split("/").pop()?.replace(/^[A-Za-z0-9_-]{12}-/, "") ?? modelKey;
  const facts = modelFacts(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer, format, fileName);
  const payload: DraftPayload = { modelKey, photoKeys, notes, facts, copy: null, price: "", images: [], costUsd: 0, productId: null };
  const [row] = await db.insert(aiDrafts).values({ kind: "product", title: fileName, payload, createdBy: admin.id }).returning({ id: aiDrafts.id });
  revalidatePath("/admin/ai");
  return { ok: true, id: row.id };
}

/** Step 2: the copy. Retries once when the answer is not usable JSON or says something the shop never says. */
export async function generateCopyAction(input: unknown): Promise<Result<{ copy: DraftPayload["copy"] }>> {
  await requireAdmin();
  const p = z.object({ draftId: uuid, notes: z.string().max(1500).optional(), direction: z.string().max(400).optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const d = await loadDraft(p.data.draftId);
  if (!d || d.status !== "draft") return { ok: false, error: "Draft not found." };
  const prefs = await getAiPrefs();
  if (!prefs.copyModel) return { ok: false, error: "Choose a model for the copy in AI settings first." };
  const key = await getAiKey(prefs.copyProvider);
  if (!key) return { ok: false, error: "Add the API key for the chosen provider in AI settings first." };

  const notes = p.data.notes ?? d.payload.notes;
  const models = await listModels(prefs.copyProvider);
  const vision = models.ok && models.models.some((m) => m.id === prefs.copyModel && m.vision);
  const refs: string[] = [];
  if (vision) for (const k of d.payload.photoKeys.slice(0, 2)) {
    const b = await bytesOf(k);
    const t = b && sniffImageType(b);
    if (b && t) refs.push(`data:image/${t};base64,${Buffer.from(b).toString("base64")}`);
  }
  const prompt = copyPrompt(d.payload.facts, notes, p.data.direction ? `Owner's direction for this rewrite: ${p.data.direction}` : "");
  const messages: ChatMessage[] = [{ role: "system", content: COPY_SYSTEM }, { role: "user", content: refs.length ? [{ type: "text", text: prompt + "\n\nThe attached photos show the real product." }, ...refs.map((url) => ({ type: "image_url" as const, image_url: { url } }))] : prompt }];

  let cost = 0, last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await chat({ provider: prefs.copyProvider, apiKey: key, model: prefs.copyModel, messages, json: true, maxTokens: 4000 });
    if (!r.ok) return { ok: false, error: r.error };
    cost += r.costUsd ?? 0;
    const parsed = parseCopy(r.text);
    if (parsed.ok) {
      await saveDraft(d.id, { ...d.payload, notes, copy: parsed.copy, costUsd: d.payload.costUsd + cost }, parsed.copy.name);
      return { ok: true, copy: parsed.copy };
    }
    last = parsed.error;
    messages.push({ role: "assistant", content: r.text }, { role: "user", content: `That answer was not usable: ${parsed.error} Answer again with only the JSON object.` });
  }
  return { ok: false, error: `The model's answer was not usable twice (${last}). Try another model.` };
}

/** One marketing image, made from the real photos. Called once per image so each call stays short. */
export async function generateImageAction(input: unknown): Promise<Result<{ key: string }>> {
  await requireAdmin();
  const p = z.object({ draftId: uuid, scene: z.enum(SCENES), extra: z.string().max(300).default("") }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const d = await loadDraft(p.data.draftId);
  if (!d || d.status !== "draft") return { ok: false, error: "Draft not found." };
  if (d.payload.images.length >= MAX_IMAGES_PER_DRAFT) return { ok: false, error: `This draft already has ${MAX_IMAGES_PER_DRAFT} generated images. Remove one first.` };
  if (!d.payload.photoKeys.length) return { ok: false, error: "Add at least one photo of the real print first. The images are made from your photos." };
  const apiKey = await getAiKey("openrouter");
  if (!apiKey) return { ok: false, error: "Images need an OpenRouter API key (AI settings)." };

  const refs: string[] = [];
  for (const k of d.payload.photoKeys.slice(0, 3)) {
    const b = await bytesOf(k);
    const t = b && sniffImageType(b);
    if (b && t) refs.push(`data:image/${t};base64,${Buffer.from(b).toString("base64")}`);
  }
  if (!refs.length) return { ok: false, error: "Could not read the photos." };

  const name = d.payload.copy?.name ?? d.payload.facts.fileName.replace(/\.[a-z0-9]+$/i, "");
  const r = await generateImage({ apiKey, model: IMAGE_MODEL, prompt: imagePrompt(p.data.scene, name, p.data.extra), refs });
  if (!r.ok) return { ok: false, error: r.error };
  const key = `photos/ai-${nanoid(12)}.${r.mime === "image/jpeg" ? "jpg" : r.mime.slice(6)}`;
  await putObject(key, r.bytes, r.mime);
  // re-read so two images finishing together do not overwrite each other
  const fresh = (await loadDraft(d.id)) ?? d;
  await saveDraft(d.id, { ...fresh.payload, images: [...fresh.payload.images, { key, scene: p.data.scene, extra: p.data.extra }], costUsd: fresh.payload.costUsd + (r.costUsd ?? 0) });
  return { ok: true, key };
}

export async function removeImageAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const p = z.object({ draftId: uuid, key: z.string().regex(KEY_PATTERNS.photo) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const d = await loadDraft(p.data.draftId);
  if (!d || d.status !== "draft") return { ok: false, error: "Draft not found." };
  if (!d.payload.images.some((i) => i.key === p.data.key)) return { ok: false, error: "That image is not part of this draft." };
  await deleteObject(p.data.key).catch(() => {});
  await saveDraft(d.id, { ...d.payload, images: d.payload.images.filter((i) => i.key !== p.data.key) });
  return { ok: true };
}

/** Save the owner's edits to the copy and the price. */
export async function saveDraftAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const p = z.object({ draftId: uuid, copy: copySchema, price: z.string().max(20), notes: z.string().max(1500).optional() }).safeParse(input);
  if (!p.success) return { ok: false, error: "The copy is not valid: " + (p.error.issues[0]?.message ?? "check the fields") };
  const d = await loadDraft(p.data.draftId);
  if (!d || d.status !== "draft") return { ok: false, error: "Draft not found." };
  await saveDraft(d.id, { ...d.payload, copy: p.data.copy, price: p.data.price, notes: p.data.notes ?? d.payload.notes }, p.data.copy.name);
  return { ok: true };
}

/**
 * Approval: only now does anything reach the shop. Creates the product as a DRAFT (unpublished), attaches the model and the
 * chosen pictures (the same actions as the product editor, so every check runs again). Order = the order given.
 */
export async function createProductFromDraftAction(input: unknown): Promise<Result<{ productId: string }>> {
  await requireAdmin();
  const p = z.object({ draftId: uuid, photoKeys: z.array(z.string().regex(KEY_PATTERNS.photo)).max(12) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const d = await loadDraft(p.data.draftId);
  if (!d || d.status !== "draft") return { ok: false, error: "Draft not found or already used." };
  const copy = d.payload.copy;
  if (!copy) return { ok: false, error: "Generate or write the copy first." };
  if (!d.payload.price.trim()) return { ok: false, error: "Enter a price first." };
  const allowed = new Set([...d.payload.photoKeys, ...d.payload.images.map((i) => i.key)]);
  if (p.data.photoKeys.some((k) => !allowed.has(k))) return { ok: false, error: "A picture does not belong to this draft." };

  const created = await createProductAction({ name: copy.name, description: descriptionOf(copy), category: copy.category, basePrice: d.payload.price, status: "draft", weightGrams: "" });
  if (!created.ok || !created.id) return { ok: false, error: created.ok ? "Could not create the product." : created.error };
  const productId = created.id;
  const notes: string[] = [];
  const att = await attachModelAction({ productId, key: d.payload.modelKey });
  if (!att.ok) notes.push(`model: ${att.error}`);
  for (const key of p.data.photoKeys) {
    const r = await addPhotoAction({ productId, key, alt: copy.name });
    if (!r.ok) notes.push(`photo: ${r.error}`);
  }
  // pictures not chosen are cleaned up (AI images only; the real photos stay in storage where the owner uploaded them)
  for (const i of d.payload.images) if (!p.data.photoKeys.includes(i.key)) await deleteObject(i.key).catch(() => {});
  await db.update(aiDrafts).set({ status: "applied", appliedAt: new Date(), updatedAt: new Date(), payload: { ...d.payload, productId } }).where(eq(aiDrafts.id, d.id));
  revalidatePath("/admin/ai");
  if (notes.length) return { ok: false, error: `The product was created but: ${notes.join("; ")}. Open it to fix: /admin/products/${productId}` };
  return { ok: true, productId };
}

export async function discardDraftAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const p = z.object({ draftId: uuid }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const d = await loadDraft(p.data.draftId);
  if (!d || d.status !== "draft") return { ok: false, error: "Draft not found." };
  for (const k of [d.payload.modelKey, ...d.payload.photoKeys, ...d.payload.images.map((i) => i.key)]) await deleteObject(k).catch(() => {});
  await db.update(aiDrafts).set({ status: "discarded", updatedAt: new Date() }).where(eq(aiDrafts.id, d.id));
  revalidatePath("/admin/ai");
  return { ok: true };
}
