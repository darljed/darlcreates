"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  products,
  productOptions,
  productOptionValues,
} from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { parsePesoInput } from "@/lib/money";
import { deleteObject, headObject, peekBytes } from "@/lib/storage";
import { KEY_PATTERNS, UPLOAD_RULES, looksLikeZip, modelFormatOf } from "@/lib/uploads";
import { productPhotos } from "@/db/schema";
import { nameSlotSchema, slotMaxHeight } from "@/lib/name-mesh";
import { checkFit, engraveProblem, fitScale, shrinkSlot, wallThickness } from "@/lib/name-3mf";
import { plateObjectNear } from "@/lib/threemf";
import { loadSurface } from "@/lib/name-surface";
import { measureSpace } from "@/lib/name-space";
import type { SpaceTable } from "@/lib/name-mesh";
import { autoConfigureModel, type AutoConfig } from "@/lib/model-autoconfig";

type Result = { ok: true; id?: string; auto?: AutoConfig } | { ok: false; error: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function invalidate(slug?: string) {
  updateTag("products");
  if (slug) updateTag(`product:${slug}`);
  revalidatePath("/products");
  revalidatePath("/admin/products");
}

const productSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().default(""),
  category: z.string().trim().toLowerCase().min(1).max(60).default("general"), // stored lower-case so "Toys" and "toys" are one category
  basePrice: z.string().min(1),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export async function createProductAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = productSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid product details" };

  const basePriceCents = parsePesoInput(parsed.data.basePrice);
  if (basePriceCents === null) return { ok: false, error: "Invalid base price" };

  let slug = slugify(parsed.data.name);
  const [clash] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.slug, slug))
    .limit(1);
  if (clash) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;

  const [created] = await db
    .insert(products)
    .values({
      slug,
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      basePriceCents,
      status: parsed.data.status,
    })
    .returning({ id: products.id });

  invalidate(slug);
  return { ok: true, id: created.id };
}

const updateSchema = productSchema.extend({ id: z.string().uuid() });

export async function updateProductAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid product details" };

  const basePriceCents = parsePesoInput(parsed.data.basePrice);
  if (basePriceCents === null) return { ok: false, error: "Invalid base price" };

  const [existing] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, parsed.data.id))
    .limit(1);
  if (!existing) return { ok: false, error: "Product not found" };

  await db
    .update(products)
    .set({
      name: parsed.data.name,
      description: parsed.data.description,
      category: parsed.data.category,
      basePriceCents,
      status: parsed.data.status,
      updatedAt: new Date(),
    })
    .where(eq(products.id, parsed.data.id));

  invalidate(existing.slug);
  return { ok: true };
}

const optionSchema = z.object({
  productId: z.string().uuid(),
  type: z.enum(["color", "text", "size", "image"]),
  label: z.string().min(1).max(60),
  required: z.boolean().default(false),
  priceDelta: z.string().optional().default("0"),
  maxLen: z.number().int().min(1).max(200).optional(),
  pattern: z.string().max(200).optional(),
});

export async function addOptionAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = optionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid option" };

  const priceDeltaCents = parsePesoInput(parsed.data.priceDelta || "0") ?? 0;
  const constraints: Record<string, unknown> = {};
  if (parsed.data.type === "text") {
    constraints.maxLen = parsed.data.maxLen ?? 20;
    if (parsed.data.pattern) constraints.pattern = parsed.data.pattern;
  }

  const existing = await db
    .select({ sort: productOptions.sort })
    .from(productOptions)
    .where(eq(productOptions.productId, parsed.data.productId));
  const nextSort = existing.reduce((m, r) => Math.max(m, r.sort + 1), 0);

  await db.insert(productOptions).values({
    productId: parsed.data.productId,
    type: parsed.data.type,
    label: parsed.data.label,
    required: parsed.data.required,
    priceDeltaCents,
    constraints,
    sort: nextSort,
  });

  const slug = await slugOf(parsed.data.productId);
  invalidate(slug);
  return { ok: true };
}

const valueSchema = z.object({
  optionId: z.string().uuid(),
  productId: z.string().uuid(),
  label: z.string().min(1).max(60),
  value: z.string().min(1).max(60),
  priceDelta: z.string().optional().default("0"),
});

export async function addOptionValueAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = valueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid value" };

  const priceDeltaCents = parsePesoInput(parsed.data.priceDelta || "0") ?? 0;
  await db.insert(productOptionValues).values({
    optionId: parsed.data.optionId,
    label: parsed.data.label,
    value: parsed.data.value,
    priceDeltaCents,
  });

  const slug = await slugOf(parsed.data.productId);
  invalidate(slug);
  return { ok: true };
}

