"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { requireAdmin } from "@/lib/session";
import { z } from "zod";
import { LEGAL_SLUGS, homeContentSchema, siteInfoSchema } from "@/lib/site-content-schema";
import { BRAND_TAG, HOME_TAG, SITE_TAG, legalTag } from "@/lib/site-content";
import { LOGO_SLOTS, brandingKeys, brandingSchema, type Branding } from "@/lib/branding-schema";
import { verifyLogoUpload } from "@/lib/branding-verify";
import {
  legalEditSchema,
  BRAND_KEY,
  legalKey,
  loadBranding,
  loadHomeContent,
  resetContent,
  resetHomeContent,
  saveHomeContent,
  saveBranding,
  saveLegal,
  saveSiteInfo,
  SITE_KEY,
} from "@/lib/site-content-store";
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
  } catch (err) {
    // An orphaned object is harmless, so never fail the save, but don't hide it either.
    console.error(`[content] could not delete ${key}:`, (err as Error).message);
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

// ---------------------------------------------------------------------------
// Store info + footer
// ---------------------------------------------------------------------------

function firstIssue(err: z.ZodError): string {
  const issue = err.issues[0];
  return `${issue.path.join(" › ") || "Content"}: ${issue.message}`;
}

export async function saveSiteInfoAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = siteInfoSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  await saveSiteInfo(parsed.data, admin.id);
  revalidateTag(SITE_TAG, "max");
  revalidatePath("/", "layout"); // the footer is on every storefront page
  return { ok: true };
}

export async function resetSiteInfoAction(): Promise<Result> {
  await requireAdmin();
  await resetContent(SITE_KEY);
  revalidateTag(SITE_TAG, "max");
  revalidatePath("/", "layout");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Legal pages (privacy policy, terms)
// ---------------------------------------------------------------------------

const legalActionSchema = legalEditSchema.extend({
  slug: z.enum(LEGAL_SLUGS),
  /** Privacy policy only: make every customer accept the new text once. */
  askAgain: z.boolean().optional().default(false),
});

export async function saveLegalAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = legalActionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };
  const { slug, askAgain, ...edit } = parsed.data;
  await saveLegal(slug, edit, admin.id, slug === "privacy" && askAgain);
  revalidateTag(legalTag(slug), "max");
  revalidatePath(`/${slug}`);
  revalidatePath("/admin/legal");
  return { ok: true };
}

export async function resetLegalAction(input: unknown): Promise<Result> {
  await requireAdmin();
  const parsed = z.object({ slug: z.enum(LEGAL_SLUGS) }).safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request" };
  await resetContent(legalKey(parsed.data.slug));
  revalidateTag(legalTag(parsed.data.slug), "max");
  revalidatePath(`/${parsed.data.slug}`);
  revalidatePath("/admin/legal");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Logos & branding
// ---------------------------------------------------------------------------

function invalidateBrand() {
  revalidateTag(BRAND_TAG, "max");
  revalidatePath("/", "layout"); // logo is in the header/footer of every page; icons are in <head>
}

/**
 * The browser sends which file each slot should use; the server re-checks every NEW file (exists, real image,
 * size, shape, type) and stores the dimensions it read itself. Files no longer referenced are deleted.
 */
export async function saveBrandingAction(input: unknown): Promise<Result> {
  const admin = await requireAdmin();
  const parsed = brandingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstIssue(parsed.error) };

  const before = await loadBranding();
  const next: Branding = structuredClone(before);
  for (const slot of LOGO_SLOTS) {
    const want = parsed.data.logos[slot];
    if (!want) next.logos[slot] = null;
    else if (before.logos[slot]?.key === want.key) next.logos[slot] = before.logos[slot];
    else {
      const v = await verifyLogoUpload(slot, want.key);
      if (!v.ok) return { ok: false, error: v.error };
      next.logos[slot] = v.asset;
    }
  }

  await saveBranding(next, admin.id);
  const keep = new Set(brandingKeys(next));
  for (const k of brandingKeys(before)) if (!keep.has(k)) await dropImage(k);
  invalidateBrand();
  return { ok: true };
}

/** Back to the built-in logos. */
export async function resetBrandingAction(): Promise<Result> {
  await requireAdmin();
  const before = await loadBranding();
  await resetContent(BRAND_KEY);
  for (const k of brandingKeys(before)) await dropImage(k);
  invalidateBrand();
  return { ok: true };
}
