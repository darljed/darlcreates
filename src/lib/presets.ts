/**
 * Design presets: ready-made colour combinations a customer can pick instead of choosing every colour. PURE (no database,
 * no framework) so the shop, the cart and the order check all use the same rules and scripts can test them.
 *
 * A preset is stored by what each colour option IS and the colour's hex: `{ key, label, hex }`. The key is the option's
 * part name (`dc-slot-<n>`, stable when "detect from 3MF" rebuilds the options) or, for a plain colour option, its label.
 * `resolvePreset` turns it into a normal `ConfigSelection` for the product's CURRENT options, so prices, the job sheet and
 * the print files work exactly as for a hand-picked selection. A preset whose colours are no longer offered is not
 * available (hidden from customers) rather than guessed at.
 */
import { z } from "zod";
import type { ConfigSelection, ProductOptionInput } from "./pricing";

export const DESIGN_MODES = ["custom", "presets", "both"] as const;
export type DesignMode = (typeof DESIGN_MODES)[number];
export const DESIGN_MODE_LABEL: Record<DesignMode, string> = {
  custom: "Customers pick every colour (custom only)",
  presets: "Customers pick a ready-made design only",
  both: "Customers choose: a ready-made design or their own colours",
};
export const MAX_PRESETS_PER_PRODUCT = 24;

export const presetColourSchema = z.object({
  key: z.string().trim().min(1).max(80),
  label: z.string().trim().max(80).default(""),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});
export const presetNameSchema = z.string().trim().min(1).max(40);

export type PresetColour = z.infer<typeof presetColourSchema>;
export type PresetRow = { id: string; name: string; active: boolean; sort: number; colours: PresetColour[] };

/** What identifies a colour option across rebuilds. */
export const optionKey = (opt: Pick<ProductOptionInput, "label" | "constraints">): string => opt.constraints.partName ?? `label:${opt.label}`;

export const colourOptions = (options: ProductOptionInput[]) => options.filter((o) => o.type === "color");

export type ResolvedPreset = PresetRow & {
  /** optionId -> { valueId } for every colour option of the product: what picking this preset selects. */
  selection: ConfigSelection;
  /** One swatch per colour option, in option order, for the picker cards. */
  swatches: { label: string; hex: string }[];
  /** Labels of the colour options whose colour is not offered (or missing from the preset). Empty = usable. */
  missing: string[];
  /** Active and nothing missing: customers can pick it. */
  available: boolean;
};

const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/** The preset as a selection of the product's current colour options. */
export function resolvePreset(options: ProductOptionInput[], row: PresetRow): ResolvedPreset {
  const selection: ConfigSelection = {};
  const swatches: { label: string; hex: string }[] = [];
  const missing: string[] = [];
  for (const opt of colourOptions(options)) {
    const want = row.colours.find((c) => c.key === optionKey(opt));
    const value = want ? opt.values.find((v) => same(v.value, want.hex)) : undefined;
    if (!want || !value) {
      missing.push(opt.label);
      if (want) swatches.push({ label: opt.label, hex: want.hex });
      continue;
    }
    selection[opt.id] = { valueId: value.id };
    swatches.push({ label: opt.label, hex: value.value });
  }
  const hasColours = colourOptions(options).length > 0;
  return { ...row, selection, swatches, missing, available: row.active && hasColours && missing.length === 0 };
}

export const resolvePresets = (options: ProductOptionInput[], rows: PresetRow[]): ResolvedPreset[] =>
  [...rows].sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name)).map((r) => resolvePreset(options, r));

/**
 * The mode customers actually get. A product set to presets or both but with no usable preset falls back to custom, so a
 * customer is never locked out of ordering by an empty or broken preset list.
 */
export function effectiveMode(mode: string, presets: { available?: boolean }[]): DesignMode {
  const m = (DESIGN_MODES as readonly string[]).includes(mode) ? (mode as DesignMode) : "custom";
  return m !== "custom" && presets.some((p) => p.available !== false) ? m : "custom";
}

/** The available preset whose colours equal this selection on every colour option, if any. */
export function matchPreset<T extends { selection: ConfigSelection; available?: boolean }>(presets: T[], config: ConfigSelection): T | null {
  for (const p of presets) {
    if (p.available === false) continue;
    const ids = Object.keys(p.selection);
    if (ids.length && ids.every((id) => config[id]?.valueId === p.selection[id].valueId)) return p;
  }
  return null;
}

/** Presets-only products accept nothing but a preset's colours. Returns the sentence to show, or null when fine. */
export function presetProblem(mode: string, presets: { selection: ConfigSelection; available?: boolean }[], config: ConfigSelection): string | null {
  if (effectiveMode(mode, presets) !== "presets") return null;
  return matchPreset(presets, config) ? null : "Choose one of the ready-made designs.";
}

/** What the admin form sends: which value of each colour option, turned into the stored form. Null when a choice is not valid. */
export function coloursFromChoices(options: ProductOptionInput[], choices: Record<string, string>): PresetColour[] | null {
  const out: PresetColour[] = [];
  for (const opt of colourOptions(options)) {
    const v = opt.values.find((x) => x.id === choices[opt.id]);
    if (!v || !/^#[0-9a-fA-F]{6}$/.test(v.value)) return null;
    out.push({ key: optionKey(opt), label: opt.label, hex: v.value.toLowerCase() });
  }
  return out.length ? out : null;
}
