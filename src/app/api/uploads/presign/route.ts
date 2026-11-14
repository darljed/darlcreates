import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { buildKey, isStorageConfigured, presignUpload } from "@/lib/storage";
import { ADMIN_ONLY_KINDS, storedContentType, validateUpload } from "@/lib/uploads";

const bodySchema = z.object({
  kind: z.enum(["model", "photo", "site", "customer"]),
  filename: z.string().min(1).max(200),
  contentType: z.string().max(100).default(""),
  size: z.number().int().positive(),
});

/**
 * ponytail: in-memory sliding window, per server instance. Caps how many upload URLs one
 * signed-in user can mint (storage cost / abuse). On serverless each instance has its own map,
 * so this is a speed bump, not a guarantee. Upgrade path: a DB/Redis counter.
 */
const WINDOW_MS = 60 * 60 * 1000;
const MAX_PER_WINDOW = 30;
const hits = new Map<string, number[]>();
function rateLimited(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(userId, recent);
    return true;
  }
  recent.push(now);
  hits.set(userId, recent);
  return false;
}

/**
 * Returns a short-lived presigned PUT URL for a direct browser upload.
 * - kind "model" | "photo": admin only (catalog files).
 * - kind "customer": any signed-in user (personalization artwork), stored under customer/<userId>/.
 */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { kind, filename, contentType, size } = parsed.data;

  if (ADMIN_ONLY_KINDS.includes(kind) && !isAdmin(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const problem = validateUpload(kind, filename, contentType, size);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });
  }
  if (kind === "customer" && !isAdmin(user) && rateLimited(user.id)) {
    return NextResponse.json({ error: "Too many uploads. Please try again later." }, { status: 429 });
  }

  const key = buildKey(kind, filename, kind === "customer" ? user.id : undefined);
  const type = storedContentType(kind, filename, contentType);
  const url = await presignUpload(key, type, 300);
  return NextResponse.json({ url, key, contentType: type });
}
