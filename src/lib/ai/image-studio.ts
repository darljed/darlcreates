/** The image studio: AI product pictures made with one click from presets (no chat, no text model in the loop), gathered
 *  in one gallery per product (the `ai_images` table). A picture is placed on the product (or hidden) with a click; the
 *  `product_photos` row is the shop's source of truth, this table keeps the history and the cost of every generation.
 *  Nothing here is customer facing by itself: the catalog reads only `product_photos`. */
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "@/db";
import { aiImages, products, productPhotos } from "@/db/schema";
import { fileUrl } from "@/lib/storage-url";
import { deleteObject } from "@/lib/storage";
import { getAiKey } from "./settings";
import { GENERATE_SET, IMAGE_PRESETS, IMAGE_PRESET_LABEL, studioImagePrompt, type ImagePreset } from "./product-copy";
import { realDeps, type StudioDeps } from "./studio";

export { GENERATE_SET, IMAGE_PRESETS, IMAGE_PRESET_HINT, IMAGE_PRESET_LABEL, studioImagePrompt } from "./product-copy";
export type { ImagePreset } from "./product-copy";

/** Generated images kept per product, so a runaway batch cannot bury the gallery. */
export const MAX_IMAGES_PER_PRODUCT = 40;

export type ImageStudioDeps = Pick<StudioDeps, "chat" | "image" | "store" | "refs" | "imageInfo" | "textInfo">;

// ---- the prompts ---------------------------------------------------------------------------------------------------

// ---- the gallery ---------------------------------------------------------------------------------------------------

/** One gallery tile as the browser sees it: the picture, its generation facts and whether it is on the product now. */
export type GalleryImage = {
  id: string;
  key: string;
  url: string;
  /** The tiles: the picture, its generation facts and whether it is on the product now. */
  preset: string;
  /** The owner's extra direction the prompt was built from (presets other than cover/custom may have ignored it). */
  direction: string;
  model: string;
  alt: string;
  costUsd: number;
  createdAtMs: number;
  /** The product_photos row this key is on, if any, with whether that row is visible to customers and its order. */
  onProduct: { photoId: string; hidden: boolean; sort: number } | null;
};

function viewOf(r: (typeof aiImages.$inferSelect), photo: (typeof productPhotos.$inferSelect) | undefined): GalleryImage {
  return {
    id: r.id,
    key: r.s3Key,
    url: fileUrl(r.s3Key) ?? "",
    preset: r.scene,
    direction: r.direction,
    model: r.model,
    alt: r.alt,
    costUsd: r.costUsd,
    createdAtMs: r.createdAt.getTime(),
    onProduct: photo ? { photoId: photo.id, hidden: photo.hidden, sort: photo.sort } : null,
  };
}

/** Every generated picture of a product, newest first, with what is on the product. */
export async function productGallery(productId: string): Promise<GalleryImage[]> {
  const [rows, photos] = await Promise.all([
    db.select().from(aiImages).where(eq(aiImages.productId, productId)).orderBy(desc(aiImages.createdAt)),
    db.select().from(productPhotos).where(eq(productPhotos.productId, productId)),
  ]);
  const byKey = new Map(photos.map((p) => [p.s3Key, p]));
  return rows.map((r) => viewOf(r, byKey.get(r.s3Key)));
}

/** How many real photos the product has — the generator uses them as the base of every preset. */
export async function realPhotoCount(productId: string): Promise<number> {
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(productPhotos).where(eq(productPhotos.productId, productId))) as [{ n: number }];
  return n;
}

// ---- generation ----------------------------------------------------------------------------------------------------

/**
 * One picture, end to end: pick the product's real photos as the base, build the preset's prompt, call the image model,
 * store the picture and record it in the gallery with its cost. No text model, no chat, so nothing can claim it without
 * the tool call being the only path.
 */
