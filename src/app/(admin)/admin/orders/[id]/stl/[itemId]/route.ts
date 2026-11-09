import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { orderItems } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { readUrl, isStorageConfigured } from "@/lib/storage";

/**
 * Admin-only: resolve the print-ready STL for an order item and redirect to a
 * signed download URL. RBAC-gated; never exposes the raw bucket.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  await requireAdmin();
  const { id, itemId } = await params;

  const [item] = await db
    .select({ stlKey: orderItems.stlKeySnapshot })
    .from(orderItems)
    .where(and(eq(orderItems.id, itemId), eq(orderItems.orderId, id)))
    .limit(1);

  if (!item?.stlKey) {
    return NextResponse.json({ error: "No STL for this item" }, { status: 404 });
  }
  if (!isStorageConfigured()) {
    return NextResponse.json(
      { error: "Storage not configured" },
      { status: 503 },
    );
  }

  const url = await readUrl(item.stlKey, 120);
  if (!url) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }
  return NextResponse.redirect(url);
}
