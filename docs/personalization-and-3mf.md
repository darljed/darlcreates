# Personalizing existing products + 3MF support

Status: **3MF upload + preview is built (2026-11-10, D-19).** Levels 2 and 3 have a **proof of concept (2026-11-11): see [name-on-model.md](./name-on-model.md)** (raised names on STL products). The rest of this page is still the original proposal. Raised 2026-11-10. Tracked as F-16 / F-17 in
[roadmap-and-gaps.md](./roadmap-and-gaps.md). Needs owner answers (bottom) first.

Two different things, both distinct from Phase 2:

| | What the customer does | Who makes the print file |
|---|---|---|
| **Catalog product** (built) | picks color/size | nobody, the STL is pre-made |
| **Personalized product** (this doc) | picks an existing product **and adds a name** | derived from the base file + the name |
| **Generated product** ([Phase 2](./phase-2-generators.md)) | designs a clicker/magnet/keychain from scratch | generated entirely from parameters |

## 1. Can we support 3MF as well as STL?

Yes. Facts, not guesses:

- `three` (installed) ships `3MFLoader`, and its zip dependency (`fflate`) is
  already in `node_modules`. The loader understands build items, transforms,
  components, base materials and color groups.
- **STL**: triangles only. No units, no color, no parts. Universal. The real
  Outdoor Phone Stand is 5.3 MB / 111k triangles as binary STL.
- **3MF**: zipped XML. Explicit units (mm), multiple named parts in one file, per-part
  color/material, metadata, and slicers (Bambu Studio, PrusaSlicer, Cura) open it
  natively.

Why it matters for you: a personalized order is naturally **two parts** (the base
product + the name). 3MF can carry both as separate objects so the slicer can print
the name in a different color or filament. A single STL can only merge them.

Recommendation:

1. **Keep STL as the default** for catalog products. Nothing to migrate.
2. **Accept 3MF as an alternate product file** (upload + preview). Small change:
   allow the extension, store `model/3mf`, pick the loader by extension in the viewer.
3. **Use 3MF as the output** for personalized orders (base + name as two objects).
4. Always keep the **original uploaded file** untouched for the admin download.

Risks to design for:
- Slicer-saved 3MF (esp. Bambu "project" files) include plates, settings and
  multiple objects. `3MFLoader` may not render every extension; fall back to the
  placeholder (the admin download still works). Test with your real files.
- Untrusted zip: cap size, parse only in the browser for preview, never unzip on the
  server without limits (zip bombs).
- The same centering/framing code applies (`viewer-framing.ts`); 3MF units differ
  from STL, which is another reason the viewer must stay size-independent.

## 2. Adding a name to an existing product

Three levels, each usable on its own. Recommendation: **ship level 1 now, build
level 2 next, level 3 only if volume justifies it.**

### Level 1: manual (works today)
The `text` option already exists (max length, allowed characters, price add-on).
Customer enters the name; the admin order page shows it; **you** add the name in your
slicer/CAD and print. No new code beyond making the name very visible on the admin
order page. Zero risk, slowest per order.

### Level 2: live 3D name preview (recommended next)
Per product, the admin defines a **text slot**: where the name goes (position and
facing direction on the model), max width/height, depth, raised or engraved.
The customer types a name and **sees it on the model in the 3D viewer**, so the
customer knows exactly what they are buying. Uses `TextGeometry` + a bundled font.
Still printed by hand (or from the level 3 file). This is mostly a viewer and admin
slot-editor feature.

### Level 3: auto-generated print file
At order time the server rebuilds the name mesh from the saved text + slot and writes
a **3MF**: object 1 = base product (unchanged), object 2 = name. Download it, slice,
print.
- **Raised (embossed) name**: just geometry, add it overlapping the surface a little.
  Slicers merge overlapping shells when slicing. No boolean math.
- **Engraved (debossed) name**: needs subtraction from the base mesh (CSG). That
  means a CSG/WASM library (for example `manifold-3d`), a real dependency and test
  surface. Defer unless you need engraving.
- Must **regenerate on the server** from parameters; never trust a client-built mesh.
- The admin still reviews the file before printing (same rule as Phase 2).

### Constraints that will bite (design for them)
- **Curved or sloped surfaces**: a flat text slot is easy; text wrapped onto a curve is
  not. Start with products that have a flat area for the name.
- **Printability of text**: minimum stroke width and height, so thin letters don't
  fail. Enforce a minimum font size and a heavy font per slot.
- **Fonts**: three's `TextGeometry` needs a typeface JSON font, and none is bundled in
  `node_modules` here. Pick one font with a license that allows embedding and convert it.
  Latin letters/digits first; restrict the character set (the existing `pattern`
  constraint already supports this).
- **Moderation**: offensive text before it reaches the printer queue.
- **Pricing**: the existing option `priceDelta` covers a flat personalization fee; a
  per-character price needs a small extension.

## 3. How this relates to Phase 2

Levels 2 and 3 build the pieces Phase 2 needs anyway (text-to-mesh, validators,
server regeneration, 3MF output, admin download). Doing personalization first de-risks
the generators: one fixed base mesh and one text slot is a much smaller problem than
parametric geometry from scratch.

## Questions for the owner (answers decide the design)

1. Which existing products need a name first? Do they have a **flat area** for it?
2. **Raised or engraved** letters?
3. Same color as the product, or a **contrasting color** (needs 3MF and a multi-color
   printer/AMS)?
4. Which slicer do you use? (Bambu Studio / Prusa / Cura: affects the 3MF details.)
5. Fixed font, or let the customer choose from a few?
6. Allowed characters (letters/digits only? spaces? emoji?) and max length per product.
7. Flat personalization fee, or per-character pricing?

Last updated: 2026-11-10
