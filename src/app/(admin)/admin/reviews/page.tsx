import { db } from "@/db";
import { reviews, products, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ReviewModeration } from "@/components/admin/review-moderation";

export const metadata = { title: "Reviews · Admin" };

export default async function AdminReviewsPage() {
  const rows = await db
    .select({
      id: reviews.id,
      rating: reviews.rating,
      body: reviews.body,
      approved: reviews.approved,
      createdAt: reviews.createdAt,
      product: products.name,
      author: users.name,
    })
    .from(reviews)
    .innerJoin(products, eq(reviews.productId, products.id))
    .innerJoin(users, eq(reviews.userId, users.id))
    .orderBy(desc(reviews.createdAt));

  return (
    <div>
      <h1 className="mb-6 text-3xl font-extrabold">Reviews</h1>
      {rows.length === 0 ? (
        <p className="text-muted-foreground">No reviews yet.</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div
              key={r.id}
              className="flex flex-wrap items-start justify-between gap-4 rounded-xl border-2 border-border bg-card p-4"
            >
              <div>
                <p className="font-bold">
                  {r.product}{" "}
                  <span className="text-sm font-normal text-muted-foreground">
                    · {r.rating}★ · {r.author}
                  </span>
                </p>
                {r.body && <p className="mt-1 text-sm">{r.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">
                  {r.approved ? "Approved (visible)" : "Pending"}
                </p>
              </div>
              <ReviewModeration reviewId={r.id} approved={r.approved} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
