import { cacheLife, cacheTag } from "next/cache";
import { loadHomeContent } from "./site-content-store";

export const HOME_TAG = "site:home";

/** Landing-page + footer content. Cached; the admin save revalidates `site:home`. */
export async function getHomeContent() {
  "use cache";
  cacheLife("hours");
  cacheTag(HOME_TAG);
  return loadHomeContent();
}
