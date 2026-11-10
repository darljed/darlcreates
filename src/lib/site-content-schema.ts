import { z } from "zod";

/**
 * Owner-editable site content (CMS): landing page, store info + footer, privacy policy, terms. Pure: no I/O, so it is shared by the editor, the Server Action,
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
      "Your 3D printing partner for everyday finds and one-of-a-kind ideas. Spin them in 3D, pick your colors and text, and we print it just for you.",
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
  featured: { enabled: true, title: "New in the shop", limit: 4 },
  faq: [
    { q: "How do I pay?", a: "Pay with GCash. Send the amount, then enter your GCash reference number at checkout. We verify it and start printing." },
    { q: "How long does it take?", a: "Most items are printed and shipped within a few days of payment verification. Your order page shows each step." },
  ],
  cta: { title: "Ready to design yours?", label: "Browse products", href: "/products" },
};

/**
 * Parse stored JSON into content. Anything missing or invalid falls back to the default for the
 * whole document, so a bad row can never break the landing page.
 */
export function parseHomeContent(raw: unknown): HomeContent {
  const r = homeContentSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_HOME;
}


// ---------------------------------------------------------------------------
// Store info + footer ("site" document)
// ---------------------------------------------------------------------------

export const siteInfoSchema = z.object({
  store: z.object({
    name: label(60),
    tagline: text(120),
    about: text(300),
    email: z.string().trim().max(120).email().or(z.literal("")),
    phone: text(40),
    address: text(200),
    hours: text(120),
  }),
  /** "Explore" column. The Privacy Policy and Terms links are always added by the footer itself. */
  links: z.array(z.object({ label: label(30), href })).max(8),
  social: z.array(z.object({ label: label(30), href })).max(6),
  note: text(160),
});
export type SiteInfo = z.infer<typeof siteInfoSchema>;

export const DEFAULT_SITE_INFO: SiteInfo = {
  store: {
    name: "Darl Creates",
    tagline: "Your 3D printing partner",
    about:
      "From a sketch in your head to a thing in your hand. Pick a design, make it yours, and we print it layer by layer, right here in the Philippines.",
    email: "darljedmatundan@gmail.com",
    phone: "",
    address: "Philippines",
    hours: "",
  },
  links: [
    { label: "Shop", href: "/products" },
    { label: "My orders", href: "/orders" },
    { label: "Cart", href: "/cart" },
  ],
  social: [],
  note: "",
};

export function parseSiteInfo(raw: unknown): SiteInfo {
  const r = siteInfoSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_SITE_INFO;
}

/** Link target for a phone number, or null if it doesn't look like one (shown as plain text then). */
export function telHref(phone: string): string | null {
  const p = phone.trim();
  return /^\+?[0-9][0-9\s()-]{5,}$/.test(p) ? `tel:${p.replace(/[^+0-9]/g, "")}` : null;
}

// ---------------------------------------------------------------------------
// Legal pages ("legal:privacy", "legal:terms" documents)
// ---------------------------------------------------------------------------

export const LEGAL_SLUGS = ["privacy", "terms"] as const;
export type LegalSlug = (typeof LEGAL_SLUGS)[number];

export const legalDocSchema = z.object({
  title: label(80),
  /** Free text shown under the title, e.g. "Effective 10 November 2026". */
  effective: text(60),
  body: z.string().trim().min(1, "Required").max(20000),
  /**
   * Privacy policy only: customers must have accepted THIS version. Saving with "ask everyone to
   * accept again" ticked sets a new one, which sends every customer to /consent once.
   */
  version: z.string().trim().min(1).max(40),
});
export type LegalDoc = z.infer<typeof legalDocSchema>;

/** Version stamp used before the owner ever edits the policy (kept for existing consent records). */
export const DEFAULT_PRIVACY_VERSION = "2026-11-10";

