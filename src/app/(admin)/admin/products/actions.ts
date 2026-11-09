"use server";

import { z } from "zod";
import { revalidatePath, revalidateTag } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import {
  products,
  productOptions,
  productOptionValues,
} from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { parsePesoInput } from "@/lib/money";

type Result = { ok: true; id?: string } | { ok: false; error: string };

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function invalidate(slug?: string) {
  revalidateTag("products", "max");
  if (slug) revalidateTag(`product:${slug}`, "max");
  revalidatePath("/products");
  revalidatePath("/admin/products");
}

const productSchema = z.object({
  name: z.string().min(2).max(120),
  description: z.string().max(2000).optional().default(""),
  category: z.string().min(1).max(60).default("general"),
  basePrice: z.string().min(1),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  stlKey: z.string().max(300).optional(),
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
      stlKey: parsed.data.stlKey || null,
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
      stlKey: parsed.data.stlKey || null,
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

async function slugOf(productId: string): Promise<string | undefined> {
  const [p] = await db
    .select({ slug: products.slug })
    .from(products)
    .where(eq(products.id, productId))
    .limit(1);
  return p?.slug;
}
