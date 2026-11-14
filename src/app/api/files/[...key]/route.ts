import { NextResponse } from "next/server";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { isPublishedFile } from "@/lib/files";
import { getObject, isStorageConfigured, readUrl } from "@/lib/storage";

/**
 * Stable URL for catalog files. Resolves a fresh short-lived signed S3 URL on
 * every request, so cached pages never hold an expired link (gap G-03).
 * Public only for photos/STL of PUBLISHED products; admins can read any
 * photos/, stl/, models/ or site/ object (e.g. drafts). site/ images are streamed with an immutable cache. customer/ and proof/ are never served here.
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

  if (!/^(photos|stl|models|site)\/[A-Za-z0-9._-]+$/.test(key)) {
    return new NextResponse(null, { status: 404 });
  }
  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const published = await isPublishedFile(key);
  const allowed = published || isAdmin(await getCurrentUser());
  if (!allowed) return new NextResponse(null, { status: 404 });

  // Brand/hero images (site/) are small, shown on every page and keyed by a unique name, so stream them
  // from here with a long cache instead of bouncing every visitor to S3. An unsaved preview (admin only,
  // not yet published) is never cached.
  if (key.startsWith("site/")) {
    const obj = await getObject(key);
    if (!obj) return new NextResponse(null, { status: 404 });
    const type = /^image\/(png|jpeg|webp)$/.test(obj.contentType) ? obj.contentType : "application/octet-stream";
    return new Response(obj.stream, {
      headers: {
        "Content-Type": type,
        ...(obj.length ? { "Content-Length": String(obj.length) } : {}),
        "Cache-Control": published ? "public, max-age=31536000, immutable" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  }

  const url = await readUrl(key, 300);
  if (!url) return new NextResponse(null, { status: 404 });

  return NextResponse.redirect(url, {
    status: 302,
    headers: { "Cache-Control": "private, max-age=240" },
  });
}
