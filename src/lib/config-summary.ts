/**
 * Human-readable summary of a customer's selection ("Color: Blue", "Name: Maria (Chunky font, Red name)"). Pure, so the
 * cart, orders, the waybill and tests share it without touching the database.
 */
import type { ConfigSelection, ProductOptionInput } from "./pricing";
import { NAME_FONTS, type NameFontId } from "./name-mesh";
import { clickerConfigOf, clickerSpecSchema, designSummary } from "./clicker/spec";

/** Summary of a config snapshot using the product's option schema. */
export function summarizeConfig(
  options: ProductOptionInput[],
  config: ConfigSelection,
): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  for (const opt of options) {
    const sel = config[opt.id];
    if (!sel) continue;
    if (opt.type === "text" && sel.design !== undefined && clickerConfigOf(opt.constraints)) {
      const d = clickerSpecSchema.safeParse(sel.design);
      if (d.success) out.push({ label: opt.label, value: designSummary(d.data) });
    } else if (opt.type === "text" && sel.text) {
      const fontLabel = sel.font && sel.font in NAME_FONTS ? NAME_FONTS[sel.font as NameFontId].label : null;
      const colours = ((opt.constraints.slot ?? {}) as { nameColors?: { hex: string; label: string }[] }).nameColors ?? [];
      const colourLabel = sel.nameColor ? colours.find((c) => c.hex.toLowerCase() === sel.nameColor!.toLowerCase())?.label : undefined;
      const extras = [fontLabel && `${fontLabel} font`, colourLabel && `${colourLabel} name`].filter(Boolean).join(", ");
      out.push({ label: opt.label, value: extras ? `${sel.text} (${extras})` : sel.text });
    } else if (sel.valueId) {
      const v = opt.values.find((x) => x.id === sel.valueId);
      if (v) out.push({ label: opt.label, value: v.label });
    } else if (sel.imageKey) {
      out.push({ label: opt.label, value: "uploaded image" });
    }
  }
  return out;
}

