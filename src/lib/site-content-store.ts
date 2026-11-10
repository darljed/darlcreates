import { eq } from "drizzle-orm";
import { db } from "@/db";
import { siteContent } from "@/db/schema";
import { DEFAULT_HOME, homeContentSchema, parseHomeContent, type HomeContent } from "./site-content-schema";

/** Framework-free DB access for site content (usable from scripts and tests). */
export const HOME_KEY = "home";

/** Stored content, or the defaults when nothing was saved yet or the row is invalid. */
export async function loadHomeContent(key = HOME_KEY): Promise<HomeContent> {
  const [row] = await db.select({ data: siteContent.data }).from(siteContent).where(eq(siteContent.key, key)).limit(1);
  return row ? parseHomeContent(row.data) : DEFAULT_HOME;
}

/** Validate and upsert. Throws on invalid input (callers should have parsed already). */
export async function saveHomeContent(input: unknown, userId: string | null, key = HOME_KEY): Promise<HomeContent> {
  const data = homeContentSchema.parse(input);
  await db
    .insert(siteContent)
    .values({ key, data, updatedBy: userId })
    .onConflictDoUpdate({ target: siteContent.key, set: { data, updatedAt: new Date(), updatedBy: userId } });
  return data;
}

/** Remove the saved row so the page falls back to the defaults ("reset"). */
export async function resetHomeContent(key = HOME_KEY): Promise<void> {
  await db.delete(siteContent).where(eq(siteContent.key, key));
}
