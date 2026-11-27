"use server";

import { z } from "zod";
import { revalidatePath, updateTag } from "next/cache";
import { count, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import {
  products,
  productOptions,
  productOptionValues,
  cartItems,
  orderItems,
} from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { parsePesoInput } from "@/lib/money";
import { normalizeTags } from "@/lib/tags";
import { deleteObject, headObject, peekBytes } from "@/lib/storage";
import { KEY_PATTERNS, UPLOAD_RULES, looksLikeZip, modelFormatOf } from "@/lib/uploads";
import { productPhotos } from "@/db/schema";
import { nameSlotSchema, slotMaxHeight } from "@/lib/name-mesh";
import { checkFit, engraveProblem, fitScale, shrinkSlot, wallThickness } from "@/lib/name-3mf";
import { plateObjectNear } from "@/lib/threemf";
import { loadSurface } from "@/lib/name-surface";
import { measureSpace } from "@/lib/name-space";
import type { SpaceTable } from "@/lib/name-mesh";
import { clickerConfigSchema, type ClickerConfig } from "@/lib/clicker/spec";
import { keychainConfigSchema, type KeychainConfig } from "@/lib/keychain/spec";
import { autoConfigureModel, type AutoConfig } from "@/lib/model-autoconfig";
import { DEFAULT_INVENTORY, inStock, inventoryHexes } from "@/lib/colour-inventory-schema";
import { loadColourInventory } from "@/lib/site-content-store";

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
  /** Tags as a list or a comma-separated string. Left out = unchanged on update (the agent edits without it), none on create. */
  tags: z.union([z.string(), z.array(z.string())]).optional().transform((v) => (v === undefined ? undefined : normalizeTags(v))),
  basePrice: z.string().min(1),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  /** Packed weight of one unit in grams; empty = use the shop default. */
  weightGrams: z.preprocess((v) => (v === "" || v === undefined ? null : v), z.coerce.number().int().min(1).max(50_000).nullable()).default(null),
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
      tags: parsed.data.tags ?? [],
      basePriceCents,
      status: parsed.data.status,
      weightGrams: parsed.data.weightGrams,
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
      ...(parsed.data.tags !== undefined ? { tags: parsed.data.tags } : {}),
      basePriceCents,
      status: parsed.data.status,
      weightGrams: parsed.data.weightGrams,
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
  // a colour choice must be a colour in stock (when the shop has set its colours up)
  const [parent] = await db.select({ type: productOptions.type }).from(productOptions).where(eq(productOptions.id, parsed.data.optionId)).limit(1);
  if (parent?.type === "color" && !inStock(await loadColourInventory(), parsed.data.value)) {
    return { ok: false, error: "That colour is not in your Colours list. Add it under Colours first, or pick one from the list." };
  }
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
  const inventory = await loadColourInventory();
  const outOfStock = slot?.nameColors?.find((c) => !inStock(inventory, c.hex));
  if (outOfStock) return { ok: false, error: `${outOfStock.label || outOfStock.hex} is not in your Colours list. Add it under Colours first, or remove it here.` };
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
    auto = await autoConfigureModel(productId, key, { inventory: await loadColourInventory() });
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

const clickerActionSchema = z.object({
  productId: z.string().uuid(),
  /** null turns the product back into a normal one. */
  config: clickerConfigSchema.nullable(),
});

/**
 * Make a product a clicker designer (or back to a normal product). The settings live in the constraints of one
 * required text option, "Your clicker"; no table changes. Refused when the product has other options, because the
 * designer replaces the option form and would ignore them.
 */
export async function saveClickerConfigAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = clickerActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid clicker settings" };
  const { productId, config } = parsed.data;
  const slug = await slugOf(productId);
  if (!slug) return { ok: false, error: "Product not found" };
  const [self] = await db.select({ isService: products.isService }).from(products).where(eq(products.id, productId)).limit(1);
  if (!config && self?.isService) return { ok: false, error: "A designer service (clicker or keychain) cannot be turned back into a product." };

  if (config) {
    // when the shop has a colour list, it IS the palette (the browser's copy is ignored)
    const inventory = await loadColourInventory();
    if (inventory) config.palette = inventoryHexes(inventory);
    if (config.minSize > config.maxSize) return { ok: false, error: "The smallest size is larger than the largest size" };
    if (new Set(config.palette.map((c) => c.toLowerCase())).size !== config.palette.length) return { ok: false, error: "The colour list has the same colour twice" };
    const tiers = config.sizeTiers.map((t) => t.upToMm);
    if (tiers.some((t, i) => i > 0 && t <= tiers[i - 1])) return { ok: false, error: "Size steps must go up from small to large" };
    if (tiers[tiers.length - 1] < config.maxSize) return { ok: false, error: `The last size step must reach the largest size (${config.maxSize} mm)` };
    if (config.maxColours > config.palette.length) return { ok: false, error: "The number of colours per print cannot be more than the colours you offer" };
  }

  const options = await db.select().from(productOptions).where(eq(productOptions.productId, productId));
  const existing = options.find((o) => (o.constraints as { clicker?: unknown } | null)?.clicker);
  if (config && options.some((o) => o !== existing)) {
    return { ok: false, error: "Remove this product's other customization options first. The clicker designer replaces them." };
  }

  const saved: ClickerConfig | null = config;
  if (!saved) {
    if (existing) await db.delete(productOptions).where(eq(productOptions.id, existing.id));
  } else if (existing) {
    await db.update(productOptions).set({ constraints: { ...(existing.constraints as object), clicker: saved } }).where(eq(productOptions.id, existing.id));
  } else {
    await db.insert(productOptions).values({
      productId,
      type: "text",
      label: "Your clicker",
      required: true,
      priceDeltaCents: 0,
      constraints: { maxLen: 20, clicker: saved },
      sort: 0,
    });
  }
  // the designer is a service of its own: out of the product grid, and never deletable
  await db.update(products).set({ isService: Boolean(saved), updatedAt: new Date() }).where(eq(products.id, productId));
  invalidate(slug);
  revalidatePath("/clicker");
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

const keychainActionSchema = z.object({
  productId: z.string().uuid(),
  /** null turns the product back into a normal one (refused for a service). */
  config: keychainConfigSchema.nullable(),
});

/**
 * Make a product a name keychain designer. Same shape as `saveClickerConfigAction`: the settings (limits, offered fonts,
 * icons and colours, and every price) live in the constraints of one required text option, "Your keychain".
 */
export async function saveKeychainConfigAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = keychainActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid keychain settings" };
  const { productId, config } = parsed.data;
  const slug = await slugOf(productId);
  if (!slug) return { ok: false, error: "Product not found" };
  const [self] = await db.select({ isService: products.isService }).from(products).where(eq(products.id, productId)).limit(1);
  if (!config && self?.isService) return { ok: false, error: "A designer service (clicker or keychain) cannot be turned back into a product." };

  if (config) {
    // when the shop has a colour list, it IS the palette (the browser's copy is ignored)
    const inventory = await loadColourInventory();
    if (inventory) config.palette = inventoryHexes(inventory);
    if (new Set(config.palette.map((c) => c.toLowerCase())).size !== config.palette.length) return { ok: false, error: "The colour list has the same colour twice" };
    const tiers = config.sizeTiers.map((t) => t.upToMm);
    if (tiers.some((t, i) => i > 0 && t <= tiers[i - 1])) return { ok: false, error: "Length steps must go up from short to long" };
    if (tiers[tiers.length - 1] < config.maxLengthMm) return { ok: false, error: `The last length step must reach the longest keychain you allow (${config.maxLengthMm} mm)` };
    if (config.maxColours > config.palette.length) return { ok: false, error: "The number of colours per print cannot be more than the colours you offer" };
    if (new Set(config.fonts).size !== config.fonts.length || new Set(config.icons).size !== config.icons.length || new Set(config.styles).size !== config.styles.length) return { ok: false, error: "A font, icon or style is listed twice" };
    if (config.styles.includes("icon") && config.icons.length === 0) return { ok: false, error: "Offer at least one icon, or turn the icon style off" };
  }

  const options = await db.select().from(productOptions).where(eq(productOptions.productId, productId));
  const existing = options.find((o) => (o.constraints as { keychain?: unknown } | null)?.keychain);
  if (config && options.some((o) => o !== existing)) {
    return { ok: false, error: "Remove this product's other customization options first. The keychain designer replaces them." };
  }

  const saved: KeychainConfig | null = config;
  if (!saved) {
    if (existing) await db.delete(productOptions).where(eq(productOptions.id, existing.id));
  } else if (existing) {
    await db.update(productOptions).set({ constraints: { ...(existing.constraints as object), keychain: saved } }).where(eq(productOptions.id, existing.id));
  } else {
    await db.insert(productOptions).values({ productId, type: "text", label: "Your keychain", required: true, priceDeltaCents: 0, constraints: { maxLen: 20, keychain: saved }, sort: 0 });
  }
  await db.update(products).set({ isService: Boolean(saved), updatedAt: new Date() }).where(eq(products.id, productId));
  invalidate(slug);
  revalidatePath("/keychain");
  revalidatePath(`/admin/products/${productId}`);
  return { ok: true };
}

