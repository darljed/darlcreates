/**
 * Agent tools for a product's 3D options: the colour, size and text choices customers pick, and the ready-made design
 * presets. Used by the Product studio chat (and offered to the admin agent too). SERVER ONLY.
 *
 * Same rules as tools.ts: the read tool runs at once; every write tool only becomes a PROPOSAL with a before/after
 * preview, and `apply` runs through the product editor's own Server Actions after a person approves (so the colour
 * inventory check, the preset rules and the cache refresh all happen as usual). The before picture is re-read at
 * approval: if the product changed in between, the proposal is refused instead of overwriting.
 *
 * The model names options and colours in words ("Lid colour", "Sky Blue"); they are matched here to the product's real
 * ids, so it never needs to invent one. Not offered: deleting an option, deleting a design (hide it instead), re-detecting
 * from the 3MF (one click in the editor, and it rebuilds every colour option).
 */
import { z } from "zod";
import { getProductById, type FullProduct } from "@/lib/catalog";
import { loadColourInventory } from "@/lib/site-content-store";
import { DEFAULT_INVENTORY, type ColourInventory } from "@/lib/colour-inventory-schema";
import { DESIGN_MODES, DESIGN_MODE_LABEL, MAX_PRESETS_PER_PRODUCT, optionKey, presetNameSchema } from "@/lib/presets";
import type { ProductOptionInput } from "@/lib/pricing";
import { addOptionAction, addOptionValueAction, deleteOptionValuesAction, updateOptionAction, updateOptionValueAction } from "@/app/(admin)/admin/products/actions";
import { saveDesignModeAction, savePresetAction, setPresetActiveAction } from "@/app/(admin)/admin/products/preset-actions";
import type { ApplyResult, Preview, Tool } from "./tools";

const uuid = z.string().uuid();
const pesos = z.number().finite().min(0).max(100_000);
const toPesos = (c: number) => Math.round(c) / 100;
const lc = (s: string) => s.trim().toLowerCase();
const link = (id: string) => `/admin/products/${id}`;

function tool<S extends z.ZodType<Record<string, unknown>>>(t: { name: string; description: string; kind: "read" | "write"; params: S; run?: (a: z.infer<S>) => Promise<unknown>; preview?: (a: z.infer<S>) => Promise<Preview | { error: string }>; apply?: (a: z.infer<S>) => Promise<ApplyResult> }): Tool {
  return t as unknown as Tool;
}

/** Every option and colour as the product editor sees them (raw: colours the shop's list hides are still there). */
async function load(productId: string): Promise<FullProduct | null> {
  return getProductById(productId, { raw: true });
}
const inventoryOf = async (): Promise<ColourInventory> => (await loadColourInventory()) ?? DEFAULT_INVENTORY;
const designerOnly = (p: FullProduct) => p.options.some((o) => o.type === "text" && (o.constraints.clicker || o.constraints.keychain));

/** An option by its label (or id). Labels are unique enough on one product; an ambiguous one is an error. */
function findOption(p: FullProduct, ref: string): ProductOptionInput | { error: string } {
  const byId = p.options.find((o) => o.id === ref);
  if (byId) return byId;
  const hits = p.options.filter((o) => lc(o.label) === lc(ref));
  if (hits.length === 1) return hits[0];
  return { error: hits.length ? `Two options are called "${ref}". Use the option id from get_product_options.` : `No option "${ref}" on this product. Use get_product_options.` };
}
/** A choice of an option by its label or hex. */
const findValue = (o: ProductOptionInput, ref: string) => o.values.find((v) => v.id === ref || lc(v.label) === lc(ref) || lc(v.value) === lc(ref)) ?? null;
/** A colour of the shop's colour list by name or hex. */
const findStock = (inv: ColourInventory, ref: string) => inv.colours.find((c) => lc(c.name) === lc(ref) || lc(c.hex) === lc(ref)) ?? null;

const optionView = (o: ProductOptionInput) => ({
  id: o.id,
  label: o.label,
  type: o.type,
  required: o.required,
  pricePesos: toPesos(o.priceDeltaCents),
  part: o.constraints.partName ?? null,
  ...(o.type === "text" ? { maxLength: o.constraints.maxLen ?? null, nameOnModel: Boolean(o.constraints.slot) } : {}),
  choices: o.values.map((v) => ({ id: v.id, label: v.label, ...(o.type === "color" ? { hex: v.value } : { code: v.value }), extraPesos: toPesos(v.priceDeltaCents) })),
});

