/**
 * The name keychain: what a customer designs (`KeychainSpec`), what the owner allows and charges (`KeychainConfig`), and
 * the rules that connect them (price, limits, a one-line summary). Pure: the browser checks a design with it and the server
 * checks it again. Money is whole centavos. The design is saved as-is on the cart and order line.
 *
 * Three styles: "name" (a name in a font on an outline plate), "icon" (the name with a preset icon beside it) and "tag"
 * (a bag / pet / luggage tag: a name, a small line for a phone number, and a raised frame).
 */
import { z } from "zod";
import { NAME_FONT_IDS } from "../name-mesh";
import { sizeTierCents } from "../clicker/spec";
import { ICON_IDS } from "./icons";

export const STYLE_IDS = ["name", "icon", "tag"] as const;
export type StyleId = (typeof STYLE_IDS)[number];
export const STYLE_LABELS: Record<StyleId, string> = { name: "Name", icon: "Name + icon", tag: "Bag tag" };
export const STYLE_HINTS: Record<StyleId, string> = {
  name: "Just the name, in the font you pick.",
  icon: "The name with an icon beside it.",
  tag: "A name and a small line (like a phone number) inside a frame. For bags, pets and luggage.",
};

export const PLATE_IDS = ["follow", "rounded", "pill"] as const;
export type PlateId = (typeof PLATE_IDS)[number];
export const PLATE_LABELS: Record<PlateId, string> = { follow: "Follow the letters", rounded: "Rounded box", pill: "Pill" };

export const RING_POSITIONS = ["left", "right", "top", "none"] as const;
export type RingPosition = (typeof RING_POSITIONS)[number];
export const RING_LABELS: Record<RingPosition, string> = { left: "Left", right: "Right", top: "Top", none: "No hole" };

/** Hard limits of the geometry (mm). The owner's settings can only narrow them. */
export const LIMITS = {
  minSizeMm: 6,
  maxSizeMm: 24,
  minBaseMm: 1.2,
  maxBaseMm: 5,
  minTextMm: 0.6,
  maxTextMm: 3,
  maxChars: 40,
  maxLines: 3,
  maxLengthMm: 200,
  /** Strokes thinner than this do not print well and are dropped (with a note). */
  minFeatureMm: 0.5,
  minRingWallMm: 1.6,
  /** The width of the raised frame of a bag tag. */
  frameMm: 1.2,
} as const;

const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);

export const keychainSpecSchema = z.object({
  v: z.literal(1),
  style: z.enum(STYLE_IDS),
  /** The name. A new line starts a new line of letters (at most `LIMITS.maxLines`). */
  text: z.string().min(1).max(LIMITS.maxChars + LIMITS.maxLines),
  font: z.enum(NAME_FONT_IDS),
  /** Height of a capital letter (mm). */
  size: z.number().finite().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm),
  spacing: z.number().finite().min(-2).max(6),
  lineGap: z.number().finite().min(-2).max(8),
  /** Bag tag only: the small line under the name. */
  sub: z.string().max(30),
  subSize: z.number().finite().min(3).max(10),
  /** Name + icon only. */
  icon: z.enum(ICON_IDS),
  iconSide: z.enum(["left", "right"]),
  /** Icon height as a multiple of the name's capital height. */
  iconScale: z.number().finite().min(0.6).max(2),
  plate: z.enum(PLATE_IDS),
  /** The plate reaches this far beyond the letters (mm). */
  border: z.number().finite().min(1).max(6),
  /** Plate thickness and how far the letters stand above it (mm). */
  baseMm: z.number().finite().min(LIMITS.minBaseMm).max(LIMITS.maxBaseMm),
  textMm: z.number().finite().min(LIMITS.minTextMm).max(LIMITS.maxTextMm),
  ring: z.object({
    pos: z.enum(RING_POSITIONS),
    hole: z.number().finite().min(3).max(8),
    wall: z.number().finite().min(LIMITS.minRingWallMm).max(4),
  }),
  baseColor: hex,
  textColor: hex,
  iconColor: hex,
  frameColor: hex,
  /**
   * The plate's longest side as the designer measured it (mm). The price follows it; the server rebuilds the shape and
   * refuses a design that claims to be smaller than it really is.
   */
  lengthMm: z.number().finite().min(5).max(300),
});
export type KeychainSpec = z.infer<typeof keychainSpecSchema>;

// ---------------------------------------------------------------------------------------------------------------------
// The owner's settings (stored in the product's keychain option, `constraints.keychain`)
// ---------------------------------------------------------------------------------------------------------------------

export const DEFAULT_PALETTE = [
  "#f8fafc", "#111827", "#ec4899", "#f9a8d4", "#ef4444", "#f97316", "#facc15", "#22c55e", "#5eead4", "#0ea5e9", "#2563eb", "#8b5cf6", "#9ca3af", "#d4a017",
];

