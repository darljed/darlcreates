/**
 * A customer's clicker design, and the owner's settings for the clicker product. The design is plain data (shape, sizes,
 * colours, layers of text or traced pictures as outlines); the print file is always rebuilt from it on the server, never
 * taken from a mesh the browser made. Pure and shared by the designer, the cart, the order page and the server.
 */
import { z } from "zod";
import { NAME_FONT_IDS } from "../name-mesh";
import { SHAPE_IDS } from "./shapes";

export const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = z.string().regex(HEX);
const coord = z.number().finite().min(-500).max(500);

/** Hard limits that keep a design printable and its stored size small, whatever the owner's settings say. */
export const LIMITS = {
  minSizeMm: 15,
  maxSizeMm: 120,
  maxLayers: 10,
  maxRegionsPerColour: 600,
  maxRingPoints: 6000,
  /** Total outline points over all pictures: keeps a stored design near 200 KB. */
  maxPoints: 16_000,
  maxText: 40,
  /** Thinnest line that prints (mm) and the smallest island worth printing (mm²). */
  minFeatureMm: 0.5,
  minAreaMm2: 0.25,
  /** Thinnest wall around a keyring hole, and the base layer under the design (mm). */
  minKeyringWallMm: 1.6,
  minBaseMm: 0.8,
} as const;

const ring = z.array(z.tuple([coord, coord])).min(3).max(LIMITS.maxRingPoints);
export const regionSchema = z.object({ outer: ring, holes: z.array(ring).max(200) });

const layerBase = {
  id: z.string().min(1).max(24),
  name: z.string().max(40).default(""),
  x: z.number().finite().min(-200).max(200),
  y: z.number().finite().min(-200).max(200),
  rotation: z.number().finite().min(-360).max(360),
  mirror: z.boolean().default(false),
  visible: z.boolean().default(true),
};

export const imageLayerSchema = z.object({
  ...layerBase,
  kind: z.literal("image"),
  /** Length of the picture's longest side on the clicker (mm). */
  size: z.number().finite().min(2).max(200),
  /** One entry per colour: its outlines, scaled so the longest side of the picture is 1 and centred on the origin. */
  regions: z
    .array(z.object({ id: z.string().min(1).max(24), color: hex, shapes: z.array(regionSchema).max(LIMITS.maxRegionsPerColour) }))
    .max(8),
});

export const textLayerSchema = z.object({
  ...layerBase,
  kind: z.literal("text"),
  text: z.string().max(LIMITS.maxText),
  font: z.enum(NAME_FONT_IDS),
  /** Height of a capital letter (mm). */
  size: z.number().finite().min(2).max(80),
  /** Extra space between letters (mm). */
  spacing: z.number().finite().min(-1).max(10),
  /** Extra space between lines (mm). */
  lineGap: z.number().finite().min(-2).max(20),
  color: hex,
});

export const layerSchema = z.discriminatedUnion("kind", [imageLayerSchema, textLayerSchema]);
export type ImageLayer = z.infer<typeof imageLayerSchema>;
export type TextLayer = z.infer<typeof textLayerSchema>;
export type Layer = z.infer<typeof layerSchema>;

export const MODES = ["inlay", "raised", "engraved"] as const;
export type Mode = (typeof MODES)[number];
export const MODE_LABELS: Record<Mode, string> = { inlay: "Flat (inlay)", raised: "Raised (emboss)", engraved: "Engraved" };

export const clickerSpecSchema = z
  .object({
    v: z.literal(1),
    shape: z.enum(SHAPE_IDS),
    width: z.number().finite().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm),
    height: z.number().finite().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm),
    /** Corner radius for square and rounded (mm). */
    corner: z.number().finite().min(0).max(30),
    /** Number of points for star and flower. */
    points: z.number().int().min(3).max(12),
    /** Whole thickness of the clicker (mm). */
    thickness: z.number().finite().min(2).max(10),
    /** Thickness of the top layer that holds the colours (mm). */
    topDepth: z.number().finite().min(0.4).max(5),
    baseColor: hex,
    mode: z.enum(MODES),
    /** How far raised colours stand above the top (mm). */
    embossHeight: z.number().finite().min(0.2).max(4),
    /** How deep engraved colours sit below the top (mm). */
    engraveDepth: z.number().finite().min(0.2).max(3),
    border: z.object({ on: z.boolean(), width: z.number().finite().min(0.8).max(8), height: z.number().finite().min(0).max(3), color: hex }),
    keyring: z.object({ on: z.boolean(), angle: z.number().finite().min(-360).max(360), hole: z.number().finite().min(2).max(10), wall: z.number().finite().min(LIMITS.minKeyringWallMm).max(6) }),
    layers: z.array(layerSchema).max(LIMITS.maxLayers),
  })
  .refine((s) => s.topDepth <= s.thickness - LIMITS.minBaseMm, { message: "The top layer is too thick for this thickness", path: ["topDepth"] })
  .refine((s) => s.mode !== "engraved" || s.engraveDepth <= s.topDepth, { message: "The engraving cannot be deeper than the top layer", path: ["engraveDepth"] })
  .refine((s) => pointsInSpec(s) <= LIMITS.maxPoints, { message: "The pictures are too detailed. Use fewer colours or less detail.", path: ["layers"] })
  .refine((s) => new Set(s.layers.map((l) => l.id)).size === s.layers.length, { message: "Layer ids must be unique", path: ["layers"] });

