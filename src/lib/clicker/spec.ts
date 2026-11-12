/**
 * A customer's clicker design, and the owner's settings for the clicker product. A clicker is a printed base and cap
 * around a real MX keyboard switch (see fit.ts). The design is plain data (shape and size, colours, layers of text or
 * traced pictures as outlines, the switch); the print file is always rebuilt from it on the server, never taken from a
 * mesh the browser made. Pure and shared by the designer, the cart, the order page and the server.
 *
 * Two kinds: "clicker" (one switch, a cap with your picture or text) and "name" (one key and switch per letter).
 */
import { z } from "zod";
import { NAME_FONT_IDS } from "../name-mesh";
import { FIT, RELIEF_IDS, RIM_IDS } from "./fit";
import { maxKeySide } from "./reach";
import { SHAPE_IDS } from "./shapes";

export const HEX = /^#[0-9a-fA-F]{6}$/;
const hex = z.string().regex(HEX);
const coord = z.number().finite().min(-500).max(500);

/** Hard limits that keep a design printable and its stored size small, whatever the owner's settings say. */
export const LIMITS = {
  /** The switch needs about 15 mm; a smaller cap is grown to fit. */
  minSizeMm: 24,
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
  /** Thinnest wall around a keyring hole (mm). */
  minKeyringWallMm: 1.6,
  maxKeys: 12,
  maxSwitches: 6,
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
  /** Length of the picture's longest side on the cap (mm). */
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

export const KINDS = ["clicker", "name"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABELS: Record<Kind, string> = { clicker: "Clicker", name: "Name keys" };

/** The name-keys settings: one key per letter. */
export const nameSchema = z.object({
  /** Letters, digits or symbols. No spaces: each character is a key. */
  text: z.string().min(1).max(LIMITS.maxKeys),
  font: z.enum(NAME_FONT_IDS),
  /** Height of a capital letter on its key (mm). */
  letterSize: z.number().finite().min(4).max(14),
  /** How many keys in a row before starting the next row. */
  perRow: z.number().int().min(1).max(LIMITS.maxKeys),
  /** One key colour, or two that alternate. */
  keyColors: z.array(hex).min(1).max(2),
  letterColor: hex,
});
export type NameSettings = z.infer<typeof nameSchema>;

export const clickerSpecSchema = z
  .object({
    v: z.literal(2),
    kind: z.enum(KINDS),
    // the cap (kind "clicker"): its outline
    shape: z.enum(SHAPE_IDS),
    width: z.number().finite().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm),
    height: z.number().finite().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm),
    /** The width of the coloured border round a key that follows the artwork ("outline"), in mm. */
    border: z.number().finite().min(0.4).max(5).default(1.2),
    /**
     * Where the switches go under the key, in mm from the key's centre (a clicker; name keys have one under each letter).
     * More than one makes a bigger key that presses on all of them. They must be at least FIT.switchPitchMm apart.
     */
    switches: z.array(z.object({ x: z.number().finite().min(-100).max(100), y: z.number().finite().min(-100).max(100) })).min(1).max(LIMITS.maxSwitches).default([{ x: 0, y: 0 }]),
    /** Corner radius for square and rounded (mm). */
    corner: z.number().finite().min(0).max(30),
    /** Number of points for star and flower. */
    points: z.number().int().min(3).max(12),
    /** The base that holds the switch, and the pressable cap. */
    baseColor: hex,
    capColor: hex,
    /** How far the artwork stands above the cap's top. */
    relief: z.enum(RELIEF_IDS),
    /** The wall around the cap: low, standard, high, or level with the key. */
    rim: z.enum(RIM_IDS),
    keyring: z.object({ on: z.boolean(), angle: z.number().finite().min(-360).max(360), hole: z.number().finite().min(2).max(10), wall: z.number().finite().min(LIMITS.minKeyringWallMm).max(6) }),
    layers: z.array(layerSchema).max(LIMITS.maxLayers),
    name: nameSchema.optional(),
  })
  .refine((s) => s.kind !== "name" || !!s.name, { message: "Type the letters for the keys", path: ["name"] })
  .refine((s) => pointsInSpec(s) <= LIMITS.maxPoints, { message: "The pictures are too detailed. Use fewer colours or less detail.", path: ["layers"] })
  .refine((s) => new Set(s.layers.map((l) => l.id)).size === s.layers.length, { message: "Layer ids must be unique", path: ["layers"] })
  .refine((s) => s.kind !== "clicker" || switchesApart(s.switches), { message: `Switches must be at least ${FIT.switchPitchMm} mm apart`, path: ["switches"] });

