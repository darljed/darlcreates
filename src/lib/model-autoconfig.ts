/**
 * Auto-configure a product from the 3MF the owner just uploaded. Framework-free (DB + S3 only), so scripts and tests
 * can run it. For a slicer project (Bambu Studio / Orca) it:
 *   - finds the designer's example text, saves its spot, size and depth as the product's name slot (creating a "Name"
 *     text option when there is none) and attaches a copy of the model WITHOUT the example, so neither the preview nor
 *     the print file shows it;
 *   - reads the project's filament colours and, when the product has no colour option yet, creates "Colors" from them,
 *     or, when the model is made of two or more parts in different filaments (a ball and its holder), one colour option
 *     per part so each can be coloured on its own (stored copy named for the 3D viewer, see `annotateGroups`);
 *   - keeps the name's own colour when the designer printed the example in a different filament than the model.
 * Existing options are never overwritten except the name slot of the text option (a new model means a new spot).
 * Anything it cannot understand is reported in `notes` and left for the admin; the original file stays attached.
 */
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { productOptions, productOptionValues, products } from "@/db/schema";
import { zipSync } from "fflate";
import { colorName } from "./color-name";
import { fontChoices, slotMaxHeight, type NameSlot } from "./name-mesh";
import { checkFit, detectNameSlot, fitScale, MIN_WALL_BEHIND_MM, open3mf, projectFilaments, shrinkSlot, stripPlaceholder, threeMfSurface, wallThickness } from "./name-3mf";
import { annotateGroups, colorGroups, groupMeshName, type Files } from "./threemf";
import { buildKey, getObject, putObject } from "./storage";

export type AutoConfig = {
  /** The model now attached to the product (a cleaned copy when an example was removed). */
  modelKey: string;
  detected: { text: string; fontName: string; mode: "raised" | "engraved"; widthMm: number; heightMm: number; depthMm: number } | null;
  slotSaved: boolean;
  textOptionCreated: boolean;
  colours: { added: string[]; kept: boolean; /** parts that got their own colour option */ parts: string[] };
  notes: string[];
};

const NAME_PATTERN = "^[A-Za-z0-9 ]*$";