// ---- read ---------------------------------------------------------------------------------------------------------

const getOptions = tool({
  name: "get_product_options",
  kind: "read",
  description: "A product's customization: every option (colour per part, size, text) with its choices, the ready-made design presets, how customers choose colours (design mode), and the shop's colour list (the only colours that can be added).",
  params: z.object({ productId: uuid }),
  run: async (a) => {
    const p = await load(a.productId);
    if (!p) return { error: "Product not found" };
    const inv = await inventoryOf();
    return {
      id: p.id, name: p.name, hasModel: Boolean(p.stlKey), modelIs3mf: Boolean(p.stlKey && /\.3mf$/i.test(p.stlKey)),
      designer: designerOnly(p) ? "This is a clicker or keychain designer: its options are set up in its own designer, not here." : null,
      designMode: p.designMode, designModes: DESIGN_MODE_LABEL,
      options: p.options.map(optionView),
      presets: p.presets.map((d) => ({ id: d.id, name: d.name, visible: d.active, shownToCustomers: d.available, colours: d.colours.map((c) => `${c.label}: ${c.hex}`), notShownBecause: d.missing.length ? `${d.missing.join(", ")} not offered` : null })),
      shopColours: inv.colours.map((c) => `${c.name} ${c.hex}`),
    };
  },
});

// ---- write --------------------------------------------------------------------------------------------------------

/** The colours of a design, part by part, from the model's words. Every colour option must get a colour the option offers. */
function presetChoices(p: FullProduct, colours: { option: string; colour: string }[]): { choices: Record<string, string>; view: Record<string, string>; byKey: Record<string, string> } | { error: string } {
  const choices: Record<string, string> = {};
  const view: Record<string, string> = {};
  const byKey: Record<string, string> = {};
  const colourOpts = p.options.filter((o) => o.type === "color");
  if (!colourOpts.length) return { error: "This product has no colour options, so it cannot have designs." };
  for (const c of colours) {
    const o = findOption(p, c.option);
    if ("error" in o) return o;
    if (o.type !== "color") return { error: `"${o.label}" is not a colour option.` };
    const v = findValue(o, c.colour);
    if (!v) return { error: `"${o.label}" does not offer "${c.colour}". It offers: ${o.values.map((x) => x.label).join(", ")}. Add the colour first with set_option_colours.` };
    choices[o.id] = v.id;
    view[o.label] = `${v.label} ${v.value}`;
    byKey[optionKey(o)] = lc(v.value);
  }
  const missing = colourOpts.filter((o) => !choices[o.id]);
  if (missing.length) return { error: `Give a colour for every part. Missing: ${missing.map((o) => o.label).join(", ")}.` };
  return { choices, view, byKey };
}

const presetArgs = z.object({
  productId: uuid,
  /** Present = change this design (rename or recolour). */
  presetId: uuid.optional(),
  name: presetNameSchema,
  colours: z.array(z.object({ option: z.string().min(1).max(80), colour: z.string().min(1).max(60) })).min(1).max(20),
});
const savePreset = tool({
  name: "save_design_preset",
  kind: "write",
  description: "Propose a ready-made design (preset): a name and one colour for EVERY colour option, by option label and colour name (or hex). Give presetId to change an existing design. The colour must already be a choice of that option. Needs approval.",
  params: presetArgs,
  preview: async (a) => {
    const p = await load(a.productId);
    if (!p) return { error: "Product not found" };
    if (designerOnly(p)) return { error: "Designer products have no presets." };
    const picked = presetChoices(p, a.colours);
    if ("error" in picked) return picked;
    const old = a.presetId ? p.presets.find((d) => d.id === a.presetId) : null;
    if (a.presetId && !old) return { error: "That design does not exist. Use get_product_options." };
    if (p.presets.some((d) => d.id !== a.presetId && lc(d.name) === lc(a.name))) return { error: `A design called "${a.name}" already exists. Give its presetId to change it, or pick another name.` };
    if (!old && p.presets.length >= MAX_PRESETS_PER_PRODUCT) return { error: `This product already has ${MAX_PRESETS_PER_PRODUCT} designs.` };
    const before = old ? { name: old.name, ...Object.fromEntries(old.colours.map((c) => [c.label, c.hex])) } : null;
    const after = { name: a.name, ...picked.view };
    const sameColours = old && old.colours.length === Object.keys(picked.byKey).length && old.colours.every((c) => picked.byKey[c.key] === lc(c.hex));
    if (old && sameColours && lc(old.name) === lc(a.name)) return { error: "That design already looks like that." };
    return { summary: `${old ? "Change" : "Add"} design "${a.name}" on "${p.name}"`, before, after };
  },
  apply: async (a) => {
    const p = await load(a.productId);
    if (!p) return { ok: false, error: "Product not found" };
    const picked = presetChoices(p, a.colours);
    if ("error" in picked) return { ok: false, error: picked.error };
    const active = a.presetId ? (p.presets.find((d) => d.id === a.presetId)?.active ?? true) : true;
    const r = await savePresetAction({ productId: p.id, id: a.presetId, name: a.name, choices: picked.choices, active });
    return r.ok ? { ok: true, link: link(p.id) } : { ok: false, error: r.error };
  },
});