export type ClickerSpec = z.infer<typeof clickerSpecSchema>;

/** True when no two switches are closer than the pitch (measured along x or y, since the parts are square). */
export function switchesApart(sw: { x: number; y: number }[], pitch: number = FIT.switchPitchMm): boolean {
  for (let i = 0; i < sw.length; i++) for (let j = i + 1; j < sw.length; j++) if (Math.max(Math.abs(sw[i].x - sw[j].x), Math.abs(sw[i].y - sw[j].y)) < pitch - 1e-6) return false;
  return true;
}

/** A tidy starting arrangement for n switches, centred on the key: a row, or a grid. */
export function switchPattern(n: number, arrangement: "row" | "grid" = "row", pitch: number = FIT.switchPitchMm): { x: number; y: number }[] {
  const count = Math.max(1, Math.min(LIMITS.maxSwitches, Math.round(n)));
  const round = (v: number) => Math.round(v * 10) / 10;
  if (arrangement === "row" || count < 3) return Array.from({ length: count }, (_, i) => ({ x: round((i - (count - 1) / 2) * pitch), y: 0 }));
  const cols = count <= 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  return Array.from({ length: count }, (_, i) => {
    const r = Math.floor(i / cols), c = i % cols;
    const inRow = Math.min(cols, count - r * cols);
    return { x: round((c - (inRow - 1) / 2) * pitch), y: round(-(r - (rows - 1) / 2) * pitch) };
  });
}

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
  /** The cap's smallest and largest side (mm). The base is 5 mm bigger all round. */
  minSize: z.number().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm),
  maxSize: z.number().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm),
  /** The filament colours on offer; every colour in a design must be one of these. */
  palette: z.array(hex).min(2).max(24),
  /** Most colours (filaments) one print can use. Your printer's limit; the Bambu Lab X2D takes 4. */
  maxColours: z.number().int().min(2).max(8),
  maxLayers: z.number().int().min(1).max(LIMITS.maxLayers),
  /** Most different clickers in one order. */
  maxClickers: z.number().int().min(1).max(30),
  /** Extra price by the cap's longest side: the first tier whose `upToMm` is at least the size applies. */
  sizeTiers: z.array(z.object({ upToMm: z.number().min(LIMITS.minSizeMm).max(LIMITS.maxSizeMm), addCents: z.number().int().min(0).max(1_000_000) })).min(1).max(8),
  /** Extra price per colour beyond the first two. */
  extraColourCents: z.number().int().min(0).max(100_000),
  keyringCents: z.number().int().min(0).max(100_000),
  /** Extra price when a picture is used. */
  imageCents: z.number().int().min(0).max(100_000),
  allowImages: z.boolean(),
  allowText: z.boolean(),
  /** Most switches under one big key, and the price of each one after the first. */
  maxSwitches: z.number().int().min(1).max(LIMITS.maxSwitches),
  extraSwitchCents: z.number().int().min(0).max(100_000),
  /** Name keys: allowed, the most keys, and the price of each key after the first. */
  allowName: z.boolean(),
  maxKeys: z.number().int().min(1).max(LIMITS.maxKeys),
  keyCents: z.number().int().min(0).max(100_000),
  /** Fit adjustments for your printer, from the fit test (mm; plus loosens, minus tightens). */
  tune: z.object({ pocket: z.number().min(-0.5).max(0.5), stem: z.number().min(-0.5).max(0.5), gap: z.number().min(-0.5).max(0.5) }),
});
export type ClickerConfig = z.infer<typeof clickerConfigSchema>;

export const DEFAULT_CLICKER_CONFIG: ClickerConfig = {
  minSize: 30,
  maxSize: 80,
  palette: DEFAULT_PALETTE,
  maxColours: 4,
  maxLayers: 6,
  maxClickers: 10,
  sizeTiers: [
    { upToMm: 45, addCents: 0 },
    { upToMm: 60, addCents: 4000 },
    { upToMm: 80, addCents: 8000 },
  ],
  extraColourCents: 1000,
  keyringCents: 0,
  imageCents: 0,
  allowImages: true,
  allowText: true,
  maxSwitches: 4,
  extraSwitchCents: 4000,
  allowName: true,
  maxKeys: 8,
  keyCents: 6000,
  tune: { pocket: 0, stem: 0, gap: 0 },
};

let lastWarned = 0;
/**
 * The owner's settings from an option's constraints, or null when the product is not a clicker designer. If the product IS a
 * clicker designer (it has clicker settings) but they are damaged, it stays one and shows with the default settings, so its
 * designs are not silently dropped; but ORDERING is blocked (see `clickerConfigDamaged`), so nothing is sold on the wrong
 * limits or prices. It is logged so the owner can fix it (saving the product again in the admin repairs it).
 */
