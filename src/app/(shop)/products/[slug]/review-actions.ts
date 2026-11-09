"use server";

import { z } from "zod";
import { revalidateTag, revalidatePath } from "next/cache";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { reviews, orders, orderItems, products } from "@/db/schema";
import { requireUser } from "@/lib/session";
import { canReview } from "@/lib/reviews";

type Result = { ok: true } | { ok: false; error: string };

const reviewSchema = z.object({
  productId: z.string().uuid(),
  slug: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  body: z.string().max(1000).optional().default(""),
});

export async function submitReviewAction(input: unknown): Promise<Result> {
  const user = await requireUser();
  const parsed = reviewSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid review" };

  const eligible = await canReview(user.id, parsed.data.productId);
  if (!eligible) {
    return {
      ok: false,
      error: "You can review this only after a delivered order (once).",
    };
  }

  // Link the review to one of the user's delivered orders for this product.
  const [ord] = await db
    .select({ id: orders.id })
    .from(orders)
    .innerJoin(orderItems, eq(orderItems.orderId, orders.id))
    .where(
      and(
        eq(orders.userId, user.id),
        eq(orders.status, "delivered"),
        eq(orderItems.productId, parsed.data.productId),
      ),
    )
    .limit(1);

  await db.insert(reviews).values({
    productId: parsed.data.productId,
    orderId: ord?.id ?? null,
    userId: user.id,
    rating: parsed.data.rating,
    body: parsed.data.body,
    approved: false, // admin moderates before it shows
  });

  revalidateTag(`product:${parsed.data.slug}`, "max");
  revalidateTag(`reviews:${parsed.data.productId}`, "max");
  revalidatePath(`/products/${parsed.data.slug}`);
  return { ok: true };
}

const moderateSchema = z.object({
  reviewId: z.string().uuid(),
  approved: z.boolean(),
});

export async function moderateReviewAction(input: unknown): Promise<Result> {
  const { requireAdmin } = await import("@/lib/session");
  await requireAdmin();
  const parsed = moderateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };

  const [r] = await db
    .update(reviews)
    .set({ approved: parsed.data.approved })
    .where(eq(reviews.id, parsed.data.reviewId))
    .returning({ productId: reviews.productId });

  if (r) {
    const [p] = await db
      .select({ slug: products.slug })
      .from(products)
      .where(eq(products.id, r.productId))
      .limit(1);
    if (p) {
      revalidateTag(`product:${p.slug}`, "max");
      revalidatePath(`/products/${p.slug}`);
    }
    revalidateTag(`reviews:${r.productId}`, "max");
  }
  revalidatePath("/admin/reviews");
  return { ok: true };
}
