"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { aiDrafts, aiImages } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { deleteObject } from "@/lib/storage";
import { KEY_PATTERNS } from "@/lib/uploads";
import { centavosToPesos } from "@/lib/money";
import { getProductById } from "@/lib/catalog";
import { getAiPrefs } from "@/lib/ai/settings";
import { MAX_PHOTOS_PER_DRAFT, MODEL_ID, copySchema, descriptionOf, draftSchema, type DraftPayload } from "@/lib/ai/product-copy";
import { addTurn, checkAttachments, findProductChat, loadDraft, runStudio, snapshotOf, updateDraft, type Snapshot } from "@/lib/ai/studio";
import { addPhotoAction, attachModelAction, createProductAction, updateProductAction } from "../products/actions";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
/** A studio call always hands back the draft as it is now (when there is one), even when it failed, so the screen shows what was saved. */
type StudioResult<T = object> = ({ ok: true; snapshot: Snapshot } & T) | { ok: false; error: string; snapshot: Snapshot | null };

const uuid = z.string().uuid();

async function snapshotOrNull(id: string): Promise<Snapshot | null> {
  const d = await loadDraft(id);
  return d ? snapshotOf(d) : null;
}

/** A product the studio may work on: exists, and is not a clicker or keychain designer (those have their own setup). */
async function studioProduct(id: string) {
  const p = await getProductById(id, { raw: true });
  if (!p) return null;
  if (p.options.some((o) => o.type === "text" && (o.constraints.clicker || o.constraints.keychain))) return null;
  return p;
}

/**
 * One chat message. Finds (or opens) the chat: `draftId` for a chat already open, else `productId` for an existing product's
 * one chat, else a new chat for a product that does not exist yet. Attaches the files that came with the message (already
 * uploaded to storage), saves the message, then lets the assistant answer. The assistant only proposes.
 */