export const keychainConfigSchema = z.object({
  palette: z.array(hex).min(2).max(24),
  /** Most colours one print can hold (the Bambu Lab X2D takes 4). */
  maxColours: z.number().int().min(2).max(8),
  styles: z.array(z.enum(STYLE_IDS)).min(1),
  fonts: z.array(z.enum(NAME_FONT_IDS)).min(1),
  icons: z.array(z.enum(ICON_IDS)),
  minSize: z.number().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm),
  maxSize: z.number().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm),
  maxChars: z.number().int().min(1).max(LIMITS.maxChars),
  maxLines: z.number().int().min(1).max(LIMITS.maxLines),
  /** The longest the plate may be (mm). */
  maxLengthMm: z.number().min(30).max(LIMITS.maxLengthMm),
  /** Most different keychains in one order. */
  maxKeychains: z.number().int().min(1).max(30),
  // --- prices (centavos), added to the product's starting price ---
  /** By the plate's longest side: the first step whose `upToMm` reaches it applies. */
  sizeTiers: z.array(z.object({ upToMm: z.number().min(30).max(LIMITS.maxLengthMm), addCents: z.number().int().min(0).max(1_000_000) })).min(1).max(8),
  /** Each line of the name after the first. */
  lineCents: z.number().int().min(0).max(100_000),
  iconCents: z.number().int().min(0).max(100_000),
  tagCents: z.number().int().min(0).max(100_000),
  /** Each colour beyond the first two. */
  extraColourCents: z.number().int().min(0).max(100_000),
  /** Added when plate + letters are thicker than `thickOverMm` in all. */
  thickCents: z.number().int().min(0).max(100_000),
  thickOverMm: z.number().min(2).max(LIMITS.maxBaseMm + LIMITS.maxTextMm),
}).refine((c) => c.minSize <= c.maxSize, { message: "The smallest letter height must not be bigger than the largest.", path: ["minSize"] });
export type KeychainConfig = z.infer<typeof keychainConfigSchema>;

export const DEFAULT_KEYCHAIN_CONFIG: KeychainConfig = {
  palette: DEFAULT_PALETTE,
  maxColours: 4,
  styles: [...STYLE_IDS],
  fonts: [...NAME_FONT_IDS],
  icons: [...ICON_IDS],
  minSize: 7,
  maxSize: 20,
  maxChars: 20,
  maxLines: 2,
  maxLengthMm: 120,
  maxKeychains: 10,
  sizeTiers: [
    { upToMm: 70, addCents: 0 },
    { upToMm: 100, addCents: 3000 },
    { upToMm: 120, addCents: 6000 },
  ],
  lineCents: 3000,
  iconCents: 2000,
  tagCents: 3000,
  extraColourCents: 1500,
  thickCents: 2000,
  thickOverMm: 6,
};

let lastWarned = 0;
/**
 * The owner's settings from an option's constraints, or null when the product is not a keychain designer. Damaged settings
 * fall back to the defaults for display, but ordering is blocked (`keychainConfigDamaged`), so nothing is sold on made-up prices.
 */
export function keychainConfigOf(constraints: { keychain?: unknown } | null | undefined): KeychainConfig | null {
  if (!constraints?.keychain) return null;
  const r = keychainConfigSchema.safeParse({ ...DEFAULT_KEYCHAIN_CONFIG, ...(constraints.keychain as object) });
  if (r.success) return r.data;
  if (Date.now() - lastWarned > 60_000) {
    lastWarned = Date.now();
    console.error("A keychain product has damaged settings, so it cannot be ordered until it is saved again in the admin:", r.error.issues[0]?.message, r.error.issues[0]?.path.join("."));
  }
  return DEFAULT_KEYCHAIN_CONFIG;
}

export function keychainConfigDamaged(constraints: { keychain?: unknown } | null | undefined): boolean {
  if (!constraints?.keychain) return false;
  return !keychainConfigSchema.safeParse({ ...DEFAULT_KEYCHAIN_CONFIG, ...(constraints.keychain as object) }).success;
}

// ---------------------------------------------------------------------------------------------------------------------
// Defaults, colours, price, readable summary
// ---------------------------------------------------------------------------------------------------------------------

/** The most characters in one design's JSON (a guard on the stored line). */
export const MAX_KEYCHAIN_JSON = 6_000;

