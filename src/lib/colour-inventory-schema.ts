/**
 * The shop's colour inventory: the filament colours the owner has in stock. When the owner has saved one, it is the ONLY
 * set of colours offered anywhere (the clicker designer, colour options, name colours). Until then (no inventory saved)
 * nothing is filtered, so existing products keep working. Pure: the schema, the filter and the checks, no database.
 */
import { z } from "zod";
import { DEFAULT_PALETTE } from "./clicker/spec";
import type { ProductOptionInput } from "./pricing";

const HEX = /^#[0-9a-f]{6}$/i;

export const MAX_INVENTORY_COLOURS = 24;

export const inventoryColourSchema = z.object({
  name: z.string().trim().min(1, "Give every colour a name").max(40),
  /** Always stored lower-case, `#rrggbb`. */
  hex: z.string().regex(HEX, "Colours must look like #1a2b3c").transform((h) => h.toLowerCase()),
});

export const colourInventorySchema = z
  .object({ colours: z.array(inventoryColourSchema).min(2, "Add at least two colours").max(MAX_INVENTORY_COLOURS, `At most ${MAX_INVENTORY_COLOURS} colours`) })
  .refine((v) => new Set(v.colours.map((c) => c.hex)).size === v.colours.length, { message: "The same colour is in the list twice", path: ["colours"] });

export type InventoryColour = z.infer<typeof inventoryColourSchema>;
export type ColourInventory = z.infer<typeof colourInventorySchema>;

const DEFAULT_NAMES = ["White", "Black", "Red", "Orange", "Yellow", "Green", "Sky blue", "Blue", "Purple", "Pink", "Brown", "Grey"];
/** What the editor starts from when the owner has not saved an inventory yet. */
export const DEFAULT_INVENTORY: ColourInventory = { colours: DEFAULT_PALETTE.map((hex, i) => ({ name: DEFAULT_NAMES[i] ?? hex, hex })) };

/** A stored inventory, or null when there is none or it is damaged (then nothing is filtered). */
export function parseInventory(raw: unknown): ColourInventory | null {
  if (raw === undefined || raw === null) return null;
  const r = colourInventorySchema.safeParse(raw);
  return r.success ? r.data : null;
}

export const inventoryHexes = (inv: ColourInventory): string[] => inv.colours.map((c) => c.hex);

/** True when the colour may be offered: always when there is no inventory, otherwise only if it is in stock. */
export const inStock = (inv: ColourInventory | null, hex: string): boolean => !inv || inv.colours.some((c) => c.hex === hex.toLowerCase());

/** The name the owner gave a colour, or null. */
export const colourName = (inv: ColourInventory | null, hex: string): string | null => inv?.colours.find((c) => c.hex === hex.toLowerCase())?.name ?? null;

/**
 * A product's options with the inventory applied, so everything downstream (the storefront, the cart, pricing, checkout)
 * sees only colours in stock:
 *  - colour options lose the values that are not in stock;
 *  - a clicker or keychain designer gets the inventory as its palette (and cannot ask for more colours per print than there are);
 *  - a name slot keeps only the name colours in stock.
 * Returns the options unchanged when there is no inventory.
 */
export function applyInventory(options: ProductOptionInput[], inv: ColourInventory | null): ProductOptionInput[] {
  if (!inv) return options;
  const hexes = inventoryHexes(inv);
  return options.map((o) => {
    if (o.type === "color") return { ...o, values: o.values.filter((v) => inStock(inv, v.value)) };
    if (o.type !== "text") return o;
    const c = o.constraints as { clicker?: Record<string, unknown>; keychain?: Record<string, unknown>; slot?: { nameColors?: { hex: string }[] } };
    let constraints = o.constraints;
    if (c.clicker) {
      const maxColours = typeof c.clicker.maxColours === "number" ? Math.min(c.clicker.maxColours, hexes.length) : hexes.length;
      constraints = { ...constraints, clicker: { ...c.clicker, palette: hexes, maxColours } } as typeof constraints;
    }
    if (c.keychain) {
      const maxColours = typeof c.keychain.maxColours === "number" ? Math.min(c.keychain.maxColours, hexes.length) : hexes.length;
      constraints = { ...constraints, keychain: { ...c.keychain, palette: hexes, maxColours } } as typeof constraints;
    }
    if (c.slot?.nameColors) {
      constraints = { ...constraints, slot: { ...c.slot, nameColors: c.slot.nameColors.filter((n) => inStock(inv, n.hex)) } } as typeof constraints;
    }
    return constraints === o.constraints ? o : { ...o, constraints };
  });
}
