/**
 * Logos and brand images the owner can upload. Pure (no I/O): each slot lists where it is used, the size to supply
 * and the rules the server enforces.
 */
import { z } from "zod";

export type ImageType = "png" | "jpeg" | "webp";

/**
 * Logos and brand images the owner can upload. Pure (no I/O): shared by the editor, the Server Action and the
 * tests. Every slot lists where it is used, what size to supply and the hard rules the server enforces.
 *
 * Raster images only (PNG, WebP, JPEG). SVG is deliberately NOT accepted: an SVG can carry script, and these
 * files are served from our own domain. A PNG exported at the recommended size looks the same.
 */
export const LOGO_SLOTS = ["horizontal", "horizontalDark", "icon", "favicon", "appleIcon", "og"] as const;
export type LogoSlot = (typeof LOGO_SLOTS)[number];

export type LogoSpec = {
  label: string;
  /** Short, plain-language list of where it shows up. */
  usedIn: string[];
  /** What to export, e.g. "1000 × 234 px". */
  recommended: string;
  formats: string;
  /** Image types the server accepts for this slot (checked from the file's real bytes). */
  types: readonly ImageType[];
  maxBytes: number;
  minWidth: number;
  minHeight: number;
  maxSide: number;
  /** Width ÷ height must be inside this range (inclusive). */
  ratio: { min: number; max: number };
  /** Short guidance about transparency / background. */
  note: string;
  /** Which backdrop to preview it on. */
  previewOn: "light" | "dark";
  /** The built-in default shown until the owner uploads one. */
  fallback: { src: string; width: number; height: number };
};

const MB = 1024 * 1024;

export const LOGO_SPECS: Record<LogoSlot, LogoSpec> = {
  horizontal: {
    label: "Main logo (wide)",
    usedIn: ["Top navigation bar", "Footer", "Customer area sidebar"],
    recommended: "1000 × 234 px (about 4:1), at least 72 px tall",
    formats: "PNG or WebP with a transparent background",
    types: ["png", "webp"],
    maxBytes: 1 * MB,
    minWidth: 240,
    minHeight: 56,
    maxSide: 4096,
    ratio: { min: 2, max: 8 },
    note: "Dark text/mark for a light background. Shown about 36 px tall, so supply 2× that for sharp screens.",
    previewOn: "light",
    fallback: { src: "/brand/logo-horizontal.png", width: 1000, height: 234 },
  },
  horizontalDark: {
    label: "Main logo for dark backgrounds",
    usedIn: ["Dark theme (not shown yet; used automatically if a dark theme is turned on)"],
    recommended: "Same size as the main logo",
    formats: "PNG or WebP with a transparent background",
    types: ["png", "webp"],
    maxBytes: 1 * MB,
    minWidth: 240,
    minHeight: 56,
    maxSide: 4096,
    ratio: { min: 2, max: 8 },
    note: "Light text/mark. Optional: if you skip it, the main logo is used.",
    previewOn: "dark",
    fallback: { src: "/brand/logo-horizontal-dark.png", width: 1000, height: 234 },
  },
  icon: {
    label: "Logo mark (icon only)",
    usedIn: ["Admin sidebar", "Sign-in card"],
    recommended: "512 × 512 px (square) or similar",
    formats: "PNG or WebP with a transparent background",
    types: ["png", "webp"],
    maxBytes: 1 * MB,
    minWidth: 128,
    minHeight: 128,
    maxSide: 4096,
    ratio: { min: 0.5, max: 1.5 },
    note: "Just the symbol, no wording. Works on light backgrounds.",
    previewOn: "light",
    fallback: { src: "/brand/logo-icon.png", width: 512, height: 633 },
  },
  favicon: {
    label: "Browser tab icon (favicon)",
    usedIn: ["Browser tab", "Bookmarks", "Google search results"],
    recommended: "512 × 512 px, exactly square",
    formats: "PNG (WebP also works)",
    types: ["png", "webp"],
    maxBytes: 512 * 1024,
    minWidth: 192,
    minHeight: 192,
    maxSide: 2048,
    ratio: { min: 0.98, max: 1.02 },
    note: "Keep the design simple: it is shown as small as 16 px.",
    previewOn: "light",
    fallback: { src: "/brand/icon.png", width: 512, height: 512 },
  },
  appleIcon: {
    label: "Phone home-screen icon",
    usedIn: ["iPhone / iPad “Add to Home Screen”"],
    recommended: "180 × 180 px, exactly square",
    formats: "PNG, filled background (no transparency)",
    types: ["png"],
    maxBytes: 512 * 1024,
    minWidth: 180,
    minHeight: 180,
    maxSide: 2048,
    ratio: { min: 0.98, max: 1.02 },
    note: "Phones round the corners for you. If you skip it, the browser tab icon is used.",
    previewOn: "light",
    fallback: { src: "/brand/apple-icon.png", width: 180, height: 180 },
  },
  og: {
    label: "Link-sharing image",
    usedIn: ["Facebook / Messenger / Viber link previews", "X (Twitter), LinkedIn, Google"],
    recommended: "1200 × 630 px (about 1.9:1)",
    formats: "JPEG or PNG",
    types: ["png", "jpeg"],
    maxBytes: 2 * MB,
    minWidth: 600,
    minHeight: 315,
    maxSide: 4096,
    ratio: { min: 1.6, max: 2.2 },
    note: "Shown when someone shares your website link. Keep text and logo away from the edges.",
    previewOn: "light",
    fallback: { src: "", width: 0, height: 0 },
  },
};

