import { db } from "@/db";
import { reviews, products, users } from "@/db/schema";
import { desc, eq } from "drizzle-orm";
import { ReviewModeration } from "@/components/admin/review-moderation";
import { DataTable, EmptyState, PageHeader, Td, Th, Tr } from "@/components/shell/ui";

export const metadata = { title: "Reviews · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

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
      <PageHeader title="Reviews" description="Approve a review to show it on the product page." />
      {rows.length === 0 ? (
        <EmptyState>No reviews yet.</EmptyState>
      ) : (
        <DataTable>
          <thead>
            <tr>
              <Th>Product</Th>
              <Th>Rating</Th>
              <Th>Review</Th>
              <Th>Status</Th>
              <Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <Tr key={r.id}>
                <Td className="font-semibold">
                  {r.product}
                  <span className="block text-xs font-normal text-muted-foreground">{r.author}</span>
                </Td>
                <Td>{r.rating}★</Td>
                <Td className="max-w-md">{r.body ?? <span className="text-muted-foreground">No comment</span>}</Td>
                <Td className="text-muted-foreground">{r.approved ? "Approved" : "Pending"}</Td>
                <Td className="text-right">
                  <ReviewModeration reviewId={r.id} approved={r.approved} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </DataTable>
      )}
    </div>
  );
}
