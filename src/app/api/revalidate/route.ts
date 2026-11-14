import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

/**
 * Lets our own scripts (seed-demo, e2e-session) drop cached storefront data after changing the database
 * directly, so the site never keeps showing a product that no longer exists. The admin UI doesn't need this:
 * its Server Actions revalidate themselves.
 *
 * Disabled (404) unless REVALIDATE_SECRET is set. Only well-formed content tags are accepted.
 */
const TAG = /^(products|product:[a-z0-9-]{1,80}|reviews:[0-9a-f-]{36}|site:[a-z:]{1,30})$/;
const body = z.object({ tags: z.array(z.string().regex(TAG)).min(1).max(100) });

function sameSecret(given: string | null, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given), b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) return new NextResponse(null, { status: 404 });
  if (!sameSecret(req.headers.get("x-revalidate-secret"), secret)) return new NextResponse(null, { status: 401 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid tags" }, { status: 400 });

  // not a Server Action, so updateTag is unavailable: { expire: 0 } makes the next request wait for fresh data
  for (const tag of parsed.data.tags) revalidateTag(tag, { expire: 0 });
  return NextResponse.json({ ok: true, revalidated: parsed.data.tags.length });
}
