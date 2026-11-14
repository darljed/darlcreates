import type { MetadataRoute } from "next";
import { absoluteUrl, ANSWER_ENGINE_BOTS, PRIVATE_PATHS } from "@/lib/seo";

/**
 * robots.txt. Public pages are open to search engines and AI answer engines (so the shop can be found and quoted);
 * admin, account, cart, checkout and API routes are not. Product photos are served from /api/files, which stays
 * crawlable so images can be indexed and shown in previews.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: ["*", ...ANSWER_ENGINE_BOTS],
        allow: ["/", "/api/files/"],
        disallow: [...PRIVATE_PATHS],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
