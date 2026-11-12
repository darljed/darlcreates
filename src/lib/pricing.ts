import { z } from "zod";
import { sumCentavos } from "./money";
import { checkAgainstConfig, clickerConfigDamaged, clickerConfigOf, clickerPriceDeltaCents, clickerSpecSchema, MAX_SPEC_JSON } from "./clicker/spec";

/**
 * Server-authoritative price computation and customization validation.
 * The client preview mirrors this but is NEVER trusted — add-to-cart and
 * order placement recompute here from the product's option schema.
 */

export type OptionConstraints = {
  maxLen?: number;
  pattern?: string;
  fonts?: string[];
  /** Text options only: where the name sits on the 3D model (see name-mesh.ts). Unvalidated here; use `slotOf`. */
  slot?: unknown;
  /** Text options only: this option is the clicker designer, with the owner's settings (see clicker/spec.ts). */
  clicker?: unknown;
  /**
   * Colour options only: this option colours one part of a multi-colour model (see part-colors.ts). `partName` is the
   * mesh name the 3D viewer colours (`dc-slot-<n>`), `parts` the slicer parts it covers, `filaments` the filament
   * number for each choosable colour (hex -> number), `defaultHex` the colour the designer printed it in.
   */
  partName?: string;
  parts?: { objectId: string; partId: string }[];
  filaments?: Record<string, number>;
  defaultHex?: string;
  /** Colour options for a PAINTED area of a part (not a part of its own): the filament it was painted with. `parts` are the painted parts. */
  paintFrom?: number;
  formats?: string[];
  maxBytes?: number;
  minW?: number;
  minH?: number;
};

export type ProductOptionInput = {
  id: string;
  type: "color" | "text" | "size" | "image";
  label: string;
  required: boolean;
  priceDeltaCents: number;
  constraints: OptionConstraints;
  values: {
    id: string;
    label: string;
    value: string;
    priceDeltaCents: number;
  }[];
};

/** A customer's selection: optionId -> chosen value. */
export type ConfigSelection = Record<
  string,
  { valueId?: string; text?: string; imageKey?: string; font?: string; nameColor?: string; design?: unknown }
>;

export type PriceResult = {
  unitPriceCents: number;
  errors: string[];
};

/**
 * Validate a selection against the product's option schema and compute the
 * authoritative unit price. Returns errors (empty = valid).
 */
export function computeUnitPrice(
  basePriceCents: number,
  options: ProductOptionInput[],
  selection: ConfigSelection,
): PriceResult {
  const errors: string[] = [];
  const deltas: number[] = [basePriceCents];

  for (const opt of options) {
    const sel = selection[opt.id];
    const hasSelection =
      sel &&
      (sel.valueId !== undefined ||
        (sel.text !== undefined && sel.text !== "") ||
        sel.imageKey !== undefined ||
        sel.design !== undefined);

    if (!hasSelection) {
      if (opt.required) errors.push(`${opt.label} is required`);
      continue;
    }

    deltas.push(opt.priceDeltaCents);

    // a clicker designer: the whole design is the selection, priced by the owner's size / colour rules
    const clicker = opt.type === "text" ? clickerConfigOf(opt.constraints) : null;
    if (clicker) {
      if (clickerConfigDamaged(opt.constraints)) {
        errors.push(`${opt.label} cannot be ordered right now. Please try again later.`);
        continue;
      }
      const design = clickerSpecSchema.safeParse(sel!.design);
      if (!design.success) errors.push(`${opt.label}: ${design.error.issues[0]?.message ?? "the design is not valid"}`);
      else if (JSON.stringify(design.data).length > MAX_SPEC_JSON) errors.push(`${opt.label}: the design is not valid or too detailed.`);
      else {
        const problem = checkAgainstConfig(design.data, clicker);
        if (problem) errors.push(`${opt.label}: ${problem}`);
        else deltas.push(clickerPriceDeltaCents(design.data, clicker));
      }
      continue;
    }

    switch (opt.type) {
      case "color":
      case "size": {
        const val = opt.values.find((v) => v.id === sel!.valueId);
        if (!val) {
          errors.push(`${opt.label}: invalid choice`);
        } else {
          deltas.push(val.priceDeltaCents);
        }
        break;
      }
      case "text": {
        const text = sel!.text ?? "";
        const maxLen = opt.constraints.maxLen ?? 50;
        if (text.length > maxLen) {
          errors.push(`${opt.label}: max ${maxLen} characters`);
        }
        if (opt.constraints.pattern) {
          try {
            if (!new RegExp(opt.constraints.pattern).test(text)) {
              errors.push(`${opt.label}: contains disallowed characters`);
            }
          } catch {
            /* invalid pattern in schema — ignore, don't block the customer */
          }
        }
        break;
      }
      case "image": {
        if (!sel!.imageKey) errors.push(`${opt.label}: image upload required`);
        break;
      }
    }
  }

  return { unitPriceCents: sumCentavos(deltas), errors };
}

