/**
 * Multi-colour models: a colour option can colour one part of the model (the ball of a clicker, its holder, ...).
 * Pure, so the product page (3D preview), the cart and the server (print file) read the choices the same way.
 *
 * An option made from a slicer project carries, in its `constraints`: `partName` (the mesh name the viewer colours),
 * `parts` (the slicer parts), `filaments` (hex -> filament number) and `defaultHex` (how the designer printed it).
 */
import type { ConfigSelection, ProductOptionInput } from "./pricing";

const isPart = (o: ProductOptionInput) => o.type === "color" && Boolean(o.constraints.partName);

/** The hex the customer picked for a colour option, or the designer's colour when nothing is picked yet. */
function chosenHex(opt: ProductOptionInput, selection: ConfigSelection): string | null {
  const v = opt.values.find((x) => x.id === selection[opt.id]?.valueId);
  return v?.value ?? opt.constraints.defaultHex ?? null;
}

/** mesh name -> colour, for the 3D viewer. Only the options that colour a part of the model. */
export function partColorsFor(options: ProductOptionInput[], selection: ConfigSelection): Record<string, string> {
  const out: Record<string, string> = {};
  for (const o of options) {
    if (!isPart(o)) continue;
    const hex = chosenHex(o, selection);
    if (hex) out[o.constraints.partName!] = hex;
  }
  return out;
}

/** The colour option(s) that colour the whole model (no `partName`): the first one's colour drives the single-colour look. */
export function wholeModelColor(options: ProductOptionInput[], selection: ConfigSelection): string | null {
  for (const o of options) {
    if (o.type !== "color" || isPart(o)) continue;
    const v = o.values.find((x) => x.id === selection[o.id]?.valueId);
    if (v) return v.value;
  }
  return null;
}

/** A selection with every part-colour option set to the designer's colour (the value whose hex is `defaultHex`). */
export function defaultPartSelection(options: ProductOptionInput[]): ConfigSelection {
  const out: ConfigSelection = {};
  for (const o of options) {
    if (!isPart(o) || !o.constraints.defaultHex) continue;
    const v = o.values.find((x) => x.value.toLowerCase() === o.constraints.defaultHex!.toLowerCase());
    if (v) out[o.id] = { valueId: v.id };
  }
  return out;
}

/** Which filament each slicer part prints with, from the customer's colour choices (for `setFilaments`). */
export function filamentAssignments(options: ProductOptionInput[], config: ConfigSelection): { objectId: string; partId: string; filament: number }[] {
  const out: { objectId: string; partId: string; filament: number }[] = [];
  for (const o of options) {
    if (o.type !== "color" || !o.constraints.parts || !o.constraints.filaments || o.constraints.paintFrom) continue;
    const hex = chosenHex(o, config);
    const filament = hex ? Object.entries(o.constraints.filaments).find(([h]) => h.toLowerCase() === hex.toLowerCase())?.[1] : undefined;
    if (!filament) continue;
    for (const p of o.constraints.parts) out.push({ objectId: p.objectId, partId: p.partId, filament });
  }
  return out;
}

/** Which filament each painted area prints with, from the customer's choices (for `recolorPaint`). */
export function paintAssignments(options: ProductOptionInput[], config: ConfigSelection): { objectId: string; partId: string; from: number; to: number }[] {
  const out: { objectId: string; partId: string; from: number; to: number }[] = [];
  for (const o of options) {
    if (o.type !== "color" || !o.constraints.paintFrom || !o.constraints.parts || !o.constraints.filaments) continue;
    const hex = chosenHex(o, config);
    const to = hex ? Object.entries(o.constraints.filaments).find(([h]) => h.toLowerCase() === hex.toLowerCase())?.[1] : undefined;
    if (!to) continue;
    for (const p of o.constraints.parts) out.push({ objectId: p.objectId, partId: p.partId, from: o.constraints.paintFrom, to });
  }
  return out;
}
