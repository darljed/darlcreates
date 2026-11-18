/**
 * Finding the keychain design in a cart or order line. Pure.
 */
import type { ConfigSelection, ProductOptionInput } from "../pricing";
import { keychainConfigOf, keychainSpecSchema, type KeychainConfig, type KeychainSpec } from "./spec";

/** The product's keychain option and the owner's settings, or null when it is not a keychain product. */
export function keychainOptionOf(options: ProductOptionInput[]): { option: ProductOptionInput; config: KeychainConfig } | null {
  for (const option of options) {
    if (option.type !== "text") continue;
    const config = keychainConfigOf(option.constraints);
    if (config) return { option, config };
  }
  return null;
}

/** The design saved on a cart or order line, if the product is a keychain designer and the line has a valid one. */
export function keychainDesignOf(options: ProductOptionInput[], config: ConfigSelection): { spec: KeychainSpec; config: KeychainConfig } | null {
  const k = keychainOptionOf(options);
  if (!k) return null;
  const parsed = keychainSpecSchema.safeParse(config[k.option.id]?.design);
  return parsed.success ? { spec: parsed.data, config: k.config } : null;
}