export const DEFAULT_LEGAL: Record<LegalSlug, LegalDoc> = {
  privacy: {
    title: "Privacy Policy",
    effective: "Effective 10 November 2026",
    version: DEFAULT_PRIVACY_VERSION,
    body: `Darl Creates respects your privacy and handles personal data in line with the Philippine Data Privacy Act of 2012 (RA 10173).

## What we collect
Your name and email (from Google sign-in), shipping address and mobile number for delivery, order and payment details (including the GCash reference number you submit), and any images you upload to customize a product.

## How we use it
To process and deliver your orders, verify GCash payments, send you order updates, and provide customer support. We do not sell your data.

## Payments
GCash payments are verified manually against the reference number you provide. We start production once your payment is confirmed.

## Your rights
You can download a copy of your data and delete your account yourself from your Account page. Deleting removes your name, email, saved addresses, reviews and uploaded images and signs you out; order and payment records are kept for our business records but are no longer linked to your personal details. Orders still in progress must be completed or cancelled first.

For anything else, email [darljedmatundan@gmail.com](mailto:darljedmatundan@gmail.com) and we will act on your request.

## Retention and security
We keep order records for legitimate business record-keeping and protect your data with access controls and encryption in transit.`,
  },
  terms: {
    title: "Terms and Conditions",
    effective: "Effective 10 November 2026",
    version: DEFAULT_PRIVACY_VERSION,
    body: `These terms apply to orders placed on this website. By placing an order you agree to them.

## Made to order
Every item is 3D-printed after you order. Colors, finish and dimensions can vary slightly from the on-screen preview because of the printing process and your screen.

## Prices and payment
Prices are in Philippine pesos. We accept GCash. After you send the payment, enter the GCash reference number on your order page. We verify it manually and start production once it is confirmed. An order that is not paid stays unpaid and is not produced.

## Production and shipping
We print and pack your order after payment is verified. Timelines we give are estimates, not guarantees. Shipping is a flat fee shown at checkout. You are responsible for giving a correct and complete delivery address.

## Cancellations and refunds
You can cancel an order yourself while it is still awaiting payment. Once payment has been sent, contact us as early as possible. Because items are made to order, we may not be able to cancel or refund an order after production has started, except as described below.

## Damaged or wrong items
If your item arrives damaged, defective or not as ordered, contact us promptly with clear photos and your order number. We will reprint or replace it, or refund you, depending on the case.

## Images and text you provide
When you upload an image or enter text to personalize an item, you confirm that you have the right to use it. We may refuse or cancel an order with content that is unlawful, infringing or offensive, and will refund any payment already made for it.

## Order confirmation
Every order has an Order Acknowledgment on your order page. It lists what you ordered, the amounts and the delivery address, and you can print it or save it as a PDF.

## Your data
How we handle your personal information is explained in our [Privacy Policy](/privacy).

## Changes to these terms
We may update these terms. The version that applies to an order is the one shown when you placed it.

## Contact
Questions? Email [darljedmatundan@gmail.com](mailto:darljedmatundan@gmail.com).`,
  },
};

export function parseLegal(slug: LegalSlug, raw: unknown): LegalDoc {
  const r = legalDocSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_LEGAL[slug];
}

// ---- tiny, safe text format for legal pages (no HTML ever) ----
export type Inline = { text: string; href?: string };
export type Block =
  | { type: "h2"; text: string }
  | { type: "p"; parts: Inline[] }
  | { type: "ul"; items: Inline[][] };

/** "[label](url)" becomes a link only if the url passes `isSafeHref`; otherwise it stays plain text. */
export function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  const re = /\[([^\]\n]{1,200})\]\(([^)\s]{1,300})\)/g;
  let last = 0;
  for (let m = re.exec(line); m; m = re.exec(line)) {
    if (m.index > last) out.push({ text: line.slice(last, m.index) });
    out.push(isSafeHref(m[2]) ? { text: m[1], href: m[2] } : { text: m[0] });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last) });
  return out;
}

/**
 * Blocks are separated by a blank line. A line starting "## " is a heading (its own block, even when the
 * text follows on the very next line); a run of lines that all start with "- " is a bullet list; any other
 * run of lines is a paragraph (single line breaks are kept).
 */
export function parseLegalBody(body: string): Block[] {
  const out: Block[] = [];
  for (const chunk of body.replace(/\r\n?/g, "\n").split(/\n{2,}/)) {
    let run: string[] = [];
    const flush = () => {
      if (!run.length) return;
      out.push(
        run.every((l) => l.startsWith("- "))
          ? { type: "ul", items: run.map((l) => parseInline(l.slice(2))) }
          : { type: "p", parts: parseInline(run.join("\n")) },
      );
      run = [];
    };
    for (const raw of chunk.trim().split("\n")) {
      const line = raw.trimEnd();
      if (!line.trim()) continue;
      if (line.startsWith("## ")) {
        flush();
        out.push({ type: "h2", text: line.slice(3).trim() });
      } else run.push(line);
    }
    flush();
  }
  return out;
}
