import { listPublishedProducts } from "@/lib/catalog";
import { formatPHP } from "@/lib/money";
import { FLAT_SHIPPING_CENTS } from "@/lib/shipping";
import { absoluteUrl, clip } from "@/lib/seo";
import { getHomeContent, getSiteInfo } from "@/lib/site-content";

/**
 * /llms.txt: a plain-Markdown summary of the shop for AI assistants (what we sell, how ordering, paying and shipping
 * work, the catalog with prices, how to reach us). Built from the same data as the site, so it never drifts from it.
 * Follows the llms.txt convention: H1 name, blockquote summary, then sections of links.
 */
export async function GET() {
  const [info, home, products] = await Promise.all([getSiteInfo(), getHomeContent(), listPublishedProducts()]);
  const { store, seo } = info;
  const lines: string[] = [
    `# ${store.name}`,
    "",
    `> ${seo.description}`,
    "",
    `${store.name} is an online shop in the Philippines that prints 3D products to order. ${store.about}`.trim(),
    "",
    "## How ordering works",
    "- Pick a product, view it in 3D, and choose the options (for example color, size, name or an image).",
    "- Sign in with Google, add to cart, and check out with a delivery address.",
    "- Pay by GCash and enter the GCash reference number. The shop verifies the payment by hand, then prints and ships the item.",
    `- Shipping within the Philippines is a flat ${formatPHP(FLAT_SHIPPING_CENTS)} per order.`,
    "- Every item is printed on demand, so the order page shows each step: payment verified, in production, ready to ship, shipped, delivered.",
    "",
    "## Shop",
    ...(products.length
      ? products.map((p) => `- [${p.name}](${absoluteUrl(`/products/${p.slug}`)}): ${clip(p.description || p.category, 140)} From ${formatPHP(p.basePriceCents)}.`)
      : ["- The catalog is being updated. See the shop page for what is available."]),
    "",
    "## Pages",
    `- [Shop](${absoluteUrl("/products")}): all products`,
    `- [Privacy Policy](${absoluteUrl("/privacy")})`,
    `- [Terms and Conditions](${absoluteUrl("/terms")})`,
    "",
    ...(home.faq.length ? ["## Frequently asked questions", ...home.faq.flatMap((f) => [`### ${f.q}`, f.a, ""])] : []),
    "## Contact",
    ...[
      store.email && `- Email: ${store.email}`,
      store.phone && `- Phone: ${store.phone}`,
      store.address && `- Location: ${store.address}`,
      store.hours && `- Hours: ${store.hours}`,
    ].filter((l): l is string => !!l),
    "",
  ];
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
  });
}
