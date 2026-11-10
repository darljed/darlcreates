import { z } from "zod";

/**
 * Landing-page content (CMS). Pure: no I/O, so it is shared by the editor, the Server Action,
 * the renderer and the tests. Everything here is rendered as React text, never as HTML, and every
 * link goes through `safeHref`, so editing this content cannot inject script.
 */

/** Icons an admin can pick for a highlight. The renderer maps each name to a lucide icon. */
export const ICON_NAMES = [
  "Boxes", "Palette", "Rocket", "Sparkles", "Truck", "Heart",
  "ShieldCheck", "Star", "Zap", "Package", "Gift", "Printer",
] as const;
export type IconName = (typeof ICON_NAMES)[number];

/**
 * Allowed link targets: same-site paths ("/products"), page anchors ("#how"), https/http URLs,
 * mailto: and tel:. Rejects javascript:, data:, protocol-relative "//host" and anything else.
 */
export function isSafeHref(href: string): boolean {
  const h = href.trim();
  if (h !== href || /[\u0000-\u001f\s]/.test(h)) return false;
  if (h.startsWith("//") || h.startsWith("/\\")) return false;
  if (h.startsWith("/") || h.startsWith("#")) return true;
  return /^(https?:\/\/[^\s/]+|mailto:[^\s]+|tel:[+0-9()\-.]+)/i.test(h);
}

const href = z.string().max(300).refine(isSafeHref, "Use a path (/products), an anchor (#how), or an https:// / mailto: / tel: link");
const label = (max: number) => z.string().trim().min(1, "Required").max(max);
const text = (max: number) => z.string().trim().max(max);

/** S3 key of the optional hero image. Only the public `site/` prefix is allowed. */
export const SITE_KEY_PATTERN = /^site\/[A-Za-z0-9._-]+$/;

export const homeContentSchema = z.object({
  announcement: z.object({
    enabled: z.boolean(),
    text: text(160),
    href: href.or(z.literal("")),
  }),
  hero: z.object({
    badge: text(60),
    titleLine1: label(60),
    titleLine2: text(60),
    subtext: text(300),
    primary: z.object({ label: label(30), href }),
    secondary: z.object({ label: text(30), href: href.or(z.literal("")) }),
    imageKey: z.string().regex(SITE_KEY_PATTERN).nullable(),
    imageAlt: text(120),
  }),
  highlights: z
    .array(z.object({ icon: z.enum(ICON_NAMES), title: label(40), body: text(200) }))
    .max(6),
  featured: z.object({ enabled: z.boolean(), title: label(60), limit: z.number().int().min(1).max(8) }),
  faq: z.array(z.object({ q: label(120), a: label(600) })).max(10),
  cta: z.object({ title: label(80), label: label(30), href }),
  footer: z.object({
    text: text(160),
    links: z.array(z.object({ label: label(30), href })).max(6),
  }),
});

export type HomeContent = z.infer<typeof homeContentSchema>;

/** What the landing page showed before the CMS existed. Used until the owner saves changes. */
export const DEFAULT_HOME: HomeContent = {
  announcement: { enabled: false, text: "", href: "" },
  hero: {
    badge: "Designed & printed in the PH",
    titleLine1: "Make it yours.",
    titleLine2: "We'll print it.",
    subtext:
      "Phone stands, keychains, clickers and more. Spin them in 3D, pick your colors and text, and get a one-of-a-kind print made just for you.",
    primary: { label: "Shop the catalog", href: "/products" },
    secondary: { label: "How it works", href: "#how" },
    imageKey: null,
    imageAlt: "",
  },
  highlights: [
    { icon: "Boxes", title: "See it in 3D", body: "Rotate and zoom the real print-ready model before you buy. No surprises." },
    { icon: "Palette", title: "Customize it", body: "Choose colors, add your name or text, pick a size. Price updates live." },
    { icon: "Rocket", title: "Fast turnaround", body: "Pay via GCash, we verify, print, and ship. Track every step." },
  ],
  featured: { enabled: true, title: "Popular right now", limit: 4 },
  faq: [
    { q: "How do I pay?", a: "Pay with GCash. Send the amount, then enter your GCash reference number at checkout. We verify it and start printing." },
    { q: "How long does it take?", a: "Most items are printed and shipped within a few days of payment verification. Your order page shows each step." },
  ],
  cta: { title: "Ready to design yours?", label: "Browse products", href: "/products" },
  footer: { text: "Custom 3D-printed goods · Made in the Philippines", links: [{ label: "Privacy", href: "/privacy" }] },
};

/**
 * Parse stored JSON into content. Anything missing or invalid falls back to the default for the
 * whole document, so a bad row can never break the landing page.
 */
export function parseHomeContent(raw: unknown): HomeContent {
  const r = homeContentSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_HOME;
}
