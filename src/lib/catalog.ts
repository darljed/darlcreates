import { db } from "@/db";
import {
  products,
  productOptions,
  productOptionValues,
  productPhotos,
} from "@/db/schema";
import { and, asc, eq } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import type { ProductOptionInput } from "./pricing";

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  basePriceCents: number;
  photoKey: string | null;
};

/** Published products for the storefront listing. Cached; invalidated on admin edits. */
export async function listPublishedProducts(): Promise<ProductListItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  const rows = await db
    .select()
    .from(products)
    .where(eq(products.status, "published"))
    .orderBy(asc(products.name));

  const items: ProductListItem[] = [];
  for (const p of rows) {
    const [photo] = await db
      .select({ key: productPhotos.s3Key })
      .from(productPhotos)
      .where(eq(productPhotos.productId, p.id))
      .orderBy(asc(productPhotos.sort))
      .limit(1);
    items.push({
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: p.category,
      basePriceCents: p.basePriceCents,
      photoKey: photo?.key ?? null,
    });
  }
  return items;
}

export type FullProduct = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  basePriceCents: number;
  status: string;
  stlKey: string | null;
  photos: { id: string; key: string; alt: string }[];
  options: ProductOptionInput[];
};

/** A single product by slug with its full customization schema + photos. */
export async function getProductBySlug(
  slug: string,
  opts: { publishedOnly?: boolean } = {},
): Promise<FullProduct | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("products", `product:${slug}`);
  const where = opts.publishedOnly
    ? and(eq(products.slug, slug), eq(products.status, "published"))
    : eq(products.slug, slug);
  const [p] = await db.select().from(products).where(where).limit(1);
  if (!p) return null;
  return assembleProduct(p);
}

export async function getProductById(id: string): Promise<FullProduct | null> {
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p) return null;
  return assembleProduct(p);
}

async function assembleProduct(p: typeof products.$inferSelect): Promise<FullProduct> {
  const photos = await db
    .select()
    .from(productPhotos)
    .where(eq(productPhotos.productId, p.id))
    .orderBy(asc(productPhotos.sort));

  const opts = await db
    .select()
    .from(productOptions)
    .where(eq(productOptions.productId, p.id))
    .orderBy(asc(productOptions.sort));

  const options: ProductOptionInput[] = [];
  for (const o of opts) {
    const values = await db
      .select()
      .from(productOptionValues)
      .where(eq(productOptionValues.optionId, o.id))
      .orderBy(asc(productOptionValues.sort));
    options.push({
      id: o.id,
      type: o.type,
      label: o.label,
      required: o.required,
      priceDeltaCents: o.priceDeltaCents,
      constraints: (o.constraints ?? {}) as ProductOptionInput["constraints"],
      values: values.map((v) => ({
        id: v.id,
        label: v.label,
        value: v.value,
        priceDeltaCents: v.priceDeltaCents,
      })),
    });
  }

  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    category: p.category,
    basePriceCents: p.basePriceCents,
    status: p.status,
    stlKey: p.stlKey,
    photos: photos.map((ph) => ({ id: ph.id, key: ph.s3Key, alt: ph.alt })),
    options,
  };
}