export function defaultKeychain(cfg: KeychainConfig = DEFAULT_KEYCHAIN_CONFIG, style: StyleId = cfg.styles[0] ?? "name"): KeychainSpec {
  const p = cfg.palette;
  const pick = (i: number, fallback: string) => p[i] ?? fallback;
  return {
    v: 1,
    style,
    text: "Emma",
    font: cfg.fonts.includes("script") ? "script" : cfg.fonts[0],
    size: Math.min(cfg.maxSize, Math.max(cfg.minSize, 12)),
    spacing: 0,
    lineGap: 1,
    sub: style === "tag" ? "0917 123 4567" : "",
    subSize: 5,
    icon: cfg.icons[0] ?? "heart",
    iconSide: "left",
    iconScale: 1,
    plate: style === "tag" ? "rounded" : "follow",
    border: 2,
    baseMm: 2,
    textMm: 1.2,
    ring: { pos: "left", hole: 4.5, wall: 2 },
    baseColor: pick(3, "#f9a8d4"),
    textColor: pick(2, "#ec4899"),
    iconColor: pick(0, "#f8fafc"),
    frameColor: pick(0, "#f8fafc"),
    lengthMm: 60,
  };
}

const lc = (c: string) => c.toLowerCase();

/** The non-empty lines of the name. */
export const linesOf = (spec: Pick<KeychainSpec, "text">): string[] => spec.text.replace(/\r/g, "").split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter(Boolean);

/** The distinct colours the keychain is printed in (they share the printer's filament slots). */
export function keychainColours(spec: KeychainSpec): string[] {
  const out = [lc(spec.baseColor), lc(spec.textColor)];
  if (spec.style === "icon") out.push(lc(spec.iconColor));
  if (spec.style === "tag") out.push(lc(spec.frameColor));
  return [...new Set(out)];
}

/** What the design adds to the product's starting price. */
export function keychainPriceDeltaCents(spec: KeychainSpec, cfg: KeychainConfig): number {
  const extraColours = Math.max(0, keychainColours(spec).length - 2) * cfg.extraColourCents;
  const lines = Math.max(0, linesOf(spec).length - 1) * cfg.lineCents;
  const style = spec.style === "icon" ? cfg.iconCents : spec.style === "tag" ? cfg.tagCents : 0;
  const thick = spec.baseMm + spec.textMm > cfg.thickOverMm + 1e-9 ? cfg.thickCents : 0;
  return sizeTierCents(spec.lengthMm, cfg.sizeTiers) + lines + style + extraColours + thick;
}

/** Why a design is not allowed for this product, or null. Checked in the browser and again on the server. */
export function checkKeychainAgainstConfig(spec: KeychainSpec, cfg: KeychainConfig): string | null {
  if (!cfg.styles.includes(spec.style)) return "That style is not available.";
  if (!cfg.fonts.includes(spec.font)) return "That font is not available.";
  if (spec.style === "icon" && !cfg.icons.includes(spec.icon)) return "That icon is not available.";
  const palette = new Set(cfg.palette.map(lc));
  const stray = keychainColours(spec).find((c) => !palette.has(c));
  if (stray) return `The colour ${stray} is not available. Pick one of the offered colours.`;
  const n = keychainColours(spec).length;
  if (n > cfg.maxColours) return `A keychain can use at most ${cfg.maxColours} colours. This one uses ${n}.`;
  const lines = linesOf(spec);
  if (lines.length === 0) return "Type a name.";
  if (lines.length > cfg.maxLines) return `At most ${cfg.maxLines} line${cfg.maxLines === 1 ? "" : "s"}.`;
  const chars = lines.join("").length;
  if (chars > cfg.maxChars) return `At most ${cfg.maxChars} letters (you have ${chars}).`;
  if (spec.size < cfg.minSize - 1e-9 || spec.size > cfg.maxSize + 1e-9) return `Letters must be between ${cfg.minSize} and ${cfg.maxSize} mm tall.`;
  if (spec.style === "tag" && spec.sub.trim().length > 30) return "The small line is too long.";
  if (spec.lengthMm > cfg.maxLengthMm + 1e-9) return `The keychain can be at most ${cfg.maxLengthMm} mm long. Make the letters smaller or the name shorter.`;
  return null;
}

/** One line for the cart and order. */
export function keychainSummary(spec: KeychainSpec): string {
  const colours = keychainColours(spec).length;
  const lines = linesOf(spec);
  return [
    `${STYLE_LABELS[spec.style]} keychain “${lines.join(" / ")}”`,
    spec.style === "icon" ? `${spec.icon} icon` : null,
    spec.style === "tag" && spec.sub.trim() ? `“${spec.sub.trim()}”` : null,
    `${Math.round(spec.lengthMm)} mm long`,
    `${Math.round((spec.baseMm + spec.textMm) * 10) / 10} mm thick`,
    `${colours} colour${colours === 1 ? "" : "s"}`,
    spec.ring.pos === "none" ? "no hole" : null,
  ].filter(Boolean).join(", ");
}
