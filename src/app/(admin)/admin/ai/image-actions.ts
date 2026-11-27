"use server";

/**
 * The image studio's actions (admin → AI → Image gallery). Each is a thin checked wrapper over lib/ai/image-studio.ts,
 * which holds the actual work and is what the test script exercises directly.
 */
import { revalidatePath, updateTag } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { products } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { MODEL_ID } from "@/lib/ai/product-copy";
import {
  deleteGalleryImage,
  generateStudioImage,
  generateStudioSet,
  setCover,
  setOnProduct,
  writeImageAlt,
  type GalleryImage,
} from "@/lib/ai/image-studio";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };
type GalleryResult<T = object> = ({ ok: true; image: GalleryImage } & T) | { ok: false; error: string };

const uuid = z.string().uuid();
const generateSchema = z.object({
  productId: uuid,
  preset: z.enum(["cover", "studio", "lifestyle", "detail", "custom"]),
  direction: z.string().trim().max(400).default(""),
  model: z.string().regex(MODEL_ID),
});

async function slugOf(productId: string): Promise<string | null> {
  const [p] = await db.select({ slug: products.slug }).from(products).where(eq(products.id, productId)).limit(1);
  return p?.slug ?? null;
}

/** Expire the cached picture lists after a gallery change (the storefront card and gallery, and the admin screens). */
async function invalidate(productId: string): Promise<void> {
  updateTag("products");
  updateTag(`product:${productId}`);
  const slug = await slugOf(productId);
  if (slug) updateTag(`product:${slug}`);
  revalidatePath("/products");
  revalidatePath("/admin/products");
  revalidatePath("/admin/ai/images");
}

export async function generateImageAction(input: unknown): Promise<GalleryResult<{ costUsd: number }>> {
  const admin = await requireAdmin();
  const p = generateSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const r = await generateStudioImage({ ...p.data, actorId: admin.id });
  if (r.ok) await invalidate(p.data.productId);
  return r.ok ? { ok: true, image: r.image, costUsd: r.costUsd } : { ok: false, error: r.error };
}

export async function generateSetAction(input: unknown): Promise<Result<{ images: GalleryImage[]; failures: string[]; costUsd: number }>> {
  const admin = await requireAdmin();
  const p = z.object({ productId: uuid, model: z.string().regex(MODEL_ID) }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const r = await generateStudioSet({ ...p.data, actorId: admin.id });
  if (r.images.length) await invalidate(p.data.productId);
  if (!r.images.length) return { ok: false, error: r.failures.join(" ") || "Nothing was generated." };
  return { ok: true, ...r };
}

const toggleSchema = z.object({ imageId: uuid, on: z.boolean() });

/** Add a gallery picture to the product, or take it off (it stays in the gallery either way). */
export async function imageOnProductAction(input: unknown): Promise<GalleryResult> {
  await requireAdmin();
  const p = toggleSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const r = await setOnProduct(p.data.imageId, p.data.on);
  if (r.ok) await invalidate(r.productId);
  return r.ok ? { ok: true, image: r.image } : r;
}

/** Make a gallery picture the product's cover (first in the shop's gallery). */
export async function imageCoverAction(input: unknown): Promise<GalleryResult> {
  await requireAdmin();
  const p = z.object({ imageId: uuid }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const r = await setCover(p.data.imageId);
  if (r.ok) await invalidate(r.productId);
  return r.ok ? { ok: true, image: r.image } : r;
}

/** Delete a generated picture (gallery history and the stored file). Refused while it is on the product. */
export async function imageDeleteAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const p = z.object({ imageId: uuid }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  return deleteGalleryImage(p.data.imageId);
}

/** One alt sentence for the picture, written by the chat model (with vision). */
export async function imageAltAction(input: unknown): Promise<Result<{ alt: string }>> {
  await requireAdmin();
  const p = z.object({ imageId: uuid }).safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  return writeImageAlt(p.data.imageId);
}
