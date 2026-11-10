import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { isPublishedFile } from "@/lib/files";
import { isStorageConfigured, readUrl } from "@/lib/storage";

/**
 * Stable URL for catalog files. Resolves a fresh short-lived signed S3 URL on
 * every request, so cached pages never hold an expired link (gap G-03).
 * Public only for photos/STL of PUBLISHED products; admins can read any
 * photos/, stl/ or models/ object (e.g. drafts). customer/ and proof/ are never served here.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key: parts } = await params;
  let key: string;
  try {
    key = parts.map(decodeURIComponent).join("/");
  } catch {
    return new NextResponse(null, { status: 404 });
  }

  if (!/^(photos|stl|models)\/[A-Za-z0-9._-]+$/.test(key)) {
    return new NextResponse(null, { status: 404 });
  }
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const allowed = (await isPublishedFile(key)) || isAdmin(await getCurrentUser());
  if (!allowed) return new NextResponse(null, { status: 404 });

  const url = await readUrl(key, 300);
  if (!url) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=240" },
  });
}
