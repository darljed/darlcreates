import type { MetadataRoute } from "next";
import { listPublishedProducts } from "@/lib/catalog";
import { absoluteUrl } from "@/lib/seo";

/** sitemap.xml: home, shop, the two legal pages and every published product (last edit as `lastModified`). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await listPublishedProducts();
  return [
    { url: absoluteUrl("/"), changeFrequency: "weekly", priority: 1 },
    { url: absoluteUrl("/products"), changeFrequency: "daily", priority: 0.9 },
    ...products.map((p) => ({
      url: absoluteUrl(`/products/${p.slug}`),
      lastModified: new Date(p.updatedAtMs),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/terms"), changeFrequency: "yearly", priority: 0.2 },
  ];
}