export async function autoConfigureModel(productId: string, key: string): Promise<AutoConfig> {
  const out: AutoConfig = { modelKey: key, detected: null, slotSaved: false, textOptionCreated: false, colours: { added: [], kept: false, parts: [] }, notes: [] };
  if (!/\.3mf$/i.test(key)) return out; // an STL has no parts, no text element and no filament list: nothing to read

  const obj = await getObject(key);
  if (!obj) {
    out.notes.push("The uploaded file could not be read back for auto-configuration.");
    return out;
  }
  let files: Files;
  try {
    files = open3mf(await new Response(obj.stream).arrayBuffer());
  } catch (e) {
    out.notes.push(`Auto-configuration skipped: ${e instanceof Error ? e.message : "unreadable 3MF"}.`);
    return out;
  }

  // --- the example text -> name slot -----------------------------------------------------------------------------
  let slot: NameSlot | null = null;
  let stored: Files = files; // what the product will use: the model without the example, named for the viewer
  let strippedExample = false;
  try {
    const det = detectNameSlot(files);
    if (det) {
      out.detected = {
        text: det.text,
        fontName: det.fontName,
        mode: det.mode,
        widthMm: det.slot.maxWidth,
        heightMm: det.slot.height,
        depthMm: det.slot.depth,
      };
      out.notes.push(...det.notes);
      const clean = stripPlaceholder(files, det.objectId, det.componentIndex);
      const surface = threeMfSurface(clean).mesh;
      slot = det.slot;
      // with two or more filaments the customer can pick the name's colour from them (filament number kept for the print file)
      if (det.filaments.length >= 2 && det.mode === "raised") {
        const seen = new Set<string>();
        const colours: { label: string; hex: string; filament: number }[] = [];
        const used = new Map<string, number>();
        det.filaments.forEach((hex, i) => {
          const key = hex.toUpperCase();
          if (seen.has(key)) return;
          seen.add(key);
          const base = colorName(hex);
          const n = (used.get(base) ?? 0) + 1;
          used.set(base, n);
          colours.push({ label: n > 1 ? `${base} ${n}` : base, hex, filament: i + 1 });
        });
        slot = { ...slot, nameColors: colours.slice(0, 12) };
      }
      if (!checkFit(surface, slot, slot.maxWidth, slotMaxHeight(slot)).fits) {
        const k = fitScale(surface, slot);
        if (k) {
          const smaller = shrinkSlot(slot, k);
          out.notes.push(`The example hung over the edge of the surface, so the name area was reduced from ${slot.maxWidth} × ${slotMaxHeight(slot)} mm to ${smaller.maxWidth} × ${smaller.maxHeight} mm.`);
          slot = smaller;
        } else {
          out.notes.push("The example text does not sit on the surface, so no name position was saved. Click the model to place it.");
          slot = null;
        }
      }
      stored = clean;
      strippedExample = true;
      if (slot?.mode === "engraved") {
        // an engraving must leave wall behind it
        const wall = wallThickness(surface, slot, slot.maxWidth, slotMaxHeight(slot));
        const room = wall === null ? null : Math.floor((wall - MIN_WALL_BEHIND_MM) * 10) / 10;
        if (room === null) out.notes.push("Could not tell how thick the model is behind the example, so the engraving depth was not checked.");
        else if (slot.depth > room) {
          if (room >= 0.6) {
            out.notes.push(`The model is ${wall} mm thick behind the example, so the engraving depth was reduced from ${slot.depth} mm to ${room} mm.`);
            slot = { ...slot, depth: room };
          } else {
            out.notes.push(`The model is only ${wall} mm thick behind the example, too thin to engrave. No name position was saved.`);
            slot = null;
          }
        }
      }
    }
  } catch (e) {
    out.notes.push(`The example text could not be used: ${e instanceof Error ? e.message : "unknown error"}.`);
    slot = null;
  }

  if (slot) {
    const texts = await db
      .select()
      .from(productOptions)
      .where(and(eq(productOptions.productId, productId), eq(productOptions.type, "text")))
      .orderBy(asc(productOptions.sort));
    const existing = texts[0];
    if (existing) {
      await db.update(productOptions).set({ constraints: { ...(existing.constraints as object), slot } }).where(eq(productOptions.id, existing.id));
    } else {
      const all = await db.select({ sort: productOptions.sort }).from(productOptions).where(eq(productOptions.productId, productId));
      await db.insert(productOptions).values({
        productId,
        type: "text",
        label: "Name",
        required: false,
        priceDeltaCents: 0,
        constraints: { maxLen: 12, pattern: NAME_PATTERN, slot },
        sort: all.reduce((m, r) => Math.max(m, r.sort + 1), 0),
      });
      out.textOptionCreated = true;
    }
    out.slotSaved = true;
    if (fontChoices(slot).length > 1) out.notes.push(`Customers can choose between ${fontChoices(slot).length} fonts (change this under "Name on the model").`);
  }

  // --- colour groups + filament colours -> colour options ---------------------------------------------------------
  const filaments = [...new Set(projectFilaments(files).map((c) => c.toUpperCase()))];
  const groups = colorGroups(stored).slice(0, 6);
  const annotated = annotateGroups(stored, groups);
  if (annotated.skipped.length) out.notes.push(`Parts of the model share one mesh (${annotated.skipped.map((g) => groups[g].label).join(", ")}), so they cannot be coloured separately.`);
  if (strippedExample || annotated.named.length >= 2 || annotated.hidden) {
    const cleanKey = buildKey("model", "model-ready.3mf");
    await putObject(cleanKey, zipSync(annotated.files, { level: 1 }), "model/3mf");
    await db.update(products).set({ stlKey: cleanKey, updatedAt: new Date() }).where(eq(products.id, productId));
    out.modelKey = cleanKey;
  }

  if (filaments.length) {
    const [hasColour] = await db
      .select({ id: productOptions.id })
      .from(productOptions)
      .where(and(eq(productOptions.productId, productId), eq(productOptions.type, "color")))
      .limit(1);
    if (hasColour) out.colours.kept = true;
    else {
      const names = new Map<string, number>();
      const swatches = filaments.map((hex, i) => {
        const base = colorName(hex);
        const n = (names.get(base) ?? 0) + 1;
        names.set(base, n);
        return { label: n > 1 ? `${base} ${n}` : base, value: hex, sort: i };
      });
      // filament number for each colour (the first filament with that colour)
      const projectList = projectFilaments(files).map((c) => c.toUpperCase());
      const filamentOf: Record<string, number> = {};
      projectList.forEach((hex, i) => { if (!(hex in filamentOf)) filamentOf[hex] = i + 1; });
      const startSort = (await db.select({ sort: productOptions.sort }).from(productOptions).where(eq(productOptions.productId, productId))).reduce((m, r) => Math.max(m, r.sort + 1), 0);

      // one option per colour group when a part of the model can be coloured on its own, else one "Colors" for all
      const perPart = annotated.named.length >= 2;
      const specs = perPart
        ? annotated.named.map((gi) => ({
            label: `${groups[gi].label} colour`,
            constraints: { partName: groupMeshName(gi), parts: groups[gi].parts, filaments: filamentOf, defaultHex: projectList[groups[gi].filament - 1] },
          }))
        : [{ label: "Colors", constraints: groups.length === 1 ? { parts: groups[0].parts, filaments: filamentOf, defaultHex: projectList[groups[0].filament - 1] } : {} }];
      let sort = startSort;
      for (const spec of specs) {
        const [opt] = await db
          .insert(productOptions)
          .values({ productId, type: "color", label: spec.label, required: true, priceDeltaCents: 0, constraints: spec.constraints, sort: sort++ })
          .returning({ id: productOptions.id });
        await db.insert(productOptionValues).values(swatches.map((r) => ({ optionId: opt.id, ...r })));
        out.colours.added = swatches.map((r) => r.label);
        if (perPart) out.colours.parts.push(spec.label);
      }
    }
  }
  return out;
}
