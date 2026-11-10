import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteContent } from "@/db/schema";
import {
  DEFAULT_HOME,
  DEFAULT_SITE_INFO,
  homeContentSchema,
  legalDocSchema,
  parseHomeContent,
  parseLegal,
  parseSiteInfo,
  siteInfoSchema,
  type HomeContent,
  type LegalDoc,
  type LegalSlug,
  type SiteInfo,
} from "./site-content-schema";
import { z } from "zod";

/**
 * Framework-free DB access for owner-edited site content (usable from scripts and tests).
 * One row per document in `site_content`: "home" (landing page), "site" (store info + footer),
 * "legal:privacy", "legal:terms". Every read re-validates and falls back to the built-in default.
 */
export const HOME_KEY = "home";
export const SITE_KEY = "site";
export const legalKey = (slug: LegalSlug) => `legal:${slug}`;

async function loadRaw(key: string): Promise<unknown> {
  const [row] = await db.select({ data: siteContent.data }).from(siteContent).where(eq(siteContent.key, key)).limit(1);
  return row?.data;
}

async function upsert(key: string, data: unknown, userId: string | null) {
  await db
    .insert(siteContent)
    .values({ key, data, updatedBy: userId })
    .onConflictDoUpdate({ target: siteContent.key, set: { data, updatedAt: new Date(), updatedBy: userId } });
}

export async function resetContent(key: string): Promise<void> {
  await db.delete(siteContent).where(eq(siteContent.key, key));
}

// ---- landing page ----
export async function loadHomeContent(key = HOME_KEY): Promise<HomeContent> {
  const raw = await loadRaw(key);
  return raw === undefined ? DEFAULT_HOME : parseHomeContent(raw);
}

/** Validate and upsert. Throws on invalid input (callers should have parsed already). */
export async function saveHomeContent(input: unknown, userId: string | null, key = HOME_KEY): Promise<HomeContent> {
  const data = homeContentSchema.parse(input);
  await upsert(key, data, userId);
  return data;
}

export const resetHomeContent = (key = HOME_KEY) => resetContent(key);

// ---- store info + footer ----
export async function loadSiteInfo(key = SITE_KEY): Promise<SiteInfo> {
  const raw = await loadRaw(key);
  return raw === undefined ? DEFAULT_SITE_INFO : parseSiteInfo(raw);
}

export async function saveSiteInfo(input: unknown, userId: string | null, key = SITE_KEY): Promise<SiteInfo> {
  const data = siteInfoSchema.parse(input);
  await upsert(key, data, userId);
  return data;
}

// ---- legal pages ----
/** What the editor sends. The version is decided here, never by the browser. */
export const legalEditSchema = legalDocSchema.omit({ version: true });
export type LegalEdit = z.infer<typeof legalEditSchema>;

export async function loadLegal(slug: LegalSlug, key = legalKey(slug)): Promise<LegalDoc> {
  const raw = await loadRaw(key);
  return raw === undefined ? parseLegal(slug, undefined) : parseLegal(slug, raw);
}

/**
 * Save a legal page. The version only changes when `askAgain` is true (a fresh timestamp), so a typo fix
 * doesn't force every customer through /consent again. The version only matters for the privacy policy.
 */
export async function saveLegal(
  slug: LegalSlug,
  input: unknown,
  userId: string | null,
  askAgain = false,
  key = legalKey(slug),
): Promise<LegalDoc> {
  const edit = legalEditSchema.parse(input);
  const current = await loadLegal(slug, key);
  const data: LegalDoc = { ...edit, version: askAgain ? new Date().toISOString() : current.version };
  await upsert(key, data, userId);
  return data;
}