/** The per-slot pixel/byte rules. Returns a plain-language problem, or null if the image is acceptable. */
export function checkLogo(
  slot: LogoSlot,
  img: { width: number; height: number; bytes: number; type?: ImageType },
): string | null {
  const s = LOGO_SPECS[slot];
  const { width: w, height: h, bytes } = img;
  if (img.type && !s.types.includes(img.type)) return `This slot needs a ${s.types.map((t) => t.toUpperCase()).join(" or ")} file; yours is ${img.type.toUpperCase()}.`;
  if (!(w > 0 && h > 0)) return "We couldn't read this image's size.";
  if (bytes > s.maxBytes) return `File is too large (${(bytes / 1024).toFixed(0)} KB). Max is ${Math.round(s.maxBytes / 1024)} KB.`;
  if (w < s.minWidth || h < s.minHeight) return `Image is too small (${w} × ${h}). Minimum is ${s.minWidth} × ${s.minHeight} px.`;
  if (w > s.maxSide || h > s.maxSide) return `Image is too large (${w} × ${h}). Maximum is ${s.maxSide} px on either side.`;
  const r = w / h;
  if (r < s.ratio.min || r > s.ratio.max) {
    const sq = s.ratio.min > 0.9 && s.ratio.max < 1.1;
    return sq ? `This slot needs a square image; yours is ${w} × ${h}.` : `Shape doesn't fit this slot (${w} × ${h}). Use roughly ${s.recommended}.`;
  }
  return null;
}

/** A softer hint: allowed, but it will look soft on high-density screens. */
export function logoWarning(slot: LogoSlot, img: { width: number; height: number }): string | null {
  if (slot === "horizontal" || slot === "horizontalDark") {
    if (img.height < 72) return "Under 72 px tall: it may look slightly blurry on phones and retina screens.";
  }
  if (slot === "icon" && img.width < 256) return "Under 256 px wide: it may look slightly blurry.";
  if (slot === "og" && (img.width < 1200 || img.height < 630)) return "Smaller than 1200 × 630: some apps will show a small preview.";
  return null;
}

/** S3 key of an uploaded logo. Only the public `site/` prefix. */
export const LOGO_KEY_PATTERN = /^site\/[A-Za-z0-9._-]+$/;

const asset = z
  .object({
    key: z.string().regex(LOGO_KEY_PATTERN),
    width: z.number().int().min(1).max(8192),
    height: z.number().int().min(1).max(8192),
  })
  .nullable();

export const brandingSchema = z.object({
  logos: z.object({
    horizontal: asset,
    horizontalDark: asset,
    icon: asset,
    favicon: asset,
    appleIcon: asset,
    og: asset,
  }),
});
export type Branding = z.infer<typeof brandingSchema>;
export type LogoAsset = NonNullable<Branding["logos"][LogoSlot]>;

export const DEFAULT_BRANDING: Branding = {
  logos: { horizontal: null, horizontalDark: null, icon: null, favicon: null, appleIcon: null, og: null },
};

export function parseBranding(raw: unknown): Branding {
  const r = brandingSchema.safeParse(raw);
  return r.success ? r.data : DEFAULT_BRANDING;
}

/** Keys of every uploaded logo (for "is this file public?" and cleanup). */
export function brandingKeys(b: Branding): string[] {
  return LOGO_SLOTS.map((s) => b.logos[s]?.key).filter((k): k is string => Boolean(k));
}