const presetVisibility = tool({
  name: "set_preset_visibility",
  kind: "write",
  description: "Propose showing or hiding a ready-made design for customers (hidden designs are kept, for example while a colour is out of stock). Needs approval.",
  params: z.object({ productId: uuid, presetId: uuid, visible: z.boolean() }),
  preview: async (a) => {
    const p = await load(a.productId);
    const d = p?.presets.find((x) => x.id === a.presetId);
    if (!p || !d) return { error: "Design not found. Use get_product_options." };
    if (d.active === a.visible) return { error: `"${d.name}" is already ${a.visible ? "shown" : "hidden"}.` };
    return { summary: `${a.visible ? "Show" : "Hide"} design "${d.name}"`, before: { visible: d.active }, after: { visible: a.visible } };
  },
  apply: async (a) => {
    const r = await setPresetActiveAction({ presetId: a.presetId, active: a.visible });
    return r.ok ? { ok: true, link: link(a.productId) } : { ok: false, error: r.error };
  },
});

const designMode = tool({
  name: "set_design_mode",
  kind: "write",
  description: `Propose how customers choose colours on a product: ${DESIGN_MODES.map((m) => `"${m}" (${DESIGN_MODE_LABEL[m]})`).join(", ")}. presets and both need at least one visible design. Needs approval.`,
  params: z.object({ productId: uuid, mode: z.enum(DESIGN_MODES) }),
  preview: async (a) => {
    const p = await load(a.productId);
    if (!p) return { error: "Product not found" };
    if (p.designMode === a.mode) return { error: `The product is already set to "${a.mode}".` };
    if (a.mode !== "custom" && !p.presets.some((d) => d.active)) return { error: "Add a design first (save_design_preset), then change the mode." };
    return { summary: `Customers on "${p.name}": ${DESIGN_MODE_LABEL[a.mode]}`, before: { designMode: p.designMode }, after: { designMode: a.mode } };
  },
  apply: async (a) => {
    const r = await saveDesignModeAction({ productId: a.productId, mode: a.mode });
    return r.ok ? { ok: true, link: link(a.productId) } : { ok: false, error: r.error };
  },
});