const deleteProductSchema = z.object({ productId: z.string().uuid() });

/**
 * Delete a product for good (photos, options and reviews go with it; its files are removed from storage). Refused for a
 * service (the clicker designer) and for a product that has been ordered: order history keeps pointing at it, so
 * archive it instead. Lines in customers' carts are removed.
 */
export async function deleteProductAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = deleteProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const { productId } = parsed.data;

  const [product] = await db.select().from(products).where(eq(products.id, productId)).limit(1);
  if (!product) return { ok: false, error: "Product not found" };
  if (product.isService) return { ok: false, error: "A designer service (clicker or keychain) is standalone and cannot be deleted." };
  const [{ n }] = await db.select({ n: count() }).from(orderItems).where(eq(orderItems.productId, productId));
  if (n > 0) return { ok: false, error: `This product is on ${n} order line${n === 1 ? "" : "s"}, so it cannot be deleted. Set its status to Archived to take it off the shop.` };

  const photos = await db.select({ key: productPhotos.s3Key }).from(productPhotos).where(eq(productPhotos.productId, productId));
  try {
    await db.transaction(async (tx) => {
      await tx.delete(cartItems).where(eq(cartItems.productId, productId));
      await tx.delete(products).where(eq(products.id, productId));
    });
  } catch {
    // an order placed between the check and the delete: the restrict key refuses
    return { ok: false, error: "This product was just ordered, so it cannot be deleted. Archive it instead." };
  }
  for (const key of [...photos.map((p) => p.key), ...(product.stlKey ? [product.stlKey] : [])]) {
    try { await deleteObject(key); } catch { /* an orphan file is harmless */ }
  }
  invalidate(product.slug);
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// Editing customizations (also the ones found automatically)
// ---------------------------------------------------------------------------------------------------------------------