export type ClickerSpec = z.infer<typeof clickerSpecSchema>;

function pointsInSpec(s: { layers: Layer[] }): number {
  let n = 0;
  for (const l of s.layers) if (l.kind === "image") for (const r of l.regions) for (const sh of r.shapes) n += sh.outer.length + sh.holes.reduce((m, h) => m + h.length, 0);
  return n;
}

/** The serialised design may not exceed this many characters (a guard on the stored cart/order line). */
export const MAX_SPEC_JSON = 300_000;
/** Most characters one "add to cart" request may carry in total (Vercel allows 4.5 MB per request). */
export const MAX_ADD_JSON = 3_500_000;

// ---------------------------------------------------------------------------------------------------------------------
// The owner's settings for the product (stored in the product's clicker option, `constraints.clicker`)
// ---------------------------------------------------------------------------------------------------------------------

export const DEFAULT_PALETTE = [
  "#f8fafc", "#111827", "#ef4444", "#f97316", "#facc15", "#22c55e", "#0ea5e9", "#2563eb", "#8b5cf6", "#ec4899", "#92400e", "#9ca3af",
];

export const clickerConfigSchema = z.object({
  minSize: z.number().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm),
  maxSize: z.number().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm),
  /** The filament colours on offer; every colour in a design must be one of these. */
  palette: z.array(hex).min(2).max(24),
  maxLayers: z.number().int().min(1).max(LIMITS.maxLayers),
  /** Most different clickers in one order. */
  maxClickers: z.number().int().min(1).max(30),
  /** Extra price by the clicker's longest side: the first tier whose `upToMm` is at least the size applies. */
  sizeTiers: z.array(z.object({ upToMm: z.number().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm), addCents: z.number().int().min(0).max(1_000_000) })).min(1).max(8),
  /** Extra price per colour beyond the first two. */
  extraColourCents: z.number().int().min(0).max(100_000),
  keyringCents: z.number().int().min(0).max(100_000),
  /** Extra price when a picture is used. */
  imageCents: z.number().int().min(0).max(100_000),
  allowImages: z.boolean(),
  allowText: z.boolean(),
});
export type ClickerConfig = z.infer<typeof clickerConfigSchema>;

export const DEFAULT_CLICKER_CONFIG: ClickerConfig = {
  minSize: 25,
  maxSize: 70,
  palette: DEFAULT_PALETTE,
  maxLayers: 6,
  maxClickers: 20,
  sizeTiers: [
    { upToMm: 40, addCents: 0 },
    { upToMm: 55, addCents: 3000 },
    { upToMm: 70, addCents: 6000 },
  ],
  extraColourCents: 1000,
  keyringCents: 0,
  imageCents: 0,
  allowImages: true,
  allowText: true,
};

/** The owner's settings from an option's constraints, or null when the product is not a clicker designer. */
export function clickerConfigOf(constraints: { clicker?: unknown } | null | undefined): ClickerConfig | null {
  if (!constraints?.clicker) return null;
  const r = clickerConfigSchema.safeParse({ ...DEFAULT_CLICKER_CONFIG, ...(constraints.clicker as object) });
  return r.success ? r.data : null;
}

// ---------------------------------------------------------------------------------------------------------------------
// Defaults, colours, price, readable summary
// ---------------------------------------------------------------------------------------------------------------------