const optionColours = tool({
  name: "set_option_colours",
  kind: "write",
  description: "Propose adding and/or removing colours a colour option offers. Added colours must be in the shop's colour list (by name or hex); removed ones are named as the option lists them. Designs that use a removed colour stop being shown. Needs approval.",
  params: z.object({ productId: uuid, option: z.string().min(1).max(80), add: z.array(z.string().min(1).max(60)).max(24).default([]), remove: z.array(z.string().min(1).max(60)).max(24).default([]) }),
  preview: async (a) => {
    const p = await load(a.productId);
    if (!p) return { error: "Product not found" };
    const o = findOption(p, a.option);
    if ("error" in o) return o;
    if (o.type !== "color") return { error: `"${o.label}" is not a colour option.` };
    const inv = await inventoryOf();
    const adds: string[] = [];
    for (const ref of a.add) {
      const c = findStock(inv, ref);
      if (!c) return { error: `"${ref}" is not in the shop's colour list. Add it under Colours first. The list: ${inv.colours.map((x) => x.name).join(", ")}.` };
      if (!o.values.some((v) => lc(v.value) === lc(c.hex)) && !adds.includes(`${c.name} ${c.hex}`)) adds.push(`${c.name} ${c.hex}`);
    }
    const removes: string[] = [];
    for (const ref of a.remove) {
      const v = findValue(o, ref);
      if (!v) return { error: `"${o.label}" does not offer "${ref}".` };
      removes.push(`${v.label} ${v.value}`);
    }
    if (!adds.length && !removes.length) return { error: "Nothing to change: the colours are already like that." };
    const now = o.values.map((v) => `${v.label} ${v.value}`);
    const next = [...now.filter((x) => !removes.includes(x)), ...adds];
    if (!next.length) return { error: "An option must keep at least one colour." };
    const hit = p.presets.filter((d) => d.colours.some((c) => c.key === optionKey(o) && removes.some((r) => lc(r).endsWith(lc(c.hex)))));
    return { summary: `${o.label} on "${p.name}": ${[adds.length ? `add ${adds.length}` : "", removes.length ? `remove ${removes.length}` : ""].filter(Boolean).join(", ")}${hit.length ? ` (designs no longer shown: ${hit.map((d) => d.name).join(", ")})` : ""}`, before: { [o.label]: now }, after: { [o.label]: next } };
  },
  apply: async (a) => {
    const p = await load(a.productId);
    if (!p) return { ok: false, error: "Product not found" };
    const o = findOption(p, a.option);
    if ("error" in o || o.type !== "color") return { ok: false, error: "Option not found" };
    const inv = await inventoryOf();
    for (const ref of a.add) {
      const c = findStock(inv, ref);
      if (!c || o.values.some((v) => lc(v.value) === lc(c.hex))) continue;
      const r = await addOptionValueAction({ optionId: o.id, productId: p.id, label: c.name, value: c.hex });
      if (!r.ok) return { ok: false, error: r.error };
    }
    const ids = a.remove.map((ref) => findValue(o, ref)?.id).filter((x): x is string => Boolean(x));
    if (ids.length) {
      const r = await deleteOptionValuesAction({ valueIds: ids });
      if (!r.ok) return { ok: false, error: r.error };
    }
    return { ok: true, link: link(p.id) };
  },
});

const updateOption = tool({
  name: "update_option",
  kind: "write",
  description: "Propose renaming an option, making it required or optional, changing its extra price (pesos) or, for text, its maximum length. Only send what changes. Needs approval.",
  params: z.object({ productId: uuid, option: z.string().min(1).max(80), label: z.string().trim().min(1).max(60).optional(), required: z.boolean().optional(), pricePesos: pesos.optional(), maxLength: z.number().int().min(1).max(200).optional() }),
  preview: async (a) => {
    const p = await load(a.productId);
    if (!p) return { error: "Product not found" };
    const o = findOption(p, a.option);
    if ("error" in o) return o;
    if (a.maxLength !== undefined && o.type !== "text") return { error: "Only a text option has a maximum length." };
    const cur = { label: o.label, required: o.required, pricePesos: toPesos(o.priceDeltaCents), ...(o.type === "text" ? { maxLength: o.constraints.maxLen ?? 50 } : {}) };
    const next = { ...cur, ...(a.label !== undefined ? { label: a.label } : {}), ...(a.required !== undefined ? { required: a.required } : {}), ...(a.pricePesos !== undefined ? { pricePesos: a.pricePesos } : {}), ...(a.maxLength !== undefined ? { maxLength: a.maxLength } : {}) };
    const changed = (Object.keys(cur) as (keyof typeof cur)[]).filter((k) => JSON.stringify(cur[k]) !== JSON.stringify(next[k]));
    if (!changed.length) return { error: "That option is already like that." };
    return { summary: `Change option "${o.label}" on "${p.name}"`, before: Object.fromEntries(changed.map((k) => [k, cur[k]])), after: Object.fromEntries(changed.map((k) => [k, next[k]])) };
  },
  apply: async (a) => {
    const p = await load(a.productId);
    if (!p) return { ok: false, error: "Product not found" };
    const o = findOption(p, a.option);
    if ("error" in o) return { ok: false, error: o.error };
    const r = await updateOptionAction({ optionId: o.id, label: a.label ?? o.label, required: a.required ?? o.required, priceDelta: String(a.pricePesos ?? toPesos(o.priceDeltaCents)), maxLen: a.maxLength ?? (o.type === "text" ? o.constraints.maxLen : undefined) });
    return r.ok ? { ok: true, link: link(p.id) } : { ok: false, error: r.error };
  },
});