export async function generateStudioImage(o: { productId: string; preset: ImagePreset; direction: string; model: string; actorId: string; deps?: Partial<ImageStudioDeps> }): Promise<{ ok: true; image: GalleryImage; costUsd: number } | { ok: false; error: string; costUsd: number }> {
  const deps = { ...realDeps, ...o.deps };
  if (!IMAGE_PRESETS.includes(o.preset)) return { ok: false, error: "Unknown preset.", costUsd: 0 };
  const apiKey = await getAiKey("openrouter");
  if (!apiKey) return { ok: false, error: "Add the OpenRouter key in AI settings first.", costUsd: 0 };

  const [product] = await db.select({ id: products.id, name: products.name }).from(products).where(eq(products.id, o.productId)).limit(1);
  if (!product) return { ok: false, error: "Product not found.", costUsd: 0 };
  const [{ n }] = (await db.select({ n: sql<number>`count(*)::int` }).from(aiImages).where(eq(aiImages.productId, o.productId))) as [{ n: number }];
  if (n >= MAX_IMAGES_PER_PRODUCT) return { ok: false, error: `This product already has ${MAX_IMAGES_PER_PRODUCT} generated images. Delete the ones you do not keep.`, costUsd: 0 };
  const photos = await db.select({ key: productPhotos.s3Key }).from(productPhotos).where(eq(productPhotos.productId, o.productId)).orderBy(asc(productPhotos.sort));

  const info = await deps.imageInfo(o.model);
  if (!info) return { ok: false, error: "That image model is not one of the models in AI settings. Pick another.", costUsd: 0 };
  // a model that redraws the real product needs a photo to redraw from; a prompt-only model does not
  const { refs, skipped } = info.vision ? await deps.refs(photos.map((p) => p.key), 3) : { refs: [], skipped: 0 };
  if (info.vision && !refs.length) return { ok: false, error: photos.length ? (skipped ? "The photos are larger than 3 MB each, which is too big to send to the AI. Upload smaller copies." : "Could not read the product's photos.") : "This product has no real photos yet. Add one (Product studio or the product editor) — the image model redraws the real product, so it needs one.", costUsd: 0 };

  const prompt = studioImagePrompt(o.preset, product.name, o.direction);
  const r = await deps.image({ apiKey, model: o.model, prompt, refs, imageOnly: info.imageOnly });
  if (!r.ok) return { ok: false, error: r.error, costUsd: 0 };
  const cost = r.costUsd ?? 0;
  const key = `photos/ai-${nanoid(12)}.${r.mime === "image/jpeg" ? "jpg" : r.mime.slice(6)}`;
  await deps.store(key, r.bytes, r.mime);
  try {
    const [row] = await db.insert(aiImages).values({ productId: o.productId, s3Key: key, scene: o.preset, direction: o.direction.slice(0, 300), model: o.model, costUsd: cost, createdBy: o.actorId }).returning();
    return { ok: true, image: viewOf(row, undefined), costUsd: cost };
  } catch (e) {
    await deleteObject(key).catch(() => {});
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the picture.", costUsd: cost };
  }
}

/** The standard set in one go (Cover, Studio, Lifestyle), so a new product gets presentable in one click. */
export async function generateStudioSet(o: { productId: string; model: string; actorId: string; deps?: Partial<ImageStudioDeps> }): Promise<{ images: GalleryImage[]; failures: string[]; costUsd: number }> {
  const images: GalleryImage[] = [];
  const failures: string[] = [];
  let cost = 0;
  for (const preset of GENERATE_SET) {
    const r = await generateStudioImage({ ...o, preset, direction: "" });
    if (r.ok) { images.push(r.image); cost += r.costUsd; } else failures.push(`${IMAGE_PRESET_LABEL[preset]}: ${r.error}`);
  }
  return { images, failures, costUsd: cost };
}

// ---- gallery actions -----------------------------------------------------------------------------------------------

async function slugOf(productId: string): Promise<string | null> {
  const [p] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId)).limit(1);
  return p?.slug ?? null;
}

/** Place a gallery picture on the product, or take it off (hidden, not deleted). Returns the tile's new state. */
export async function setOnProduct(imageId: string, on: boolean): Promise<{ ok: true; image: GalleryImage; productId: string; slug: string | null } | { ok: false; error: string }> {
  const [row] = await db.select().from(aiImages).where(eq(aiImages.id, imageId)).limit(1);
  if (!row) return { ok: false, error: "Picture not found." };
  const productId = row.productId;
  if (!productId) return { ok: false, error: "This picture belongs to a product that was deleted." };
  const [photo] = await db.select().from(productPhotos).where(and(eq(productPhotos.productId, productId), eq(productPhotos.s3Key, row.s3Key))).limit(1);
  if (on) {
    if (photo) {
      if (photo.hidden) await db.update(productPhotos).set({ hidden: false }).where(eq(productPhotos.id, photo.id));
    } else {
      const rows = await db.select({ sort: productPhotos.sort }).from(productPhotos).where(eq(productPhotos.productId, productId));
      const nextSort = rows.reduce((m, r2) => Math.max(m, r2.sort + 1), 0);
      await db.insert(productPhotos).values({ productId, s3Key: row.s3Key, alt: row.alt, sort: nextSort });
    }
  } else if (photo && !photo.hidden) {
    await db.update(productPhotos).set({ hidden: true }).where(eq(productPhotos.id, photo.id));
  }
  return { ok: true, image: (await productGallery(productId)).find((g) => g.id === row.id) ?? viewOf(row, undefined), productId, slug: await slugOf(productId) };
}