const deleteOptionSchema = z.object({
  optionId: z.string().uuid(),
  productId: z.string().uuid(),
});

export async function deleteOptionAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = deleteOptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  await db.delete(productOptions).where(eq(productOptions.id, parsed.data.optionId));
  const slug = await slugOf(parsed.data.productId);
  invalidate(slug);
  return { ok: true };
}

const slotActionSchema = z.object({
  productId: z.string().uuid(),
  optionId: z.string().uuid(),
  /** null removes the slot */
  slot: nameSlotSchema.nullable(),
});

/**
 * Put the customer's name on the 3D model: save (or remove) the name slot on a text option. Only for products whose
 * model is an STL or 3MF (the print file is built from it, see lib/name-3mf.ts), and only if a name of the widest
 * allowed size sits fully on the surface there.
 */
export async function saveNameSlotAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = slotActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid name position" };
  const { productId, optionId, slot } = parsed.data;

  const [product] = await db.select({ slug: products.slug, stlKey: products.stlKey }).from(products).where(eq(products.id, productId)).limit(1);
  if (!product) return { ok: false, error: "Product not found" };
  const ext = product.stlKey ? /\.(stl|3mf)$/i.exec(product.stlKey)?.[1].toLowerCase() : undefined;
  const kind = ext === "stl" || ext === "3mf" ? ext : null;
  if (slot && !kind) {
    return { ok: false, error: "Adding a name to the model needs an STL or 3MF model file." };
  }
  const [opt] = await db.select().from(productOptions).where(eq(productOptions.id, optionId)).limit(1);
  if (!opt || opt.productId !== productId || opt.type !== "text") return { ok: false, error: "Choose a text option of this product" };

  if (slot?.mode === "engraved" && kind !== "3mf") {
    return { ok: false, error: "Engraved names need a 3MF slicer project (Bambu Studio / Orca). An STL cannot hold a part that is cut out." };
  }
  let toSave = slot;
  if (slot && kind && product.stlKey) {
    // A name area of the size allowed must sit fully on the surface here, or some names would print floating or buried.
    try {
      const surface = await loadSurface(product.stlKey);
      const fit = checkFit(surface, slot, slot.maxWidth, slotMaxHeight(slot));
      if (!fit.fits) {
        const k = fitScale(surface, slot);
        const smaller = k ? shrinkSlot(slot, k) : null;
        return {
          ok: false,
          error: smaller
            ? `A name area of ${slot.maxWidth} × ${slotMaxHeight(slot)} mm would hang off the surface here. Set "Widest name" to ${smaller.maxWidth} mm and "Tallest name" to ${smaller.maxHeight} mm or less (or move the spot).`
            : (fit.problem ?? "The name does not fit on the surface here. Try another spot or smaller letters."),
        };
      }
      // with several objects on the plate the name goes into the one that was clicked
      const near = plateObjectNear(surface, slot.position);
      if (near) toSave = { ...slot, object: near };
      // an engraving needs wall behind it
      const deep = engraveProblem(surface, slot, slot.maxWidth, slotMaxHeight(slot));
      if (deep) return { ok: false, error: deep };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : "Could not read the model file" };
    }
  }

  const { slot: _old, ...rest } = (opt.constraints ?? {}) as Record<string, unknown>;
  void _old;
  await db.update(productOptions).set({ constraints: toSave ? { ...rest, slot: toSave } : rest }).where(eq(productOptions.id, optionId));
  invalidate(product.slug);
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

const spaceSchema = z.object({
  productId: z.string().uuid(),
  position: nameSlotSchema.shape.position,
  normal: nameSlotSchema.shape.normal,
  up: nameSlotSchema.shape.up,
});

/**
 * How much room there is for a name at a spot on the product's model, as a table of widest-area-per-height. The admin
 * editor uses it to stop values that would overflow; saving checks again (`saveNameSlotAction`).
 */
export async function measureNameSpaceAction(input: unknown): Promise<{ ok: true; table: SpaceTable } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = spaceSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid position" };
  const [product] = await db.select({ stlKey: products.stlKey }).from(products).where(eq(products.id, parsed.data.productId)).limit(1);
  if (!product?.stlKey || !/\.(stl|3mf)$/i.test(product.stlKey)) return { ok: false, error: "This product has no STL or 3MF model" };
  try {
    return { ok: true, table: measureSpace(await loadSurface(product.stlKey), parsed.data) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the model file" };
  }
}

const wallSchema = z.object({ productId: z.string().uuid(), slot: nameSlotSchema });

