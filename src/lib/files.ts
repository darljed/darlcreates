import { db } from "@/db";
import { products, productPhotos } from "@/db/schema";
import { loadHomeContent } from "./site-content-store";
import { and, eq } from "drizzle-orm";

/** True if `key` is the STL or a photo of a PUBLISHED product, or the landing-page hero image (publicly viewable). */
export async function isPublishedFile(key: string): Promise<boolean> {
  if (key.startsWith("site/")) return (await loadHomeContent()).hero.imageKey === key;
  const [stl] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.status, "published"), eq(products.stlKey, key)))
    .limit(1);
  if (stl) return true;

  const [photo] = await db
    .select({ id: productPhotos.id })
    .from(productPhotos)
    .innerJoin(products, eq(productPhotos.productId, products.id))
    .where(and(eq(productPhotos.s3Key, key), eq(products.status, "published")))
    .limit(1);
  return Boolean(photo);
}
