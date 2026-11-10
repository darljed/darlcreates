import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser, isAdmin } from "@/lib/session";
import { buildKey, isStorageConfigured, presignUpload } from "@/lib/storage";
import { storedContentType, validateUpload } from "@/lib/uploads";

const bodySchema = z.object({
  kind: z.enum(["stl", "photo"]),
  filename: z.string().min(1).max(200),
  contentType: z.string().max(100).default(""),
  size: z.number().int().positive(),
});

/** Admin-only: returns a short-lived presigned PUT URL for a direct browser upload. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const { kind, filename, contentType, size } = parsed.data;

  const problem = validateUpload(kind, filename, contentType, size);
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  if (!isStorageConfigured()) {
    return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });
  }

  const key = buildKey(kind, filename);
  const type = storedContentType(kind, contentType);
  const url = await presignUpload(key, type, 300);
  return NextResponse.json({ url, key, contentType: type });
}