/** How thick the model is behind the name area (mm), so the editor can limit an engraving's depth. null = could not tell. */
export async function measureWallAction(input: unknown): Promise<{ ok: true; wallMm: number | null } | { ok: false; error: string }> {
  await requireAdmin();
  const parsed = wallSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid position" };
  const [product] = await db.select({ stlKey: products.stlKey }).from(products).where(eq(products.id, parsed.data.productId)).limit(1);
  if (!product?.stlKey || !/\.(stl|3mf)$/i.test(product.stlKey)) return { ok: false, error: "This product has no STL or 3MF model" };
  try {
    const { slot } = parsed.data;
    return { ok: true, wallMm: wallThickness(await loadSurface(product.stlKey), slot, slot.maxWidth, slotMaxHeight(slot)) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the model file" };
  }
}

async function slugOf(productId: string): Promise<string | undefined> {
  const [p] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  return p?.slug;
}

// ---------------------------------------------------------------------------
// File attachments (uploaded directly to S3 via /api/uploads/presign first)
// ---------------------------------------------------------------------------

const attachModelSchema = z.object({
  productId: z.string().uuid(),
  key: z.string().regex(KEY_PATTERNS.model),
});

/**
 * Attach an uploaded 3D model (STL or 3MF) to a product. Verifies the object really
 * exists and is within the size limit (the client could lie), and that a .3mf is a
 * real ZIP. The previous model is NOT deleted from S3: existing orders reference it
 * via order_items.stl_key_snapshot. A 3MF slicer project is also read to auto-configure the name slot and colours.
 */
export async function attachModelAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = attachModelSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid file key" };
  const { productId, key } = parsed.data;

  const size = await headObject(key);
  if (size === null) return { ok: false, error: "Upload not found in storage" };
  if (size > UPLOAD_RULES.model.maxBytes) {
    await deleteObject(key);
    return { ok: false, error: "Model file too large" };
  }
  if (modelFormatOf(key) === "3mf" && !looksLikeZip(await peekBytes(key, 4))) {
    await deleteObject(key);
    return { ok: false, error: "That doesn't look like a valid 3MF file (not a ZIP archive)" };
  }

  await db
    .update(products)
    .set({ stlKey: key, updatedAt: new Date() })
    .where(eq(products.id, productId));

  // A slicer 3MF can configure the product by itself: the designer's example text becomes the name slot and the
  // project's filament colours become the colour swatches (see lib/model-autoconfig.ts). Never blocks the upload.
  let auto: AutoConfig | undefined;
  try {
    auto = await autoConfigureModel(productId, key);
  } catch (e) {
    auto = { modelKey: key, detected: null, slotSaved: false, textOptionCreated: false, colours: { added: [], kept: false, parts: [] }, notes: [`Auto-configuration failed: ${e instanceof Error ? e.message : "unknown error"}. The model was attached as uploaded.`] };
  }

  invalidate(await slugOf(productId));
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true, auto };
}

const addPhotoSchema = z.object({
  productId: z.string().uuid(),
  key: z.string().regex(KEY_PATTERNS.photo),
  alt: z.string().max(200).optional().default(""),
});

export async function addPhotoAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = addPhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid file key" };

  const size = await headObject(parsed.data.key);
  if (size === null) return { ok: false, error: "Upload not found in storage" };
  if (size > UPLOAD_RULES.photo.maxBytes) {
    await deleteObject(parsed.data.key);
    return { ok: false, error: "Photo too large" };
  }

  const existing = await db
    .select({ sort: productPhotos.sort })
    .from(productPhotos)
    .where(eq(productPhotos.productId, parsed.data.productId));
  const nextSort = existing.reduce((m, r) => Math.max(m, r.sort + 1), 0);

  await db.insert(productPhotos).values({
    productId: parsed.data.productId,
    s3Key: parsed.data.key,
    alt: parsed.data.alt,
    sort: nextSort,
  });

  invalidate(await slugOf(parsed.data.productId));
  return { ok: true };
}

const deletePhotoSchema = z.object({ photoId: z.string().uuid() });

export async function deletePhotoAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = deletePhotoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const [photo] = await db
    .select()
    .from(productPhotos)
    .where(eq(productPhotos.id, parsed.data.photoId))
    .limit(1);
  if (!photo) return { ok: false, error: "Photo not found" };

  await db.delete(productPhotos).where(eq(productPhotos.id, photo.id));
  // Photos are not snapshotted into orders, so the object can go too.
  await deleteObject(photo.s3Key).catch(() => {});

  invalidate(await slugOf(photo.productId));
  return { ok: true };
}
