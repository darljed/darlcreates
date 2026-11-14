import { db } from "@/db";
import { reviews, products, users } from "@/db/schema";
import { asc, desc, eq, sql } from "drizzle-orm";
import Link from "next/link";
import { ReviewModeration } from "@/components/admin/review-moderation";
import { DataTable, EmptyState, PageHeader, Td, Th, Tr } from "@/components/shell/ui";

export const metadata = { title: "Reviews · Admin" };

// Admin pages are per-request and RBAC-gated; they may block on navigation.
// (A layout's `instant = false` does not cover its child pages.)
export const instant = false;

const FILTERS = [
  { key: "", label: "All" },
  { key: "pending", label: "Needs approval" },
  { key: "approved", label: "Approved" },
] as const;

export default async function AdminReviewsPage({ searchParams }: PageProps<"/admin/reviews">) {
  const sp = await searchParams;
  const show = sp.show === "pending" || sp.show === "approved" ? sp.show : "";
  const [counts] = await db
    .select({ all: sql<number>`count(*)::int`, pending: sql<number>`count(*) filter (where not ${reviews.approved})::int` })
    .from(reviews);
  const n = { "": counts.all, pending: counts.pending, approved: counts.all - counts.pending };
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
    .where(show === "pending" ? eq(reviews.approved, false) : show === "approved" ? eq(reviews.approved, true) : undefined)
    .orderBy(asc(reviews.approved), desc(reviews.createdAt)); // anything waiting for approval comes first

  return (
    <div>
      <PageHeader title="Reviews" description="Approve a review to show it on the product page." />
      <nav aria-label="Filter reviews" className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={f.key ? `/admin/reviews?show=${f.key}` : "/admin/reviews"}
            aria-current={show === f.key ? "page" : undefined}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium ${show === f.key ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-primary"}`}
          >
            {f.label}
            <span className={`ml-1.5 tabular-nums ${show === f.key ? "opacity-80" : "text-muted-foreground"}`}>{n[f.key]}</span>
          </Link>
        ))}
      </nav>
      {rows.length === 0 ? (
        <EmptyState>{show ? "No reviews in this view." : "No reviews yet."}</EmptyState>
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
                <Td label="Rating">{r.rating}★</Td>
                <Td label="Review" className="max-w-md">{r.body ?? <span className="text-muted-foreground">No comment</span>}</Td>
                <Td label="Status" className="text-muted-foreground">{r.approved ? "Approved" : "Pending"}</Td>
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