const updateChoice = tool({
  name: "update_choice",
  kind: "write",
  description: "Propose renaming one choice of an option (for example a colour's shop name) or changing its extra price (pesos). A colour's hex cannot change: add the new colour and remove the old one. Needs approval.",
  params: z.object({ productId: uuid, option: z.string().min(1).max(80), choice: z.string().min(1).max(60), label: z.string().trim().min(1).max(60).optional(), extraPesos: pesos.optional() }),
  preview: async (a) => {
    const p = await load(a.productId);
    if (!p) return { error: "Product not found" };
    const o = findOption(p, a.option);
    if ("error" in o) return o;
    const v = findValue(o, a.choice);
    if (!v) return { error: `"${o.label}" has no choice "${a.choice}".` };
    const cur = { label: v.label, extraPesos: toPesos(v.priceDeltaCents) };
    const next = { label: a.label ?? cur.label, extraPesos: a.extraPesos ?? cur.extraPesos };
    if (JSON.stringify(cur) === JSON.stringify(next)) return { error: "That choice is already like that." };
    return { summary: `Change "${v.label}" in "${o.label}"`, before: cur, after: next };
  },
  apply: async (a) => {
    const p = await load(a.productId);
    const o = p ? findOption(p, a.option) : { error: "Product not found" };
    if ("error" in o) return { ok: false, error: o.error };
    const v = findValue(o, a.choice);
    if (!v) return { ok: false, error: "Choice not found" };
    const r = await updateOptionValueAction({ valueId: v.id, label: a.label ?? v.label, priceDelta: String(a.extraPesos ?? toPesos(v.priceDeltaCents)) });
    return r.ok ? { ok: true, link: link(a.productId) } : { ok: false, error: r.error };
  },
});

const addOption = tool({
  name: "add_option",
  kind: "write",
  description: "Propose a new option customers choose: a size (choices with codes and extra prices), a short text (with a maximum length) or a single colour for the whole model (colours from the shop's list). Colour per part of a 3MF comes from 'detect' in the product editor instead. Needs approval.",
  params: z.object({
    productId: uuid,
    type: z.enum(["size", "text", "color"]),
    label: z.string().trim().min(1).max(60),
    required: z.boolean().default(false),
    pricePesos: pesos.default(0),
    maxLength: z.number().int().min(1).max(200).optional(),
    choices: z.array(z.object({ label: z.string().trim().min(1).max(60), extraPesos: pesos.default(0) })).max(24).default([]),
  }),
  preview: async (a) => {
    const p = await load(a.productId);
    if (!p) return { error: "Product not found" };
    if (designerOnly(p)) return { error: "Designer products take no other options." };
    if (p.options.some((o) => lc(o.label) === lc(a.label))) return { error: `There is already an option called "${a.label}".` };
    if (a.type !== "text" && !a.choices.length) return { error: "Give the choices." };
    if (a.type === "color") {
      const inv = await inventoryOf();
      const bad = a.choices.find((c) => !findStock(inv, c.label));
      if (bad) return { error: `"${bad.label}" is not in the shop's colour list.` };
    }
    return { summary: `Add ${a.type} option "${a.label}" to "${p.name}"`, before: null, after: { type: a.type, label: a.label, required: a.required, pricePesos: a.pricePesos, ...(a.type === "text" ? { maxLength: a.maxLength ?? 20 } : { choices: a.choices.map((c) => `${c.label}${c.extraPesos ? ` +₱${c.extraPesos}` : ""}`) }) } };
  },
  apply: async (a) => {
    const before = await load(a.productId);
    if (!before) return { ok: false, error: "Product not found" };
    const r = await addOptionAction({ productId: a.productId, type: a.type, label: a.label, required: a.required, priceDelta: String(a.pricePesos), ...(a.type === "text" ? { maxLen: a.maxLength ?? 20 } : {}) });
    if (!r.ok) return { ok: false, error: r.error };
    const after = await load(a.productId);
    const made = after?.options.find((o) => !before.options.some((b) => b.id === o.id) && o.label === a.label);
    if (!made) return { ok: false, error: "The option was added but could not be found again. Check the product editor." };
    const inv = a.type === "color" ? await inventoryOf() : null;
    for (const c of a.choices) {
      const stock = inv ? findStock(inv, c.label) : null;
      const value = stock ? stock.hex : c.label.toUpperCase().replace(/[^A-Z0-9]+/g, "-").slice(0, 60) || "OPT";
      const v = await addOptionValueAction({ optionId: made.id, productId: a.productId, label: stock?.name ?? c.label, value, priceDelta: String(c.extraPesos) });
      if (!v.ok) return { ok: false, error: `The option was added, but a choice failed: ${v.error}` };
    }
    return { ok: true, link: link(a.productId) };
  },
});

export const OPTION_TOOLS: Tool[] = [getOptions, savePreset, presetVisibility, designMode, optionColours, updateOption, updateChoice, addOption];
