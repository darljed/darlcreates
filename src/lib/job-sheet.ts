/**
 * Print job sheet: everything the workshop needs to print and track one order line, written down in plain terms
 * (colour NAME and hex for every part, sizes, the name and its font, the filament to load), so a print can be checked
 * by eye when the colours in the downloaded 3MF look wrong after importing it into Bambu Studio. Pure.
 * It is saved on the order line when the order is placed (`order_items.print_sheet`), so later edits to the product
 * (a deleted colour, a renamed option) never change what was ordered.
 */
import type { ConfigSelection, ProductOptionInput } from "./pricing";
import { colorName } from "./color-name";
import { NAME_FONTS, personalizedName, slotMaxHeight, type NameFontId } from "./name-mesh";
import { clickerColours, designSummary, nameKeys, switchCount } from "./clicker/spec";
import { designOf } from "./clicker/of-product";
import { keychainColours, keychainSummary, linesOf, STYLE_LABELS } from "./keychain/spec";
import { keychainDesignOf } from "./keychain/of-product";

export type SheetColour = { hex: string; name: string };

export type JobSheet = {
  v: 1;
  /** The model file the print file is made from (its storage name), or null. */
  model: string | null;
  /** Every choice the customer made, in the product's order: "Ball colour: Pink". */
  choices: { label: string; value: string; hex?: string }[];
  /** Coloured parts of a multi-colour model: what each part must print in and how the print file treats it. */
  parts: { part: string; hex: string; colour: string; filament: number | null; designerHex: string | null; designerFilament: number | null; slicerParts: string }[];
  /** The customer's name on the model. */
  name: { text: string; font: string; mode: "raised" | "engraved"; colour: SheetColour | null; filament: number | null; areaMm: string; depthMm: number } | null;
  /** The clicker design (made to order): sizes, colours, layers. */
  clicker: { summary: string; kind: string; sizeMm: string; shape: string; switches: number; keyring: boolean; base: SheetColour; cap: SheetColour | null; layers: string[]; colours: SheetColour[]; keys: string[] } | null;
  /** The name keychain design (made to order). Optional: sheets saved before keychains existed do not have it. */
  keychain?: { summary: string; style: string; name: string; font: string; lengthMm: string; thicknessMm: string; ring: string; parts: { part: string; colour: SheetColour }[] } | null;
  /** The ready-made design the customer picked (its name), so the owner can take a pre-printed one. Optional: older sheets do not have it. */
  preset?: string | null;
  /** The distinct colours to load, with the filament number the print file gives them (null: not set by the file). */
  filaments: { hex: string; colour: string; filament: number | null; usedBy: string[] }[];
  /** Things to do by hand because the print file cannot do them. */
  warnings: string[];
};

const lc = (s: string) => s.toLowerCase();
const named = (hex: string, label?: string): SheetColour => ({ hex: lc(hex), name: label || colorName(hex) });