export function clickerConfigOf(constraints: { clicker?: unknown } | null | undefined): ClickerConfig | null {
  if (!constraints?.clicker) return null;
  const r = clickerConfigSchema.safeParse({ ...DEFAULT_CLICKER_CONFIG, ...(constraints.clicker as object) });
  if (r.success) return r.data;
  if (Date.now() - lastWarned > 60_000) {
    lastWarned = Date.now();
    console.error("A clicker product has damaged settings, so it cannot be ordered until it is saved again in the admin:", r.error.issues[0]?.message, r.error.issues[0]?.path.join("."));
  }
  return DEFAULT_CLICKER_CONFIG;
}

/** True when a clicker product's settings are damaged. Orders for it are refused rather than priced on made-up limits. */
export function clickerConfigDamaged(constraints: { clicker?: unknown } | null | undefined): boolean {
  if (!constraints?.clicker) return false;
  return !clickerConfigSchema.safeParse({ ...DEFAULT_CLICKER_CONFIG, ...(constraints.clicker as object) }).success;
}

// ---------------------------------------------------------------------------------------------------------------------
// Defaults, colours, price, readable summary
// ---------------------------------------------------------------------------------------------------------------------

let counter = 0;
/** A short unique id for layers and colour groups (unique within a design; not secret). */
export const newId = (prefix = "l") => `${prefix}${Date.now().toString(36)}${(counter++).toString(36)}`.slice(0, 24);

export function defaultText(cfg: Pick<ClickerConfig, "palette"> = DEFAULT_CLICKER_CONFIG): TextLayer {
  return { id: newId("t"), kind: "text", name: "Text", x: 0, y: 0, rotation: 0, mirror: false, visible: true, text: "CLICK", font: "chunky", size: 10, spacing: 0, lineGap: 1, color: cfg.palette[2] ?? "#ef4444" };
}

export function defaultSpec(cfg: ClickerConfig = DEFAULT_CLICKER_CONFIG, kind: Kind = "clicker"): ClickerSpec {
  const p = cfg.palette;
  const size = Math.min(Math.max(40, cfg.minSize), cfg.maxSize);
  return {
    v: 2,
    kind,
    shape: "outline",
    width: size,
    height: size,
    border: 1.2,
    switches: [{ x: 0, y: 0 }],
    corner: 5,
    points: 5,
    baseColor: p[0] ?? "#f8fafc",
    capColor: p[1] ?? "#111827",
    relief: "flat",
    rim: "standard",
    keyring: { on: false, angle: 180, hole: 5, wall: 2.4 },
    layers: kind === "clicker" && cfg.allowText ? [defaultText(cfg)] : [],
    ...(kind === "name" ? { name: defaultName(cfg) } : {}),
  };
}

export function defaultName(cfg: Pick<ClickerConfig, "palette" | "maxKeys">): NameSettings {
  const p = cfg.palette;
  return { text: "HEY", font: "chunky", letterSize: 9, perRow: Math.min(cfg.maxKeys, 8), keyColors: [p[1] ?? "#111827"], letterColor: p[2] ?? "#ef4444" };
}

const lc = (c: string) => c.toLowerCase();

/** The characters that get a key. */
export const nameKeys = (n: Pick<NameSettings, "text">): string[] => [...n.text.replace(/\s+/g, "")];

/**
 * The distinct colours the clicker is printed in. All of them share the printer's filament slots, so this is what the
 * "colours used" meter counts: the base, the cap, and every visible artwork colour (or the key and letter colours).
 */
