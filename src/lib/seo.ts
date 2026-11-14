/**
 * Search (SEO) and answer-engine (AEO) helpers. Pure: no I/O, so pages, sitemap, robots, llms.txt and tests share
 * them. Builds absolute URLs, page metadata, and schema.org JSON-LD (Organization, WebSite, Product with price and
 * rating, BreadcrumbList, FAQPage, ItemList). Everything comes from data the owner already edits (store info, FAQ,
 * products), so the markup never says anything the page itself doesn't.
 */
import type { Metadata } from "next";
import type { SiteInfo } from "./site-content-schema";

/** Public origin of the site (no trailing slash). Same value the auth system uses. */
export function siteUrl(): string {
  return (process.env.BETTER_AUTH_URL ?? "http://localhost:3001").replace(/\/+$/, "");
}

/** `/products/x` -> `https://host/products/x`. Already-absolute URLs pass through. */
export function absoluteUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${siteUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Collapse whitespace and cut at a word boundary with an ellipsis, for meta descriptions (about 155 characters). */
export function clip(text: string, max = 155): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max * 0.6 ? cut.slice(0, at) : cut).replace(/[\s,.;:!-]+$/, "")}…`;
}

/** JSON for a `<script type="application/ld+json">`: `<` is escaped so the data can never close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c").replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

/** Title, description, canonical, Open Graph and Twitter in one place so every page is consistent. */
export function pageMetadata(o: {
  title: string;
  description: string;
  path: string;
  image?: { url: string; width?: number; height?: number; alt?: string } | null;
  noindex?: boolean;
  type?: "website" | "article";
  /** Use the title exactly as given (the home page), instead of adding " · Store name" to it. */
  absoluteTitle?: boolean;
}): Metadata {
  const description = clip(o.description, 160);
  return {
    title: o.absoluteTitle ? { absolute: o.title } : o.title,
    description,
    alternates: { canonical: o.path },
    robots: o.noindex ? { index: false, follow: false } : undefined,
    openGraph: {
      type: o.type ?? "website",
      url: o.path,
      title: o.title,
      description,
      ...(o.image ? { images: [{ url: o.image.url, width: o.image.width, height: o.image.height, alt: o.image.alt ?? o.title }] } : {}),
    },
    twitter: { title: o.title, description, ...(o.image ? { card: "summary_large_image", images: [o.image.url] } : {}) },
  };
}

/** Private or per-user pages: keep them out of search results and AI indexes. */
export const NOINDEX: Metadata = { robots: { index: false, follow: false } };

const httpsOnly = (u: string) => (/^https:\/\//i.test(u) ? u : null);

export function organizationLd(info: SiteInfo, logoUrl?: string | null) {
  const { store } = info;
  const sameAs = info.social.map((s) => httpsOnly(s.href)).filter((u): u is string => !!u);
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${siteUrl()}/#organization`,
    name: store.name,
    url: siteUrl(),
    slogan: store.tagline || undefined,
    description: store.about || undefined,
    ...(logoUrl ? { logo: absoluteUrl(logoUrl) } : {}),
    email: store.email || undefined,
    telephone: store.phone || undefined,
    address: store.address ? { "@type": "PostalAddress", streetAddress: store.address, addressCountry: "PH" } : undefined,
    areaServed: { "@type": "Country", name: "Philippines" },
    ...(sameAs.length ? { sameAs } : {}),
  };
}

export function websiteLd(info: SiteInfo) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteUrl()}/#website`,
    url: siteUrl(),
    name: info.store.name,
    inLanguage: "en-PH",
    publisher: { "@id": `${siteUrl()}/#organization` },
  };
}

export function breadcrumbLd(items: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((it, i) => ({ "@type": "ListItem", position: i + 1, name: it.name, item: absoluteUrl(it.path) })),
  };
}

/** FAQ markup for the same questions shown on the page. Null when there are none. */
export function faqLd(faq: { q: string; a: string }[]) {
  if (faq.length === 0) return null;
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
}

export function itemListLd(items: { name: string; slug: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: items.map((p, i) => ({ "@type": "ListItem", position: i + 1, url: absoluteUrl(`/products/${p.slug}`), name: p.name })),
  };
}

/**
 * Product with a price in PHP. The price is the base ("starting at") price; options add to it. Rating is included only
 * when there is at least one approved review, as search engines require.
 */
export function productLd(
  p: { name: string; slug: string; description: string; category: string; basePriceCents: number },
  o: { storeName: string; imageUrls: string[]; rating?: { average: number; count: number } | null },
) {
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${absoluteUrl(`/products/${p.slug}`)}#product`,
    name: p.name,
    description: p.description || undefined,
    sku: p.slug,
    category: p.category,
    url: absoluteUrl(`/products/${p.slug}`),
    ...(o.imageUrls.length ? { image: o.imageUrls.map(absoluteUrl) } : {}),
    brand: { "@type": "Brand", name: o.storeName },
    offers: {
      "@type": "Offer",
      url: absoluteUrl(`/products/${p.slug}`),
      priceCurrency: "PHP",
      price: (p.basePriceCents / 100).toFixed(2),
      // printed on demand, so it can always be ordered
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${siteUrl()}/#organization` },
    },
    ...(o.rating && o.rating.count > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(o.rating.average.toFixed(1)), reviewCount: o.rating.count, bestRating: 5, worstRating: 1 } }
      : {}),
  };
}

/**
 * Crawlers that fetch pages to answer people's questions or build search indexes. They are allowed on public pages
 * (and kept out of private ones) so the shop can be found and quoted. Listed explicitly in robots.txt for clarity.
 */
export const ANSWER_ENGINE_BOTS = [
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "PerplexityBot",
  "Perplexity-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "Google-Extended",
  "Applebot",
  "Applebot-Extended",
  "Bingbot",
  "DuckDuckBot",
] as const;

/** Paths that are private, per-user or have no search value. */
export const PRIVATE_PATHS = ["/admin", "/api/", "/account", "/orders", "/cart", "/checkout", "/sign-in", "/consent"] as const;
