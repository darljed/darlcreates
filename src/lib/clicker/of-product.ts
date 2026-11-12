/**
 * Finding the clicker design in a cart or order line. Pure.
 */
import type { ConfigSelection, ProductOptionInput } from "../pricing";
import { clickerConfigOf, clickerSpecSchema, type ClickerConfig, type ClickerSpec } from "./spec";

/** The product's clicker option and the owner's settings, or null when it is not a clicker product. */
export function clickerOptionOf(options: ProductOptionInput[]): { option: ProductOptionInput; config: ClickerConfig } | null {
  for (const option of options) {
    if (option.type !== "text") continue;
    const config = clickerConfigOf(option.constraints);
    if (config) return { option, config };
  }
  return null;
}

/** The design saved on a cart or order line, if the product is a clicker designer and the line has a valid one. */
export function designOf(options: ProductOptionInput[], config: ConfigSelection): { spec: ClickerSpec; config: ClickerConfig } | null {
  const c = clickerOptionOf(options);
  if (!c) return null;
  const parsed = clickerSpecSchema.safeParse(config[c.option.id]?.design);
  return parsed.success ? { spec: parsed.data, config: c.config } : null;
}
