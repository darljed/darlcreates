/**
 * Storefront product reads. Cached with tags `products` and `product:<slug>`; admin edits expire them. Also
 * assembles a product with its options and photos.
 */
import { db } from "@/db";
import {
  products,
  productOptions,
  productOptionValues,
  productPhotos,
} from "@/db/schema";
import { and, asc, eq, inArray, sql, type SQLWrapper } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";
import type { ProductOptionInput } from "./pricing";
import { applyInventory, type ColourInventory } from "./colour-inventory-schema";
import { loadColourInventory } from "./site-content-store";
import { COLOURS_TAG } from "./site-content";

export type ProductListItem = {
  id: string;
  slug: string;
  name: string;
  description: string;
  category: string;
  basePriceCents: number;
  photoKey: string | null;
  /** ms since epoch, so the landing page can show the newest products. */
  createdAtMs: number;
  /** ms since epoch of the last edit, for the sitemap. */
  updatedAtMs: number;
};

/** Published products for the storefront listing. Cached; invalidated on admin edits. */
export async function listPublishedProducts(): Promise<ProductListItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  const rows = await db
    .select()
    .from(products)
    .where(and(eq(products.status, "published"), eq(products.isService, false))) // services (the clicker designer) have their own link
    .orderBy(asc(products.name));

  const photos = rows.length
    ? await db
        .select({ productId: productPhotos.productId, key: productPhotos.s3Key })
        .from(productPhotos)
        .where(inArray(productPhotos.productId, rows.map((p) => p.id)))
        .orderBy(asc(productPhotos.sort))
    : [];
  const firstPhoto = new Map<string, string>();
  for (const ph of photos) if (!firstPhoto.has(ph.productId)) firstPhoto.set(ph.productId, ph.key);
  const items: ProductListItem[] = rows.map((p) => ({
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description,
    category: p.category,
    basePriceCents: p.basePriceCents,
    photoKey: firstPhoto.get(p.id) ?? null,
    createdAtMs: p.createdAt.getTime(),
    updatedAtMs: p.updatedAt.getTime(),
  }));
  return items;
}

/** Slug of the first published product that is a clicker designer (its text option holds a `clicker` config), or null. */
export async function findClickerProductSlug(): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  const [row] = await db
    .select({ slug: products.slug })
    .from(products)
    .innerJoin(productOptions, eq(productOptions.productId, products.id))
    .where(and(eq(products.status, "published"), sql`${productOptions.constraints} ? 'clicker'`))
    .orderBy(asc(products.createdAt))
    .limit(1);
  return row?.slug ?? null;
}

/** Slug of the first published product that is a name keychain designer (its text option holds a `keychain` config), or null. */
export async function findKeychainProductSlug(): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  cacheTag("products");
  const [row] = await db
    .select({ slug: products.slug })
    .from(products)
    .innerJoin(productOptions, eq(productOptions.productId, products.id))
    .where(and(eq(products.status, "published"), sql`${productOptions.constraints} ? 'keychain'`))
    .orderBy(asc(products.createdAt))
    .limit(1);
  return row?.slug ?? null;
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
  cacheTag("products", `product:${slug}`, COLOURS_TAG);
  const where = opts.publishedOnly
    ? and(eq(products.slug, slug), eq(products.status, "published"))
    : eq(products.slug, slug);
  const [p] = await db.select().from(products).where(where).limit(1);
  if (!p) return null;
  return (await getProductsByIds([p.id])).get(p.id) ?? null;
}

export async function getProductById(id: string, opts: ReadOptions = {}): Promise<FullProduct | null> {
  return (await getProductsByIds([id], opts)).get(id) ?? null;
}

/** `raw`: every colour the product has, ignoring the shop's colour inventory (admin screens, old orders). */
type ReadOptions = { raw?: boolean };

/**
 * Several products with their photos, options and values, in ONE round of four queries run together (the database may be
 * far away, so the number of sequential round trips is what costs). Missing ids are absent from the map.
 */
export async function getProductsByIds(ids: string[] | SQLWrapper, opts: ReadOptions = {}): Promise<Map<string, FullProduct>> {
  // `ids` may also be a subquery of product ids, so a caller that does not know them yet (the cart) needs no earlier round
  const unique = Array.isArray(ids) ? [...new Set(ids)] : ids;
  if (Array.isArray(unique) && unique.length === 0) return new Map();
  const [rows, photos, optRows, vals, inventory] = await Promise.all([
    db.select().from(products).where(inArray(products.id, unique)),
    db.select().from(productPhotos).where(inArray(productPhotos.productId, unique)).orderBy(asc(productPhotos.sort)),
    db.select().from(productOptions).where(inArray(productOptions.productId, unique)).orderBy(asc(productOptions.sort)),
    db
      .select({ v: productOptionValues })
      .from(productOptionValues)
      .innerJoin(productOptions, eq(productOptionValues.optionId, productOptions.id))
      .where(inArray(productOptions.productId, unique))
      .orderBy(asc(productOptionValues.sort)),
    opts.raw ? Promise.resolve(null) : loadColourInventory(), // only the colours in stock are offered
  ]);
  return assemble(rows, photos, optRows, vals.map((r) => r.v), inventory);
}

function assemble(
  rows: (typeof products.$inferSelect)[],
  photos: (typeof productPhotos.$inferSelect)[],
  opts: (typeof productOptions.$inferSelect)[],
  vals: (typeof productOptionValues.$inferSelect)[],
  inventory: ColourInventory | null,
): Map<string, FullProduct> {
  const out = new Map<string, FullProduct>();
  for (const p of rows) {
    const built: ProductOptionInput[] = opts
      .filter((o) => o.productId === p.id)
      .map((o) => ({
        id: o.id,
        type: o.type,
        label: o.label,
        required: o.required,
        priceDeltaCents: o.priceDeltaCents,
        constraints: (o.constraints ?? {}) as ProductOptionInput["constraints"],
        values: vals
          .filter((v) => v.optionId === o.id)
          .map((v) => ({ id: v.id, label: v.label, value: v.value, priceDeltaCents: v.priceDeltaCents })),
      }));
    const options = applyInventory(built, inventory);
    out.set(p.id, {
      id: p.id,
      slug: p.slug,
      name: p.name,
      description: p.description,
      category: p.category,
      basePriceCents: p.basePriceCents,
      status: p.status,
      stlKey: p.stlKey,
      photos: photos.filter((ph) => ph.productId === p.id).map((ph) => ({ id: ph.id, key: ph.s3Key, alt: ph.alt })),
      options,
    });
  }
  return out;
}