/** Build the sheet for one order line from the product's options and the customer's saved selection. */
export function buildJobSheet(opts: { options: ProductOptionInput[]; config: ConfigSelection; modelKey: string | null; preset?: string | null }): JobSheet {
  const { options, config } = opts;
  const out: JobSheet = { v: 1, preset: opts.preset ?? null, model: opts.modelKey ? (opts.modelKey.split("/").pop() ?? opts.modelKey) : null, choices: [], parts: [], name: null, clicker: null, keychain: null, filaments: [], warnings: [] };
  const fil = new Map<string, { hex: string; colour: string; filament: number | null; usedBy: string[] }>();
  const addFilament = (hex: string, colour: string, filament: number | null, by: string) => {
    const k = lc(hex);
    const f = fil.get(k) ?? { hex: k, colour, filament, usedBy: [] };
    if (f.filament === null && filament !== null) f.filament = filament;
    if (!f.usedBy.includes(by)) f.usedBy.push(by);
    fil.set(k, f);
  };

  const design = designOf(options, config);
  for (const opt of options) {
    const sel = config[opt.id];
    if (!sel) continue;
    if (opt.type === "text" && (opt.constraints.clicker || opt.constraints.keychain)) continue; // the clicker or keychain design is described below
    if (opt.type === "text") {
      if (sel.text) out.choices.push({ label: opt.label, value: sel.text });
    } else if (sel.valueId) {
      const v = opt.values.find((x) => x.id === sel.valueId);
      if (!v) continue;
      out.choices.push({ label: opt.label, value: v.label, ...(opt.type === "color" ? { hex: lc(v.value) } : {}) });
      if (opt.type === "color") {
        const c = opt.constraints;
        const map = c.filaments ?? {};
        const find = (hex: string) => Object.entries(map).find(([h]) => lc(h) === lc(hex))?.[1] ?? null;
        const filament = find(v.value);
        const isPaint = Boolean(c.paintFrom);
        const designerHex = c.defaultHex ? lc(c.defaultHex) : null;
        const designerFilament = designerHex ? find(designerHex) : null;
        const partsText = (c.parts ?? []).map((p) => `object ${p.objectId} · part ${p.partId}`).join("; ");
        if (c.parts?.length || c.partName) {
          out.parts.push({ part: opt.label.replace(/ colou?r$/i, ""), hex: lc(v.value), colour: v.label, filament, designerHex, designerFilament, slicerParts: isPaint ? `painted area of ${partsText} (filament ${c.paintFrom})` : partsText });
          if (c.parts?.length && filament === null) {
            out.warnings.push(`${opt.label}: ${v.label} (${lc(v.value)}) is not one of the 3MF project's filaments, so the downloaded file keeps this part's original colour${designerHex ? ` (${designerHex}${designerFilament ? `, filament ${designerFilament}` : ""})` : ""}. Set this part to ${v.label} by hand in Bambu Studio.`);
          }
        }
        addFilament(v.value, v.label, filament, opt.label.replace(/ colou?r$/i, ""));
      }
    } else if (sel.imageKey) {
      out.choices.push({ label: opt.label, value: "uploaded image (open it from the order)" });
    }
  }

  // the customer's name on the model
  const personal = personalizedName(options, config, opts.modelKey);
  if (personal) {
    const slot = personal.slot;
    const colour = slot.nameColor ? named(slot.nameColor.hex, slot.nameColors?.find((c) => lc(c.hex) === lc(slot.nameColor!.hex))?.label) : null;
    out.name = {
      text: personal.text,
      font: NAME_FONTS[slot.font as NameFontId]?.label ?? slot.font,
      mode: slot.mode ?? "raised",
      colour,
      filament: slot.nameColor?.filament ?? null,
      areaMm: `up to ${slot.maxWidth} × ${slotMaxHeight(slot)} mm`,
      depthMm: slot.depth,
    };
    if (colour) {
      addFilament(colour.hex, colour.name, slot.nameColor?.filament ?? null, "Name");
      if (!slot.nameColor?.filament) out.warnings.push(`Name colour ${colour.name} (${colour.hex}) has no filament number in the file. Set the name to ${colour.name} by hand.`);
    }
  }

  // the clicker design
  if (design) {
    const s = design.spec;
    const cols = clickerColours(s);
    const texts = s.layers.filter((l) => l.visible).map((l) => (l.kind === "text" ? `Text “${l.text.trim()}” · ${NAME_FONTS[l.font as NameFontId]?.label ?? l.font} · ${l.size} mm tall · ${named(l.color).name} ${lc(l.color)}` : `Picture · ${l.size} mm · ${l.regions.filter((r) => r.shapes.length).map((r) => `${named(r.color).name} ${lc(r.color)}`).join(", ")}`));
    const round1 = (n: number) => Math.round(n * 10) / 10;
    out.clicker = {
      summary: designSummary(s),
      kind: s.kind === "name" ? "Name keys" : "Clicker",
      sizeMm: s.kind === "name" ? `${nameKeys(s.name!).length} keys, letters ${s.name!.letterSize} mm tall` : s.shape === "outline" ? `${round1(Math.max(s.width, s.height))} mm longest side (outline)` : `${round1(s.width)} × ${round1(s.height)} mm`,
      shape: s.kind === "name" ? "key per letter" : s.shape,
      switches: switchCount(s),
      keyring: s.keyring.on,
      base: named(s.baseColor),
      cap: s.kind === "name" ? null : named(s.capColor),
      layers: s.kind === "name" ? [`Letters “${nameKeys(s.name!).join("")}” · ${NAME_FONTS[s.name!.font as NameFontId]?.label ?? s.name!.font} · letters ${named(s.name!.letterColor).name} ${lc(s.name!.letterColor)} · keys ${s.name!.keyColors.map((c) => `${named(c).name} ${lc(c)}`).join(" / ")}`] : texts,
      colours: cols.map((c) => named(c)),
      keys: s.kind === "name" ? nameKeys(s.name!) : [],
    };
    // the file numbers filaments in the order the pieces appear, which is not always this order: match by colour
    out.clicker.colours.forEach((c) => addFilament(c.hex, c.name, null, "Clicker"));
    out.warnings.push("Clicker print file: filament numbers follow the order the parts appear in the file. If the colours look wrong in Bambu Studio, match each part to the colours listed here by name.");
  }

  // the name keychain design
  const kc = keychainDesignOf(options, config);
  if (kc) {
    const s = kc.spec;
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const parts = [{ part: "Plate", hex: s.baseColor }, { part: "Name", hex: s.textColor }, ...(s.style === "icon" ? [{ part: `Icon (${s.icon})`, hex: s.iconColor }] : []), ...(s.style === "tag" ? [{ part: "Frame", hex: s.frameColor }] : [])];
    out.keychain = {
      summary: keychainSummary(s),
      style: STYLE_LABELS[s.style],
      name: linesOf(s).join(" / ") + (s.style === "tag" && s.sub.trim() ? ` + “${s.sub.trim()}”` : ""),
      font: NAME_FONTS[s.font as NameFontId]?.label ?? s.font,
      lengthMm: `${round1(s.lengthMm)} mm long, letters ${s.size} mm tall`,
      thicknessMm: `${round1(s.baseMm + s.textMm)} mm (plate ${s.baseMm} + letters ${s.textMm})`,
      ring: s.ring.pos === "none" ? "no hole" : `hole ${s.ring.hole} mm, ${s.ring.pos}`,
      parts: parts.map((p) => ({ part: p.part, colour: named(p.hex) })),
    };
    keychainColours(s).forEach((c) => addFilament(c, named(c).name, null, "Keychain"));
    out.warnings.push("Keychain print file: filament numbers follow the order the parts appear in the file. If the colours look wrong in Bambu Studio, match each part to the colours listed here by name.");
  }

  out.filaments = [...fil.values()].sort((a, b) => (a.filament ?? 99) - (b.filament ?? 99));
  return out;
}

