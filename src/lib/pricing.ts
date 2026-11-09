import { z } from "zod";
import { sumCentavos } from "./money";

/**
 * Server-authoritative price computation and customization validation.
 * The client preview mirrors this but is NEVER trusted — add-to-cart and
 * order placement recompute here from the product's option schema.
 */

export type OptionConstraints = {
  maxLen?: number;
  pattern?: string;
  fonts?: string[];
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
  { valueId?: string; text?: string; imageKey?: string }
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
        sel.imageKey !== undefined);

    if (!hasSelection) {
      if (opt.required) errors.push(`${opt.label} is required`);
      continue;
    }

    deltas.push(opt.priceDeltaCents);

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

/** Zod schema for a raw selection payload coming from the client. */
export const configSelectionSchema = z.record(
  z.string(),
  z.object({
    valueId: z.string().optional(),
    text: z.string().max(500).optional(),
    imageKey: z.string().max(300).optional(),
  }),
);
