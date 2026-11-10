"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { homeContentSchema } from "@/lib/site-content-schema";
import { HOME_TAG } from "@/lib/site-content";
import { loadHomeContent, resetHomeContent, saveHomeContent } from "@/lib/site-content-store";
import { deleteObject, headObject, isStorageConfigured, peekBytes } from "@/lib/storage";
import { UPLOAD_RULES, sniffImageType } from "@/lib/uploads";

type Result = { ok: true } | { ok: false; error: string };

function invalidate() {
  revalidateTag(HOME_TAG, "max");
  revalidatePath("/");
  revalidatePath("/admin/content");
}

/** Best-effort delete of a replaced hero image; a leftover object is harmless, so never fail the save. */
async function dropImage(key: string | null) {
  if (!key || !isStorageConfigured()) return;
  try {
    await deleteObject(key);
  } catch {
    /* orphaned object, ignored */
  }
}

export async function saveHomeContentAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = homeContentSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(" › ") || "Content"}: ${issue.message}` };
  }

  const before = await loadHomeContent();
  const newKey = parsed.data.hero.imageKey;
  // A newly chosen image must really exist, fit the size limit and be a real image.
  if (newKey && newKey !== before.hero.imageKey) {
    if (!isStorageConfigured()) return { ok: false, error: "Storage is not configured" };
    const size = await headObject(newKey);
    if (size === null) return { ok: false, error: "Uploaded image not found. Upload it again." };
    if (size > UPLOAD_RULES.site.maxBytes) {
      await dropImage(newKey);
      return { ok: false, error: "Image is too large (max 5 MB)." };
    }
    if (!sniffImageType(await peekBytes(newKey, 12))) {
      await dropImage(newKey);
      return { ok: false, error: "That file isn't a JPEG, PNG or WebP image." };
    }
  }

  await saveHomeContent(parsed.data, admin.id);
  if (before.hero.imageKey && before.hero.imageKey !== newKey) await dropImage(before.hero.imageKey);
  invalidate();
  return { ok: true };
}

/** Restore the built-in defaults. */
export async function resetHomeContentAction(): Promise<Result> {
  await requireAdmin();
  const before = await loadHomeContent();
  await resetHomeContent();
  await dropImage(before.hero.imageKey);
  invalidate();
  return { ok: true };
}
