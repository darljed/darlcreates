/**
 * Embeds schema.org JSON-LD for search engines and AI answer engines. The JSON is escaped by `jsonLd()` so data from
 * the database (product names, FAQ text) can never break out of the script tag.
 */
import { jsonLd } from "@/lib/seo";

export function JsonLd({ data }: { data: unknown }) {
  if (!data) return null;
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(data) }} />;
}