let counter = 0;
/** A short unique id for layers and colour groups (unique within a design; not secret). */
export const newId = (prefix = "l") => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`.slice(0, 24);

export function defaultText(cfg: Pick<ClickerConfig, "palette"> = DEFAULT_CLICKER_CONFIG): TextLayer {
  return { id: newId("t"), kind: "text", name: "Text", x: 0, y: 0, rotation: 0, mirror: false, visible: true, text: "Hello", font: "chunky", size: 8, spacing: 0, lineGap: 1, color: cfg.palette[1] ?? "#111827" };
}

export function defaultSpec(cfg: ClickerConfig = DEFAULT_CLICKER_CONFIG): ClickerSpec {
  const p = cfg.palette;
  return {
    v: 1,
    shape: "circle",
    width: Math.min(40, cfg.maxSize),
    height: Math.min(40, cfg.maxSize),
    corner: 4,
    points: 5,
    thickness: 3.2,
    topDepth: 1.2,
    baseColor: p[0] ?? "#f8fafc",
    mode: "inlay",
    embossHeight: 1,
    engraveDepth: 0.8,
    border: { on: true, width: 1.6, height: 0.6, color: p[1] ?? "#111827" },
    keyring: { on: true, angle: 90, hole: 4.5, wall: 2.2 },
    layers: cfg.allowText ? [defaultText(cfg)] : [],
  };
}

const lc = (c: string) => c.toLowerCase();

/** The distinct colours the clicker is printed in (base, border if on, and every visible design colour). */
export function clickerColours(spec: ClickerSpec): string[] {
  const out: string[] = [lc(spec.baseColor)];
  if (spec.border.on) out.push(lc(spec.border.color));
  for (const l of spec.layers) {
    if (!l.visible) continue;
    if (l.kind === "text") {
      if (l.text.trim()) out.push(lc(l.color));
    } else {
      for (const r of l.regions) if (r.shapes.length) out.push(lc(r.color));
    }
  }
  return [...new Set(out)];
}

export function sizeTierCents(longestSide: number, tiers: ClickerConfig["sizeTiers"]): number {
  const sorted = [...tiers].sort((a, b) => a.upToMm - b.upToMm);
  return (sorted.find((t) => longestSide <= t.upToMm + 1e-9) ?? sorted[sorted.length - 1]).addCents;
}

/** What the design adds to the product's base price. */
export function clickerPriceDeltaCents(spec: ClickerSpec, cfg: ClickerConfig): number {
  const colours = clickerColours(spec).length;
  const usesImage = spec.layers.some((l) => l.visible && l.kind === "image" && l.regions.some((r) => r.shapes.length));
  return (
    sizeTierCents(Math.max(spec.width, spec.height), cfg.sizeTiers) +
    Math.max(0, colours - 2) * cfg.extraColourCents +
    (spec.keyring.on ? cfg.keyringCents : 0) +
    (usesImage ? cfg.imageCents : 0)
  );
}

/** Why a design is not allowed for this product, or null. Checked in the browser and again on the server. */
export function checkAgainstConfig(spec: ClickerSpec, cfg: ClickerConfig): string | null {
  if (Math.min(spec.width, spec.height) < cfg.minSize - 1e-9) return `The clicker must be at least ${cfg.minSize} mm.`;
  if (Math.max(spec.width, spec.height) > cfg.maxSize + 1e-9) return `The clicker can be at most ${cfg.maxSize} mm.`;
  if (spec.layers.length > cfg.maxLayers) return `A clicker can have at most ${cfg.maxLayers} design layers.`;
  const palette = new Set(cfg.palette.map(lc));
  const stray = clickerColours(spec).find((c) => !palette.has(c));
  if (stray) return `The colour ${stray} is not available. Pick one of the offered colours.`;
  if (!cfg.allowImages && spec.layers.some((l) => l.kind === "image")) return "Pictures are not available for this clicker.";
  if (!cfg.allowText && spec.layers.some((l) => l.kind === "text")) return "Text is not available for this clicker.";
  return null;
}

/** One line for the cart and order: size, shape, colours, extras. */
export function designSummary(spec: ClickerSpec): string {
  const colours = clickerColours(spec).length;
  const texts = spec.layers.filter((l): l is TextLayer => l.kind === "text" && l.visible && !!l.text.trim()).map((l) => `“${l.text.trim().replace(/\s+/g, " ")}”`);
  const pics = spec.layers.filter((l) => l.kind === "image" && l.visible).length;
  const parts = [
    `${round1(spec.width)} × ${round1(spec.height)} mm ${spec.shape}`,
    `${colours} colour${colours === 1 ? "" : "s"}`,
    spec.mode === "raised" ? "raised design" : spec.mode === "engraved" ? "engraved design" : "flat design",
    spec.border.on ? "border" : null,
    spec.keyring.on ? "keyring" : null,
    texts.length ? texts.slice(0, 3).join(", ") : null,
    pics ? `${pics} picture${pics === 1 ? "" : "s"}` : null,
  ];
  return parts.filter(Boolean).join(", ");
}
const round1 = (n: number) => Math.round(n * 10) / 10;
