import { cacheLife, cacheTag } from "next/cache";
import { loadHomeContent, loadLegal, loadSiteInfo } from "./site-content-store";
import type { LegalSlug } from "./site-content-schema";

export const HOME_TAG = "site:home";
export const SITE_TAG = "site:info";
export const legalTag = (slug: LegalSlug) => `site:legal:${slug}`;

/** Landing-page content. Cached; the admin save revalidates `site:home`. */
export async function getHomeContent() {
  "use cache";
  cacheLife("hours");
  cacheTag(HOME_TAG);
  return loadHomeContent();
}

/** Store details + footer links shown on every storefront page. */
export async function getSiteInfo() {
  "use cache";
  cacheLife("hours");
  cacheTag(SITE_TAG);
  return loadSiteInfo();
}

export async function getLegal(slug: LegalSlug) {
  "use cache";
  cacheLife("hours");
  cacheTag(legalTag(slug));
  return loadLegal(slug);
}

/** The privacy policy version customers must have accepted. Changes only when the owner asks. */
export async function getPrivacyVersion(): Promise<string> {
  return (await getLegal("privacy")).version;
}
