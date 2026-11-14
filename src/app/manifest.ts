import type { MetadataRoute } from "next";
import { fileUrl } from "@/lib/storage-url";
import { getBranding, getSiteInfo } from "@/lib/site-content";

/**
 * Web app manifest (makes the site installable). Name and description follow Admin → Store & footer. The home-screen
 * icon is the owner's uploaded browser-tab icon when it is at least 512 px (so the installed app matches their
 * brand); otherwise the built-in 192/512 and maskable icons are used.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const [{ store, seo }, { logos }] = await Promise.all([getSiteInfo(), getBranding()]);
  const up = logos.favicon && logos.favicon.width >= 512 ? logos.favicon : null;
  const icons: MetadataRoute.Manifest["icons"] = up
    ? [{ src: fileUrl(up.key)!, sizes: `${up.width}x${up.height}`, type: up.key.endsWith(".webp") ? "image/webp" : "image/png", purpose: "any" }]
    : [
        { src: "/brand/pwa-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
        { src: "/brand/pwa-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        { src: "/brand/pwa-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ];
  return {
    id: "/",
    name: store.name,
    short_name: store.name.length > 12 ? store.name.slice(0, 12).trim() : store.name,
    description: seo.description,
    lang: "en-PH",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#fdfdf9",
    theme_color: "#0077a5",
    categories: ["shopping"],
    icons,
    shortcuts: [
      { name: "Shop", url: "/products" },
      { name: "My orders", url: "/orders" },
      { name: "Cart", url: "/cart" },
    ],
  };
}
