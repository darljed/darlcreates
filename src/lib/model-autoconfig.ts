/**
 * Auto-configure a product from the 3MF the owner just uploaded. Framework-free (DB + S3 only), so scripts and tests
 * can run it. For a slicer project (Bambu Studio / Orca) it:
 *   - finds the designer's example text, saves its spot, size and depth as the product's name slot (creating a "Name"
 *     text option when there is none) and attaches a copy of the model WITHOUT the example, so neither the preview nor
 *     the print file shows it;
 *   - reads the project's filament colours and, when the product has no colour option yet, creates "Colors" from them;
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
import { checkFit, detectNameSlot, fitScale, open3mf, projectFilaments, shrinkSlot, stripPlaceholder, threeMfSurface } from "./name-3mf";
import { buildKey, getObject, putObject } from "./storage";

export type AutoConfig = {
  /** The model now attached to the product (a cleaned copy when an example was removed). */
  modelKey: string;
  detected: { text: string; fontName: string; mode: "raised" | "engraved"; widthMm: number; heightMm: number; depthMm: number } | null;
  slotSaved: boolean;
  textOptionCreated: boolean;
  colours: { added: string[]; kept: boolean };
  notes: string[];
};

const NAME_PATTERN = "^[A-Za-z0-9 ]*$";

export async function autoConfigureModel(productId: string, key: string): Promise<AutoConfig> {
  const out: AutoConfig = { modelKey: key, detected: null, slotSaved: false, textOptionCreated: false, colours: { added: [], kept: false }, notes: [] };
  if (!/\.3mf$/i.test(key)) return out; // an STL has no parts, no text element and no filament list: nothing to read

  const obj = await getObject(key);
  if (!obj) {
    out.notes.push("The uploaded file could not be read back for auto-configuration.");
    return out;
  }
  let files: ReturnType<typeof open3mf>;
  try {
    files = open3mf(await new Response(obj.stream).arrayBuffer());
  } catch (e) {
    out.notes.push(`Auto-configuration skipped: ${e instanceof Error ? e.message : "unreadable 3MF"}.`);
    return out;
  }

  // --- the example text -> name slot -----------------------------------------------------------------------------
  let slot: NameSlot | null = null;
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
      const clean = stripPlaceholder(files, det.componentIndex);
      const surface = threeMfSurface(clean).mesh;
      slot = det.slot;
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
      // attach the model without the example; the original upload stays in storage
      const cleaned = zipSync(clean, { level: 1 });
      const cleanKey = buildKey("model", "name-ready.3mf");
      await putObject(cleanKey, cleaned, "model/3mf");
      await db.update(products).set({ stlKey: cleanKey, updatedAt: new Date() }).where(eq(products.id, productId));
      out.modelKey = cleanKey;
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

  // --- filament colours -> colour option -------------------------------------------------------------------------
  const filaments = [...new Set(projectFilaments(files).map((c) => c.toUpperCase()))];
  if (filaments.length) {
    const [hasColour] = await db
      .select({ id: productOptions.id })
      .from(productOptions)
      .where(and(eq(productOptions.productId, productId), eq(productOptions.type, "color")))
      .limit(1);
    if (hasColour) out.colours.kept = true;
    else {
      const all = await db.select({ sort: productOptions.sort }).from(productOptions).where(eq(productOptions.productId, productId));
      const [opt] = await db
        .insert(productOptions)
        .values({ productId, type: "color", label: "Colors", required: true, priceDeltaCents: 0, constraints: {}, sort: all.reduce((m, r) => Math.max(m, r.sort + 1), 0) })
        .returning({ id: productOptions.id });
      const used = new Map<string, number>();
      const rows = filaments.map((hex, i) => {
        const base = colorName(hex);
        const n = (used.get(base) ?? 0) + 1;
        used.set(base, n);
        return { optionId: opt.id, label: n > 1 ? `${base} ${n}` : base, value: hex, sort: i };
      });
      await db.insert(productOptionValues).values(rows);
      out.colours.added = rows.map((r) => r.label);
    }
  }
  return out;
}