/** Make a picture the cover: first in the shop's gallery. The picture must be on the product. */
export async function setCover(imageId: string): Promise<{ ok: true; image: GalleryImage; productId: string; slug: string | null } | { ok: false; error: string }> {
  const [row] = await db.select().from(aiImages).where(eq(aiImages.id, imageId)).limit(1);
  if (!row || !row.productId) return { ok: false, error: "Picture not found." };
  const [photo] = await db.select().from(productPhotos).where(and(eq(productPhotos.productId, row.productId), eq(productPhotos.s3Key, row.s3Key))).limit(1);
  if (!photo) return { ok: false, error: "Put the picture on the product first (Add to product), then set it as the cover." };
  if (photo.hidden) return { ok: false, error: "Put the picture on the product first (Add to product), then set it as the cover." };
  const rows = await db.select({ sort: productPhotos.sort }).from(productPhotos).where(eq(productPhotos.productId, row.productId));
  const first = rows.reduce((m, r2) => Math.min(m, r2.sort), 0);
  if (photo.sort > first) await db.update(productPhotos).set({ sort: first - 1 }).where(eq(productPhotos.id, photo.id));
  return { ok: true, image: (await productGallery(row.productId)).find((g) => g.id === row.id) ?? viewOf(row, undefined), productId: row.productId, slug: await slugOf(row.productId) };
}

/**
 * Delete a generated picture for good — only while it is not on the product (turn it off first), so nothing a customer
 * can see is removed silently. The gallery history row and the stored file both go.
 */
export async function deleteGalleryImage(imageId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db.select().from(aiImages).where(eq(aiImages.id, imageId)).limit(1);
  if (!row) return { ok: false, error: "Picture not found." };
  const linked = row.productId
    ? await db.select().from(productPhotos).where(and(eq(productPhotos.productId, row.productId), eq(productPhotos.s3Key, row.s3Key))).limit(1)
    : [];
  if (linked.length) return { ok: false, error: "This picture is on the product. Turn it off (Remove from product) before deleting it." };
  await db.delete(aiImages).where(eq(aiImages.id, row.id));
  await deleteObject(row.s3Key).catch(() => {});
  return { ok: true };
}

// ---- alt text ------------------------------------------------------------------------------------------------------

const ALT_SYSTEM = "You write alt text for a Philippine 3D-printing shop's product photos. Describe what the picture shows: the product, the setting, the angle. One sentence, plain English, under 120 characters. Answer with the sentence only, no quotes.";

/** One short alt sentence for a picture, written by the owner's chat model (it must be able to see images). */
export async function writeImageAlt(imageId: string, deps?: Partial<ImageStudioDeps>): Promise<{ ok: true; alt: string } | { ok: false; error: string }> {
  const d = { ...realDeps, ...deps };
  const [row] = await db.select().from(aiImages).where(eq(aiImages.id, imageId)).limit(1);
  if (!row) return { ok: false, error: "Picture not found." };
  const { getAiPrefs } = await import("./settings");
  const prefs = await getAiPrefs();
  if (!prefs.copyModel) return { ok: false, error: "Choose a model for writing in AI settings first." };
  const apiKey = await getAiKey("openrouter");
  if (!apiKey) return { ok: false, error: "Add the OpenRouter key in AI settings first." };
  const info = await d.textInfo(prefs.copyProvider, prefs.copyModel);
  if (info && !info.vision) return { ok: false, error: `${prefs.copyModel} cannot see images, so it cannot describe the picture. Pick a writing model with vision in AI settings.` };
  const bytes = row.s3Key.startsWith("photos/") ? await d.refs([row.s3Key], 1) : { refs: [], skipped: 0 };
  const r = await d.chat({
    provider: prefs.copyProvider,
    apiKey,
    model: prefs.copyModel,
    messages: [
      { role: "system", content: ALT_SYSTEM },
      { role: "user", content: bytes.refs.length ? [{ type: "text" as const, text: `This is a product photo (${row.scene}).` }, ...bytes.refs.map((url) => ({ type: "image_url" as const, image_url: { url } }))] : `Describe an alt text for a product photo (${row.scene}) of the shop's product. One sentence, under 120 characters.` },
    ],
    maxTokens: 100,
    timeoutMs: 60_000,
  });
  if (!r.ok) return { ok: false, error: r.error };
  const alt = r.text.trim().replace(/^["“]|["”]$/g, "").slice(0, 200);
  if (!alt) return { ok: false, error: "The model gave no alt text. Try again." };
  await db.update(aiImages).set({ alt }).where(eq(aiImages.id, row.id));
  if (row.productId) await db.update(productPhotos).set({ alt }).where(and(eq(productPhotos.productId, row.productId), eq(productPhotos.s3Key, row.s3Key)));
  return { ok: true, alt };
}