/** The sheet as plain text, for pasting into a chat, a note or a tracker. */
export function sheetText(title: string, qty: number, s: JobSheet): string {
  const L: string[] = [`${qty}× ${title}`];
  if (s.model) L.push(`Model file: ${s.model}`);
  if (s.preset) L.push(`Design preset: ${s.preset}`);
  for (const c of s.choices) L.push(`${c.label}: ${c.value}${c.hex ? ` (${c.hex})` : ""}`);
  if (s.parts.length) {
    L.push("Parts:");
    for (const p of s.parts) L.push(`  - ${p.part}: ${p.colour} ${p.hex}${p.filament ? ` → filament ${p.filament}` : " → set by hand"}${p.designerHex ? ` (designer: ${p.designerHex}${p.designerFilament ? `, filament ${p.designerFilament}` : ""})` : ""}`);
  }
  if (s.name) L.push(`Name: “${s.name.text}” · ${s.name.font} · ${s.name.mode} · ${s.name.areaMm}${s.name.colour ? ` · ${s.name.colour.name} ${s.name.colour.hex}${s.name.filament ? ` → filament ${s.name.filament}` : ""}` : ""}`);
  if (s.clicker) {
    L.push(`${s.clicker.kind}: ${s.clicker.summary}`, `  Size: ${s.clicker.sizeMm} · ${s.clicker.switches} switch${s.clicker.switches === 1 ? "" : "es"}${s.clicker.keyring ? " · keyring" : ""}`, `  Base: ${s.clicker.base.name} ${s.clicker.base.hex}${s.clicker.cap ? ` · Cap: ${s.clicker.cap.name} ${s.clicker.cap.hex}` : ""}`);
    for (const l of s.clicker.layers) L.push(`  - ${l}`);
  }
  if (s.keychain) {
    L.push(`Keychain (${s.keychain.style}): “${s.keychain.name}” · ${s.keychain.font}`, `  Size: ${s.keychain.lengthMm} · ${s.keychain.thicknessMm} · ${s.keychain.ring}`);
    for (const p of s.keychain.parts) L.push(`  - ${p.part}: ${p.colour.name} ${p.colour.hex}`);
  }
  if (s.filaments.length) L.push(`Load: ${s.filaments.map((f) => `${f.colour} ${f.hex}${f.filament ? ` (filament ${f.filament})` : ""}`).join(", ")}`);
  for (const w of s.warnings) L.push(`! ${w}`);
  return L.join("\n");
}