/**
 * Rebuild a customer's selection from scratch, keeping ONLY what the product's option schema
 * allows: known option ids; for color/size just `valueId`; for text just trimmed `text`; for image
 * just `imageKey`, and only if `isOwnImageKey` says the caller owns that file. Anything else the
 * client sent (extra keys, an imageKey on a text option, someone else's file) is dropped, so a
 * crafted request can't attach an arbitrary S3 key to an order. Pure, so it is unit-tested.
 */
export function normalizeSelection(
  options: ProductOptionInput[],
  raw: ConfigSelection,
  isOwnImageKey: (key: string) => boolean,
): { config: ConfigSelection; errors: string[] } {
  const config: ConfigSelection = {};
  const errors: string[] = [];
  for (const opt of options) {
    const sel = raw[opt.id];
    if (!sel) continue;
    if (opt.type === "color" || opt.type === "size") {
      if (sel.valueId) config[opt.id] = { valueId: sel.valueId };
    } else if (opt.type === "text" && clickerConfigOf(opt.constraints)) {
      // keep only a design that fits the schema (and is not absurdly big); anything else on this option is dropped
      if (clickerConfigDamaged(opt.constraints)) errors.push(`${opt.label} cannot be ordered right now. Please try again later.`);
      else if (sel.design !== undefined) {
        const parsed = clickerSpecSchema.safeParse(sel.design);
        if (parsed.success && JSON.stringify(parsed.data).length <= MAX_SPEC_JSON) config[opt.id] = { design: parsed.data };
        else errors.push(`${opt.label}: the design is not valid or too detailed.`);
      }
    } else if (opt.type === "text") {
      const text = (sel.text ?? "").trim();
      if (text) {
        // a font choice is kept only if this option's name slot offers it
        const slot = (opt.constraints.slot ?? {}) as { font?: string; fonts?: string[]; mode?: string };
        const offered = new Set([slot.font, ...(slot.fonts ?? [])].filter(Boolean));
        const entry: { text: string; font?: string; nameColor?: string } = { text };
        if (sel.font && offered.size > 1 && offered.has(sel.font)) entry.font = sel.font;
        // a name colour is kept only if this option's name slot offers it (stored as the offered spelling)
        const colours = ((opt.constraints.slot ?? {}) as { nameColors?: { hex: string }[] }).nameColors ?? [];
        const colour = sel.nameColor ? colours.find((c) => c.hex.toLowerCase() === sel.nameColor!.toLowerCase()) : undefined;
        if (colour && slot.mode !== "engraved") entry.nameColor = colour.hex; // an engraved name is a cut, it has no colour
        config[opt.id] = entry;
      }
    } else if (opt.type === "image") {
      if (sel.imageKey) {
        if (isOwnImageKey(sel.imageKey)) config[opt.id] = { imageKey: sel.imageKey };
        else errors.push(`${opt.label}: that image isn't yours or is invalid. Upload it again.`);
      }
    }
  }
  return { config, errors };
}

/** The customer's uploaded image key from a config snapshot, if any (first image option). */
export function firstImageKey(config: ConfigSelection): string | null {
  for (const sel of Object.values(config)) if (sel?.imageKey) return sel.imageKey;
  return null;
}

/** Zod schema for a raw selection payload coming from the client. */
export const configSelectionSchema = z.record(
  z.string(),
  z.object({
    valueId: z.string().optional(),
    text: z.string().max(500).optional(),
    imageKey: z.string().max(300).optional(),
    font: z.string().max(30).optional(),
    nameColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    /** A clicker design (checked against its own schema in `normalizeSelection`). */
    design: z.unknown().optional(),
  }),
);