export function clickerColours(spec: ClickerSpec): string[] {
  const out: string[] = [lc(spec.baseColor)];
  if (spec.kind === "name" && spec.name) {
    const keys = nameKeys(spec.name).length;
    spec.name.keyColors.slice(0, Math.max(1, Math.min(keys, spec.name.keyColors.length))).forEach((c) => out.push(lc(c)));
    if (keys) out.push(lc(spec.name.letterColor));
    return [...new Set(out)];
  }
  out.push(lc(spec.capColor));
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

/** How many switches (keys) a design uses. */
export const switchCount = (spec: ClickerSpec) => (spec.kind === "name" && spec.name ? Math.max(1, nameKeys(spec.name).length) : spec.switches.length);

/** What the design adds to the product's base price. */
export function clickerPriceDeltaCents(spec: ClickerSpec, cfg: ClickerConfig): number {
  const colours = clickerColours(spec).length;
  const keys = switchCount(spec);
  const extraColours = Math.max(0, colours - 2) * cfg.extraColourCents;
  const keyring = spec.keyring.on ? cfg.keyringCents : 0;
  if (spec.kind === "name") return (keys - 1) * cfg.keyCents + extraColours + keyring;
  const usesImage = spec.layers.some((l) => l.visible && l.kind === "image" && l.regions.some((r) => r.shapes.length));
  return sizeTierCents(Math.max(spec.width, spec.height), cfg.sizeTiers) + (keys - 1) * cfg.extraSwitchCents + extraColours + keyring + (usesImage ? cfg.imageCents : 0);
}

/** Why a design is not allowed for this product, or null. Checked in the browser and again on the server. */
export function checkAgainstConfig(spec: ClickerSpec, cfg: ClickerConfig): string | null {
  const palette = new Set(cfg.palette.map(lc));
  const stray = clickerColours(spec).map(lc).find((c) => !palette.has(c)); // (the base colour is the first of these)
  if (stray) return `The colour ${stray} is not available. Pick one of the offered colours.`;
  const n = clickerColours(spec).length;
  if (n > cfg.maxColours) return `A clicker can use at most ${cfg.maxColours} colours in all (the base and the cap count). This one uses ${n}.`;
  if (spec.kind === "name") {
    if (!cfg.allowName) return "Name keys are not available.";
    if (!spec.name) return "Type the letters for the keys.";
    const keys = nameKeys(spec.name);
    if (keys.length === 0) return "Type at least one letter.";
    if (keys.length > cfg.maxKeys) return `At most ${cfg.maxKeys} keys.`;
    return null;
  }
  if (spec.switches.length > cfg.maxSwitches) return `A clicker can have at most ${cfg.maxSwitches} switches.`;
  // a key that follows its artwork is as big as the artwork and the switches need, so the owner's minimum does not apply to it
  if (spec.shape !== "outline" && Math.min(spec.width, spec.height) < cfg.minSize - 1e-9) return `The clicker must be at least ${cfg.minSize} mm.`;
  if (Math.max(spec.width, spec.height) > cfg.maxSize + 1e-9) return `The clicker can be at most ${cfg.maxSize} mm.`;
  if (spec.shape !== "outline") {
    const [mw, mh] = maxKeySide(spec.switches);
    if (spec.width > mw + 0.05 || spec.height > mh + 0.05) return `A key this big needs more switches. With ${spec.switches.length === 1 ? "one switch" : `${spec.switches.length} switches`} it can be at most ${Math.floor(Math.min(mw, mh))} mm across, or it will not press smoothly.`;
  }
  if (spec.layers.length > cfg.maxLayers) return `A clicker can have at most ${cfg.maxLayers} design layers.`;
  if (!cfg.allowImages && spec.layers.some((l) => l.kind === "image")) return "Pictures are not available for this clicker.";
  if (!cfg.allowText && spec.layers.some((l) => l.kind === "text")) return "Text is not available for this clicker.";
  return null;
}

/** One line for the cart and order: size, shape, colours, switch, extras. */
export function designSummary(spec: ClickerSpec): string {
  const colours = clickerColours(spec).length;
  if (spec.kind === "name" && spec.name) {
    const keys = nameKeys(spec.name);
    return [`Name keys “${keys.join("")}”`, `${keys.length} Cherry MX switch${keys.length === 1 ? "" : "es"}`, `${colours} colour${colours === 1 ? "" : "s"}`, spec.keyring.on ? "keyring" : null].filter(Boolean).join(", ");
  }
  const texts = spec.layers.filter((l): l is TextLayer => l.kind === "text" && l.visible && !!l.text.trim()).map((l) => `“${l.text.trim().replace(/\s+/g, " ")}”`);
  const pics = spec.layers.filter((l) => l.kind === "image" && l.visible).length;
  const parts = [
    // a key that follows its artwork has no fixed width and height: say how long it is
    spec.shape === "outline" ? `${round1(Math.max(spec.width, spec.height))} mm long outline clicker` : `${round1(spec.width)} × ${round1(spec.height)} mm ${spec.shape} clicker`,
    spec.switches.length > 1 ? `${spec.switches.length} Cherry MX switches` : "Cherry MX switch",
    `${colours} colour${colours === 1 ? "" : "s"}`,
    spec.relief === "flat" ? "flat design" : "raised design",
    spec.keyring.on ? "keyring" : null,
    texts.length ? texts.slice(0, 3).join(", ") : null,
    pics ? `${pics} picture${pics === 1 ? "" : "s"}` : null,
  ];
  return parts.filter(Boolean).join(", ");
}
const round1 = (n: number) => Math.round(n * 10) / 10;
