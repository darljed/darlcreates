import { NextResponse } from "next/server";
import { eq, and } from "drizzle-orm";
import { db } from "@/db";
import { orderItems } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { readUrl, isStorageConfigured, getObject } from "@/lib/storage";
import { getProductById } from "@/lib/catalog";
import { personalizedName } from "@/lib/name-mesh";
import { buildPrintFile } from "@/lib/name-3mf";

/**
 * Admin-only: the print-ready file for an order item. Normally a redirect to a signed download of the product's model.
 * When the product has a name slot and the customer typed a name, the file is built here instead: the original model
 * (STL or 3MF) plus the name as one more part of the same object, in a 3MF (see lib/name-3mf.ts). Rebuilt from the saved text every time, never from
 * anything the browser supplied. RBAC-gated; never exposes the raw bucket.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> },
) {
  await requireAdmin();
  const { id, itemId } = await params;

  const [item] = await db
    .select({ stlKey: orderItems.stlKeySnapshot, productId: orderItems.productId, config: orderItems.config })
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

  const product = await getProductById(item.productId);
  const personal = product ? personalizedName(product.options, (item.config ?? {}) as Record<string, { text?: string }>, item.stlKey) : null;
  if (personal) {
    const obj = await getObject(item.stlKey);
    if (!obj) return NextResponse.json({ error: "Model file not found" }, { status: 404 });
    const base = await new Response(obj.stream).arrayBuffer();
    const built = await buildPrintFile({ base, kind: personal.kind, text: personal.text, slot: personal.slot });
    if (!built.ok) return NextResponse.json({ error: built.error }, { status: 422 });
    const safe = personal.text.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "name";
    return new Response(Buffer.from(built.file), {
      headers: {
        "Content-Type": "model/3mf",
        "Content-Disposition": `attachment; filename="${itemId.slice(0, 8)}-${safe}.3mf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }

  const url = await readUrl(item.stlKey, 120);
  if (!url) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }
  return NextResponse.redirect(url);
}