const updateOptionSchema = z.object({
  optionId: z.string().uuid(),
  label: z.string().trim().min(1).max(60),
  required: z.boolean(),
  priceDelta: z.string().optional().default("0"),
  maxLen: z.number().int().min(1).max(200).optional(),
});

/** Rename an option, make it required or not, change its price, or (text) its length. The rest of its settings stay. */
export async function updateOptionAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = updateOptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid option" };
  const d = parsed.data;
  const priceDeltaCents = parsePesoInput(d.priceDelta || "0");
  if (priceDeltaCents === null) return { ok: false, error: "Invalid price" };
  const [opt] = await db.select().from(productOptions).where(eq(productOptions.id, d.optionId)).limit(1);
  if (!opt) return { ok: false, error: "Option not found" };
  const constraints = opt.type === "text" && d.maxLen ? { ...(opt.constraints as object), maxLen: d.maxLen } : opt.constraints;
  await db.update(productOptions).set({ label: d.label, required: d.required, priceDeltaCents, constraints }).where(eq(productOptions.id, d.optionId));
  invalidate(await slugOf(opt.productId));
  return { ok: true };
}

const updateValueSchema = z.object({
  valueId: z.string().uuid(),
  label: z.string().trim().min(1).max(60),
  priceDelta: z.string().optional().default("0"),
});

