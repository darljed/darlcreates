import { db } from "@/db";
import { reviews, orders, orderItems } from "@/db/schema";
import { and, desc, eq, sql } from "drizzle-orm";
import { cacheLife, cacheTag } from "next/cache";

export type ProductReview = {
  id: string;
  rating: number;
  body: string;
  authorName: string;
  createdAt: Date;
};

/** Approved reviews + aggregate rating for a product. Cached per product slug. */
export async function getProductReviews(productId: string) {
  "use cache";
  cacheLife("hours");
  cacheTag(`reviews:${productId}`);
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      createdAt: reviews.createdAt,
    })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.approved, true)))
    .orderBy(desc(reviews.createdAt));

  const [agg] = await db
    .select({
      avg: sql<number>`coalesce(avg(${reviews.rating}), 0)`,
      count: sql<number>`count(*)`,
    })
    .from(reviews)
    .where(and(eq(reviews.productId, productId), eq(reviews.approved, true)));

  return {
    reviews: rows,
    average: Number(agg?.avg ?? 0),
    count: Number(agg?.count ?? 0),
  };
}

/**
 * A user may review a product only if they have a DELIVERED order containing it
 * and haven't already reviewed it.
 */
export async function canReview(
  userId: string,
  productId: string,
): Promise<boolean> {
  const delivered = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, userId),
        eq(orders.status, "delivered"),
        eq(orderItems.productId, productId),
      ),
    )
    .limit(1);
  if (delivered.length === 0) return false;

  const existing = await db
    .select({ id: reviews.id })
    .from(reviews)
    .where(and(eq(reviews.userId, userId), eq(reviews.productId, productId)))
    .limit(1);
  return existing.length === 0;
}