export async function studioSendAction(input: unknown): Promise<StudioResult> {
  const admin = await requireAdmin();
  const p = z.object({
    draftId: uuid.nullable(),
    productId: uuid.nullable().default(null),
    text: z.string().trim().max(4000),
    photoKeys: z.array(z.string().regex(KEY_PATTERNS.photo)).max(MAX_PHOTOS_PER_DRAFT).default([]),
    modelKey: z.string().regex(KEY_PATTERNS.model).nullable().default(null),
    imageModel: z.string().regex(MODEL_ID).optional(),
  }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid message.", snapshot: null };
  const { text, photoKeys, modelKey } = p.data;
  if (!text && !photoKeys.length && !modelKey) return { ok: false, error: "Write a message or attach a file.", snapshot: null };

  let draftId = p.data.draftId;
  let current: DraftPayload;
  if (draftId) {
    const d = await loadDraft(draftId);
    if (!d || d.status !== "draft") return { ok: false, error: "This chat is closed. Start a new one.", snapshot: null };
    current = d.payload;
  } else if (p.data.productId) {
    if (!(await studioProduct(p.data.productId))) return { ok: false, error: "That product cannot be used here (it does not exist, or it is a designer with its own setup).", snapshot: null };
    const open = await findProductChat(p.data.productId);
    draftId = open?.id ?? null;
    current = open?.payload ?? draftSchema.parse({ productId: p.data.productId });
  } else {
    current = draftSchema.parse({});
  }
  // an existing product's 3D file is its own: changing it re-detects the parts, which belongs in the product editor
  if (modelKey && current.productId) return { ok: false, error: "This product already exists. Change its 3D file in the product editor (that also re-detects its parts).", snapshot: draftId ? await snapshotOrNull(draftId) : null };
  const fresh = [...new Set(photoKeys)].filter((k) => !current.photoKeys.includes(k));
  if (current.photoKeys.length + fresh.length > MAX_PHOTOS_PER_DRAFT) return { ok: false, error: `A chat can hold ${MAX_PHOTOS_PER_DRAFT} photos. Use fewer.`, snapshot: draftId ? await snapshotOrNull(draftId) : null };
  const checked = await checkAttachments(fresh, modelKey);
  if (!checked.ok) return { ok: false, error: checked.error, snapshot: draftId ? await snapshotOrNull(draftId) : null };

  if (!draftId) {
    const name = current.productId ? (await getProductById(current.productId, { raw: true }))?.name : null;
    const [row] = await db.insert(aiDrafts).values({ kind: "product", title: name ?? "New product", payload: current, createdBy: admin.id }).returning({ id: aiDrafts.id });
    if (!row) return { ok: false, error: "Could not start the chat. Try again.", snapshot: null };
    draftId = row.id;
  }
  let replaced: string | null = null;
  const saved = await updateDraft(draftId, (d) => {
    if (modelKey && d.modelKey && d.modelKey !== modelKey) replaced = d.modelKey;
    const next: DraftPayload = { ...d, photoKeys: [...d.photoKeys, ...fresh.filter((k) => !d.photoKeys.includes(k))], ...(modelKey ? { modelKey, facts: checked.facts } : {}) };
    return addTurn(next, { role: "user", text, photos: fresh, model: modelKey });
  });
  if (!saved) return { ok: false, error: "This chat is closed. Start a new one.", snapshot: null };
  if (replaced) await deleteObject(replaced).catch((e) => console.warn("product studio: could not delete the replaced model", replaced, e));

  const prefs = await getAiPrefs();
  const run = await runStudio({ draftId, imageModel: p.data.imageModel ?? prefs.imageModel, actorId: admin.id });
  const snapshot = await snapshotOrNull(draftId);
  if (!snapshot) return { ok: false, error: "Draft not found.", snapshot: null };
  return run.ok ? { ok: true, snapshot } : { ok: false, error: run.error, snapshot };
}

/** The draft as it is now (after a proposal card was approved, to show its new status). */
export async function studioSnapshotAction(input: unknown): Promise<Snapshot | null> {
  await requireAdmin();
  const p = z.object({ draftId: uuid }).safeParse(input);
  return p.success ? snapshotOrNull(p.data.draftId) : null;
}

/** Delete a picture from the chat: a mockup or an uploaded photo. A picture already added to the product stays (remove it in the product editor). */
export async function removeImageAction(input: unknown): Promise<StudioResult> {
  await requireAdmin();
  const p = z.object({ draftId: uuid, key: z.string().regex(KEY_PATTERNS.photo) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request.", snapshot: null };
  const d = await loadDraft(p.data.draftId);
  if (!d || d.status !== "draft") return { ok: false, error: "Draft not found.", snapshot: null };
  const key = p.data.key;
  if (!d.payload.images.some((i) => i.key === key) && !d.payload.photoKeys.includes(key)) return { ok: false, error: "That picture is not part of this chat.", snapshot: await snapshotOf(d) };
  if (d.payload.attached.includes(key)) return { ok: false, error: "That picture is on the product now. Remove it in the product editor.", snapshot: await snapshotOf(d) };
  await deleteObject(key).catch(() => {});
  const next = await updateDraft(d.id, (x) => ({
    ...x,
    images: x.images.filter((i) => i.key !== key),
    photoKeys: x.photoKeys.filter((k) => k !== key),
    chat: x.chat.map((t) => ({ ...t, images: t.images.filter((k) => k !== key), photos: t.photos.filter((k) => k !== key) })),
  }));
  return next ? { ok: true, snapshot: await snapshotOf(next) } : { ok: false, error: "Draft not found.", snapshot: null };
}

/** Save the owner's edits to the listing proposal and the price. */
export async function saveDraftAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const p = z.object({ draftId: uuid, copy: copySchema, price: z.string().max(20) }).safeParse(input);
  if (!p.success) return { ok: false, error: "The copy is not valid: " + (p.error.issues[0]?.message ?? "check the fields") };
  const d = await updateDraft(p.data.draftId, (x) => ({ ...x, copy: p.data.copy, price: p.data.price }), p.data.copy.name);
  return d ? { ok: true } : { ok: false, error: "Draft not found." };
}

/**
 * Apply what the chat prepared. A NEW product: creates it as a draft (unpublished) with the listing, the 3D file (which
 * detects its colour parts) and the ticked pictures; the chat then continues on that product (designs, options, price).
 * An EXISTING product: updates its listing (if one is proposed) and adds the ticked pictures not added before.
 * Every write goes through the product editor's own actions, so every check runs again. The draft is claimed first, so a
 * double click or a second tab cannot do it twice.
 */
export async function applyDraftAction(input: unknown): Promise<Result<{ productId: string; created: boolean; warnings: string[]; snapshot: Snapshot | null }>> {
  const admin = await requireAdmin();
  const p = z.object({ draftId: uuid, photoKeys: z.array(z.string().regex(KEY_PATTERNS.photo)).max(18) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const d = await loadDraft(p.data.draftId);
  if (!d || d.status !== "draft") return { ok: false, error: "Draft not found or already in use." };
  const allowed = new Set([...d.payload.photoKeys, ...d.payload.images.map((i) => i.key)]);
  if (p.data.photoKeys.some((k) => !allowed.has(k))) return { ok: false, error: "A picture does not belong to this chat." };
  const pictures = p.data.photoKeys.filter((k) => !d.payload.attached.includes(k));
  const copy = d.payload.copy;
  const existing = d.payload.productId ? await studioProduct(d.payload.productId) : null;
  if (d.payload.productId && !existing) return { ok: false, error: "The product of this chat no longer exists." };
  if (!existing) {
    if (!copy) return { ok: false, error: "There is no listing yet. Ask the assistant to write one, or fill it in." };
    if (!d.payload.price.trim()) return { ok: false, error: "Enter a price first." };
  } else if (!copy && !pictures.length) return { ok: false, error: "Nothing to apply: no listing change and no new picture ticked." };

  // claim the chat, so two clicks (or two tabs) cannot both apply it; it is released again either way
  const claimed = await db.update(aiDrafts).set({ status: "applying", updatedAt: new Date() }).where(and(eq(aiDrafts.id, d.id), eq(aiDrafts.status, "draft"))).returning({ id: aiDrafts.id });
  if (!claimed.length) return { ok: false, error: "This is already being applied." };
  const release = () => db.update(aiDrafts).set({ status: "draft", updatedAt: new Date() }).where(eq(aiDrafts.id, d.id));

  const warnings: string[] = [];
  let productId: string;
  let created = false;
  try {
    if (!existing) {
      const r = await createProductAction({ name: copy!.name, description: descriptionOf(copy!), category: copy!.category, tags: copy!.tags, basePrice: d.payload.price, status: "draft", weightGrams: "" });
      if (!r.ok || !r.id) { await release(); return { ok: false, error: r.ok ? "Could not create the product." : r.error }; }
      productId = r.id;
      created = true;
      if (d.payload.modelKey) {
        const att = await attachModelAction({ productId, key: d.payload.modelKey });
        if (!att.ok) warnings.push(`model: ${att.error}`);
      } else warnings.push("no 3D file was attached to the chat; add one in the product editor");
    } else {
      productId = existing.id;
      if (copy) {
        const r = await updateProductAction({ id: existing.id, name: copy.name, description: descriptionOf(copy), category: copy.category, tags: copy.tags, basePrice: d.payload.price.trim() || String(centavosToPesos(existing.basePriceCents)), status: existing.status, weightGrams: existing.weightGrams ?? "" });
        if (!r.ok) { await release(); return { ok: false, error: r.error }; }
      }
    }
  } catch (e) {
    await release();
    throw e;
  }
  // from here the product holds the changes; a picture that fails is a warning, not a failure
  const added: string[] = [];
  for (const key of pictures) {
    const r = await addPhotoAction({ productId, key, alt: copy?.name ?? existing?.name ?? "" });
    if (r.ok) added.push(key); else warnings.push(`photo: ${r.error}`);
  }
  // the chat's mockups enter the image gallery too, so the product has one history of its generated pictures
  const chatMockups = added
    .map((key) => ({ key, img: d.payload.images.find((i) => i.key === key) }))
    .filter((e): e is { key: string; img: NonNullable<typeof e.img> } => Boolean(e.img));
  if (chatMockups.length) {
    await db.insert(aiImages).values(chatMockups.map(({ key, img }) => ({ productId, s3Key: key, scene: img.scene === "hero" ? "studio" : img.scene, direction: img.extra, model: img.model || "chat mockup", createdBy: admin.id })));
    revalidatePath("/admin/ai/images");
  }
  const note = created
    ? `Created "${copy!.name}" as an unpublished draft${((w) => (w.length ? ` with ${w.join(" and ")}` : ""))([d.payload.modelKey ? "its 3D file" : "", added.length ? `${added.length} picture${added.length > 1 ? "s" : ""}` : ""].filter(Boolean))}. Next: ask me to suggest designs and options for it, or to check the price.`
    : `Applied to the product: ${[copy ? "the listing" : "", added.length ? `${added.length} picture${added.length > 1 ? "s" : ""}` : ""].filter(Boolean).join(" and ")}.`;
  await db.update(aiDrafts).set({ status: "draft", updatedAt: new Date(), ...(created ? { appliedAt: new Date() } : {}) }).where(eq(aiDrafts.id, d.id));
  const next = await updateDraft(d.id, (x) => addTurn({ ...x, productId, copy: null, price: "", attached: [...x.attached, ...added] }, { role: "assistant", text: warnings.length ? `${note}\n\nTo check: ${warnings.join("; ")}.` : note }), copy?.name);
  revalidatePath("/admin/ai");
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true, productId, created, warnings, snapshot: next ? await snapshotOf(next) : null };
}

export async function discardDraftAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const p = z.object({ draftId: uuid }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const d = await loadDraft(p.data.draftId);
  if (!d || d.status !== "draft") return { ok: false, error: "Draft not found." };
  // only files nothing else uses: never a picture on the product, and never the 3D file once a product exists (it may be the product's own)
  const keep = new Set(d.payload.attached);
  const files = [d.payload.productId ? null : d.payload.modelKey, ...d.payload.photoKeys, ...d.payload.images.map((i) => i.key)].filter((k): k is string => Boolean(k) && !keep.has(k as string));
  for (const k of files) await deleteObject(k).catch((e) => console.warn("product studio: could not delete", k, e));
  await db.update(aiDrafts).set({ status: "discarded", updatedAt: new Date() }).where(eq(aiDrafts.id, d.id));
  revalidatePath("/admin/ai");
  return { ok: true };
}