/** Rename a choice or change its price. A colour's hex is not editable (a print file is tied to it): delete it and add another. */
export async function updateOptionValueAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = updateValueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid choice" };
  const priceDeltaCents = parsePesoInput(parsed.data.priceDelta || "0");
  if (priceDeltaCents === null) return { ok: false, error: "Invalid price" };
  const [row] = await db
    .select({ productId: productOptions.productId })
    .from(productOptionValues)
    .innerJoin(productOptions, eq(productOptionValues.optionId, productOptions.id))
    .where(eq(productOptionValues.id, parsed.data.valueId))
    .limit(1);
  if (!row) return { ok: false, error: "Choice not found" };
  await db.update(productOptionValues).set({ label: parsed.data.label, priceDeltaCents }).where(eq(productOptionValues.id, parsed.data.valueId));
  invalidate(await slugOf(row.productId));
  return { ok: true };
}

const deleteValuesSchema = z.object({ valueIds: z.array(z.string().uuid()).min(1).max(200) });

/** Remove choices (a colour you do not want to offer on this option). */
export async function deleteOptionValuesAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = deleteValuesSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const rows = await db
    .select({ productId: productOptions.productId })
    .from(productOptionValues)
    .innerJoin(productOptions, eq(productOptionValues.optionId, productOptions.id))
    .where(inArray(productOptionValues.id, parsed.data.valueIds));
  await db.delete(productOptionValues).where(inArray(productOptionValues.id, parsed.data.valueIds));
  for (const slug of new Set(await Promise.all([...new Set(rows.map((r) => r.productId))].map(slugOf)))) invalidate(slug);
  return { ok: true };
}

const addAllColoursSchema = z.object({ optionId: z.string().uuid() });

/** Add every colour of the shop's list that this colour option does not offer yet. Existing choices are kept as they are. */
export async function addAllColoursAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = addAllColoursSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const [opt] = await db.select().from(productOptions).where(eq(productOptions.id, parsed.data.optionId)).limit(1);
  if (!opt || opt.type !== "color") return { ok: false, error: "Choose a colour option" };
  const inventory = (await loadColourInventory()) ?? DEFAULT_INVENTORY;
  const have = await db.select({ value: productOptionValues.value, sort: productOptionValues.sort }).from(productOptionValues).where(eq(productOptionValues.optionId, opt.id));
  const haveHex = new Set(have.map((v) => v.value.toLowerCase()));
  const missing = inventory.colours.filter((c) => !haveHex.has(c.hex.toLowerCase()));
  if (missing.length) {
    const start = have.reduce((m, v) => Math.max(m, v.sort + 1), 0);
    await db.insert(productOptionValues).values(missing.map((c, i) => ({ optionId: opt.id, label: c.name, value: c.hex, sort: start + i })));
    invalidate(await slugOf(opt.productId));
  }
  return { ok: true, id: String(missing.length) };
}

const redetectSchema = z.object({ productId: z.string().uuid() });

/**
 * Read the attached 3MF again and rebuild the product's colour options from it (see lib/model-autoconfig.ts). The
 * colour options are replaced; text and size options stay. Returns what was found so the admin can edit it.
 */
export async function redetectCustomizationsAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = redetectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  const [product] = await db.select({ slug: products.slug, stlKey: products.stlKey }).from(products).where(eq(products.id, parsed.data.productId)).limit(1);
  if (!product) return { ok: false, error: "Product not found" };
  if (!product.stlKey) return { ok: false, error: "Attach a 3D model first." };
  if (!/\.3mf$/i.test(product.stlKey)) return { ok: false, error: "Auto-detect reads a 3MF slicer project. An STL has no parts or colours to find." };
  let auto: AutoConfig;
  try {
    auto = await autoConfigureModel(parsed.data.productId, product.stlKey, { inventory: await loadColourInventory(), redetect: true });
  } catch (e) {
    return { ok: false, error: `Auto-detect failed: ${e instanceof Error ? e.message : "unknown error"}` };
  }
  invalidate(product.slug);
  revalidatePath(`/admin/products/${parsed.data.productId}`);
  return { ok: true, auto };
}
