# Name on the model (Phase 2, proof of concept)

> Status: **proof of concept, built 2026-11-11 on branch `feat/name-personalization`; upload auto-configuration and a customer font picker added the same day.** Covers levels 2 and 3 of [personalization-and-3mf.md](./personalization-and-3mf.md): a live 3D name preview for the customer, and a print file the server builds from the saved name. Raised letters on **STL** products and on **slicer 3MF projects** (Bambu Studio style). Tried on the real Outdoor Phone Stand (3MF) the same day. Read "Limits" before relying on it.

## What it does

1. **Admin places a slot.** Product → Edit → "Name on the model". The 3D model is shown; click the surface where the name should go. Set the font, letter height, widest name, how far the letters stand out and how far they sink in, and rotate them. A sample name is drawn live. **Save position** first checks that a name of the widest allowed size sits fully on the surface there (see "Fit check"), then stores it on the product's text option (`product_options.constraints.slot`, no migration).
2. **Customer sees the name on the model.** On the product page, typing in that text option draws the letters on the 3D model as they type. A name that cannot be printed (letter missing from the font, so long its strokes would be too thin) shows a plain message and disables **Add to cart**. Long names shrink to fit the width; the page says so.
3. **The server checks it again** when the item is added to the cart (`cart-service.ts`, same code, server's own copy of the font), so an order never reaches the workshop with a name that cannot be made.
4. **Admin downloads one file.** On the order page the item's link reads "Download 3MF with the name “Maria”". The server reads the product's original STL from S3, rebuilds the letters from the saved text, and returns a **3MF with two objects: `Base` and `Name: Maria`**, in millimetres. The slicer can give the name its own colour or filament. The file is built per request and not stored.

## How it works

| Piece | File | Notes |
|---|---|---|
| Text → raised-letter mesh, slot maths, printability checks | `src/lib/name-mesh.ts` | Pure and isomorphic: the product page, the admin editor and the server run the same code. `opentype.js` reads the font file, `three` extrudes the outlines (`ExtrudeGeometry`) |
| Fonts | `public/fonts/` | `Poppins-ExtraBold.ttf` ("Bold") and `LilitaOne-Regular.ttf` ("Chunky"), both SIL Open Font License (licence files alongside). Only heavy faces: thin strokes do not print. Served to the browser, read from disk by the server |
| Browser font loading, hook | `src/lib/name-font-client.ts`, `src/components/use-name-build.ts` | Font fetched once; geometry rebuilt on each keystroke; old geometry freed |
| Server print file | `src/lib/name-3mf.ts` | `readStlMesh`, `writeThreeMf` (STL base: new package, Base + Name as parts of one object), `open3mf` / `threeMfSurface` / `addNameTo3mf` (3MF base), `checkFit`, `widestThatFits`, `buildPrintFile`, `nameProblem` (uses `fflate`) |
| Viewer overlay and click-to-place | `src/components/three/stl-viewer.tsx` | `overlay` draws the letters in file coordinates; `onPick` reports the clicked point and surface direction |
| Admin editor and action | `src/components/admin/name-slot-editor.tsx`, `saveNameSlotAction` | Zod-validated; STL or 3MF products; text options only; runs the fit check |
| Download route | `src/app/(admin)/admin/orders/[id]/stl/[itemId]/route.ts` | Builds the 3MF when the product has a slot and the customer typed a name; otherwise redirects to the original file as before |

### The slot (`constraints.slot` on a text option)

| Field | Meaning |
|---|---|
| `position` | Centre of the name on the surface, **in the model file's own coordinates** (mm, Z up) |
| `normal` | Direction the surface faces, out of the model (unit vector) |
| `up` | Which way is up for the letters, along the surface (unit vector) |
| `maxWidth`, `maxHeight`, `height`, `depth`, `sink` | Widest and tallest the name's **ink** may be (mm; `maxHeight` counts ascenders and descenders and defaults to 1.5 × `height` for older slots), wanted capital-letter height (mm), how far letters stand out (mm), how far they sink into the surface (mm) |
| `font` | `bold` or `chunky` |

The letters are sunk a little (default 0.4 mm) so a slicer merges them with the base: **raised text needs no boolean (CSG) maths**. A right-handed frame (x = up × normal) guarantees the name reads left to right when seen from outside, on a top face and on a side wall (tested).

### Printability rules (`PRINT_LIMITS`)

- Capital height ≥ 3 mm and stroke width ≥ 0.8 mm (two lines of a 0.4 mm nozzle). The stroke is the **average stroke width of the actual letters**, 2 × area ÷ perimeter of the outlines (holes subtracted), at the final scale, so it shrinks as a long name is squeezed into `maxWidth`. It is an average, not a minimum: hairline joins in a script font would not show up. The Script font is the thinnest ("Ana" at 6 mm is 0.81 mm), and it refuses a name such as "Maria Cruz" at 40 mm wide.
- Stand-out between 0.6 and 5 mm.
- The name mesh is checked to be watertight (every edge shared by two triangles); the check result is in the build report.

### 3MF products (slicer projects)

A slicer project such as Bambu Studio's keeps the geometry in a second file (`3D/Objects/object_3.model`) and one **plate object made of components** (the stand has two bodies), placed on the plate by a build-item transform (the stand sits at 128, 128). The viewer and the slot use **build space** (item and component transforms applied). `addNameTo3mf` therefore:
- adds the name as a new mesh object in the root model, defined before the plate object, and as one more `component` of it. The name is moved from build space into the plate object's own space by undoing the item transform;
- adds `p:UUID`s when the file declares the production extension;
- adds a matching `<part>` to `Metadata/model_settings.config` so Bambu's part list lines up;
- leaves every other file (thumbnails, settings, pictures, the geometry file) untouched.

Layouts it does not understand are refused with a message, never guessed: more than one object on the plate, or a plate object that is a plain mesh with no parts.

Checked against the real Outdoor Phone Stand: reads in 0.24 s (111,530 triangles, matches the file's own face count), and the output loads in an independent parser (`trimesh`) with the name part watertight at x 117.6–138.4, y 118.5–122.0, z 21.5–27.5, exactly where the slot says, with both original bodies intact. **It has not been opened in Bambu Studio or Orca**: please open one print file and confirm the name appears as a part of the object.

### Fit check (`checkFit`)

At save time the server casts rays down onto the model from nine points over the **name rectangle** (`maxWidth` × `maxHeight`: centre, corners, edge midpoints). Each must find the surface within 0.7 mm of the slot plane, otherwise the name would hang over an edge, over a hole, or start inside a wall. If it fails the admin is told how far to shrink the rectangle (`fitScale` / `shrinkSlot`), for example "Set Widest name to 24 mm and Tallest name to 8 mm or less". `buildName` scales every name so its **whole outline** fits inside that rectangle and centres the ink in it, so any name in any offered font stays on the checked area.

**Bug fixed 2026-11-11 (Script font overflowed the model):** the first version checked only a `maxWidth` × capital-height band and centred on the capital band. Script (Pacifico) has deep descenders and tall loops, so a name such as "Gypsy" reached 7.6 mm below the centre line (11.3 mm of ink against a 10.3 mm area) and ran off the surface; the check had also been run for the default font only. Now the rectangle is the ink box, set from the designer's example (23.57 × 10.28 mm for the v2 stand), and verified for every font and for names with tails (`test-name-mesh.ts`).

On the stand the default 40 mm × 6 mm box hung off the surface at the first spot tried ("3 of 9 points over empty space"). A search over the largest flat areas found 28 to 30 mm wide spots on the top deck, the wall, and the sloped front of the backrest; the sloped front was used.

## Upload auto-configuration

When the owner uploads a **3MF** (Admin → Products → Files), `attachModelAction` calls `autoConfigureModel` (`src/lib/model-autoconfig.ts`) and reports what it did in toasts. Nothing blocks the upload; if anything cannot be read the file is attached as uploaded and a note says why.

| It reads | It does | If it cannot |
|---|---|---|
| The designer's text element (`text_info` in `model_settings.config`) | Saves its spot, size, depth and facing as the **name slot** on the product's first text option (creates a "Name" text option, optional, max 12 letters, letters/digits/space, if there is none); removes the example from the model and attaches the cleaned copy (`models/<id>-name-ready.3mf`; the original upload stays in storage); picks the closest of our fonts to the designer's font and offers it plus Bold and Chunky; shrinks the widest name if the example hung over the edge | Notes it and leaves the slot for the admin to click |
| The project's filament colours (`project_settings.config`) | If the product has **no colour option**, creates "Colors" with one swatch per distinct filament (Pink, Cream, Red…), named by `colorName()` | Existing colour options are never touched |
| Which filament the example uses vs the model | If different, the slot keeps `nameColor` (hex + filament number): the preview draws the name in that colour and the print file gives the name part that filament | Same filament = no own colour: the name follows the model |

A second upload to the same product refreshes the slot and does not duplicate options. STL uploads are not changed (no parts, no text element, no filament list).

Checked: `scripts/test-model-autoconfig.ts` (DB + S3, synthetic Bambu-style file), and by uploading the owner's real `phonestand_v2_name.3mf` through the admin in a browser: it reported the example "Cams" (raised, 23.6 × 10.3 mm), saved the position, removed the example, added Colors Pink / Cream / Red and offered 3 fonts.

## Fonts

Six heavy fonts are bundled in `public/fonts` (Bold = Poppins ExtraBold, Chunky = Lilita One, Marker = Permanent Marker, Modern = Righteous, Condensed = Anton, Script = Pacifico), all OFL except Permanent Marker (Apache 2.0); licence files are alongside. Bangers was tried and dropped: `opentype.js` cannot read its GSUB table. A font that `opentype.js` cannot parse must not be added; test it with `test-name-mesh.ts`.
- **Admin:** "Name on the model" has the default Font and "Fonts customers can choose". Two or more ticked fonts show a picker; one means no choice.
- **Customer:** a **Font** select under the Name box redraws the name on the model immediately. The choice is stored in the cart/order config (`font`), validated against the slot's offered list (anything else is dropped), shown in the order summary ("Maria (Chunky font)"), checked for printability with that font on add-to-cart, and used for the print file.
- Verified with a real order: the Chunky name part has 1,772 triangles against 1,080 for Bold.
- Latin letters only (`opentype.js` does no complex-script shaping). A font used in the slicer cannot be reproduced unless its file is added here.

## Tests

`npx tsx scripts/test-name-mesh.ts` (no DB, no network): slot validation, left-to-right orientation on a top face and a side wall, position and thickness, width fit, refusal of unprintable names, both fonts, 3MF structure (content types, relationships, two objects, triangle counts, indices in range), XML escaping, `slotOf` / `personalizedName` / `nameProblem`.

Also covered: the Bambu-style layout built in the test (two components, external geometry file, item translation), refusals of unsupported layouts, and the fit check on a cube and a side wall.

Browser-checked on 2026-11-11 against a throwaway "20 mm cube" product (`scripts/e2e-session.ts setup` now creates it): admin click-to-place and save (persisted after reload), customer live preview, too-long name disables the button, add to cart, order, and the admin download returns `model/3mf` (11 KB) with the right link label.

## Live trial: Outdoor Phone Stand

On 2026-11-11 the **Outdoor Phone Stand** (a 3MF) got a name slot on the sloped front of its backrest: position (128, 120.5, 24), facing (0, −0.94, 0.34), 5 mm Bold letters, widest name 28 mm, 1.2 mm raised. Its existing required "Name" option (max 8 characters, +₱10.00) is the one customers type into, so **customers on the public product page now see their name on the model**. The spot was chosen by a search for large flat areas plus the fit check, and set by a script; move it in Admin → Products → Outdoor Phone Stand → Name on the model, or press **Remove** to switch the preview and the 3MF off (orders then download the original file again). An 8-letter name of wide letters (for example "WWWWWWWW") is refused as too long to print clearly; typical names fit.

## Next: configuring the slot from the 3MF, fonts and colour, engraving (design, not built)

Raised by the owner on 2026-11-11 after the proof of concept worked. Nothing here is built yet.

### 1. Where the text goes: detect it from an example placed in the 3MF
Today the position is set by clicking in the admin and is stored in our database, not in the 3MF. Nothing needs configuring in the 3MF. To detect it on upload instead, the designer places an **example** in the slicer and we read it (STL has no parts, so STL keeps click-to-place):
- **Marker part (works in any slicer, no sample needed).** Add a part with a reserved name (for example `NAME`), a thin box where the text should be. We read its oriented bounding box: centre = position, thin axis = facing (the side with free space outside the model, by ray test), long axis = up, size = widest name and letter height, thickness = depth. The marker is then excluded from the preview and the print file.
- **Slicer text element** (Bambu Studio text tool). The slicer stores the text, font, size and depth in `Metadata/model_settings.config` and the text part's geometry/transform in the model, so position, facing, up, size and depth can be read exactly, and the part type gives the mode (normal part = raised, negative part = engraved). **Built as `detectNameSlot` / `stripPlaceholder` in `name-3mf.ts` and checked on a real file (below); not yet wired to the upload step.**
- Either way the detected values pre-fill the slot at upload; the admin confirms or adjusts in the editor. Re-detect when the model is replaced.

#### Checked on the owner's `phonestand_v2_name.3mf` (Bambu Studio, X2D printer)
- The file has one plate object of two components: the stand (`Stand - 14mm.stl`, **523,006 triangles**) and a part named `text_shape` (2,464 faces) with `<text_info text="Cams" font_name="Marker Felt" font_size="12" thickness="1" embeded_depth="0" rotate_angle="-90" …/>`. The part type is `normal_part`, so the example is **raised**.
- The text mesh lies on its local XY plane (reads along +X, up is +Y) and is extruded along +Z (z 0 to 0.99 mm). Under the plate item's 90° rotation the detector reads: position (113.26, 137.12, 28), facing +Z, up +X, **23.57 mm wide, 10.28 mm tall, 0.99 mm deep**. The surface under the example is flat and exactly at z = 28 (all nine fit samples 0.00 mm), so the detected spot passes the fit check as is.
- Gotcha handled: the part `matrix` in `model_settings.config` is in the slicer's own frame and does **not** equal the component transform in `3D/3dmodel.model` (translations differ). The geometry transform in the model file is the one used. The part list and the component list are in the same order, and the part's `face_count` is checked against the mesh before trusting the match.
- `stripPlaceholder` removes the example (component, mesh object, part entry): 525,470 → 523,006 triangles, still watertight. With the placeholder gone, "Maria" built from it as a customer name sits on the stand's top at z 27.6 to 29.0 (letters shrunk to 5.7 mm to fit the 23.57 mm width), loads in `trimesh`, and the example "Cams" is gone.
- Timings on the server for this 44 MB-of-XML model: read 0.8 s, detect 1.3 s, strip and re-zip 1.9 s, build the print file 2.1 s, fit check 0.1 s.
- **Heavy for the browser:** the product page took about 12 s to show this model in development, with about 166 MB of JavaScript heap. Fine on a laptop, risky on a phone. A lighter preview model (decimated copy, or a simplified 3MF/STL used only for display) is recommended; see G-86.
- Font: the example uses Marker Felt (an Apple font, not redistributable). Our fonts are used; the admin sees which font the designer chose.

### 2. Font and colour
- **Font:** yes. More heavy OFL fonts can be bundled (a file in `public/fonts` plus an entry in `NAME_FONTS`), the product can allow a list, and the customer can pick one (the preview loads it on demand). An admin upload of the owner's own TTF/OTF is possible (licence is the owner's responsibility). Latin text only: `opentype.js` does no complex-script shaping. A slicer text element's font cannot be reproduced unless we have the file; it would be mapped to a bundled font or uploaded.
- **Colour:** printing colour is a filament choice. In a Bambu 3MF it is the part's `extruder` (we already write `1`); we can set the name part to another AMS slot, per product or from a "Name colour" option whose swatches map to slots. `Metadata/project_settings.config` lists the project's real filament colours (`filament_colour`; the v2 file has three: `#F95D73`, `#F7E6DE`, `#FF0000`, and the text part uses filament 1), so swatches can be pre-filled from the file. Printers without an AMS would need a manual colour change. The preview already draws the name in a darker shade; it would use the chosen swatch.

### 3. Engraved text
- **Recommended: a negative part.** Add the name to the object as a **negative part** (Bambu/Orca/PrusaSlicer all have the type; Bambu: Change Type → Negative Part) and the slicer subtracts it at slice time. No CSG library, and the cut depth is simply the depth of our letter mesh, so the admin controls it. If the designer's example is a negative text/part, detect mode = engraved and depth from it. Placement uses the same slot.
- **Fallback for STL (no slicer config to hold a negative part): real CSG** with `manifold-3d` (WASM) on the server, which writes a plain cut mesh any slicer reads. Heavier: for a 3MF the cut has to be written back into the geometry file.
- **Safety check:** cast the existing rays *into* the model to measure the wall behind the surface; refuse a depth that leaves less than about 0.8 mm (it would break through).
- **Preview:** a true engraved preview needs CSG in the browser on a small patch of the model; the cheap version draws the letters as a dark recess-coloured decal on the surface.
- Known Bambu quirk: colour painting inside negative text can misbehave (BambuStudio issue #8984); not relevant unless text is also multi-coloured.

### Suggested order
A. ~~Wire text-element detection into the upload step~~ (done 2026-11-11, with fonts and colours). Marker-part detection (any slicer) is still to do. B. Engraved mode (negative part, wall-thickness check, decal preview). C. ~~More fonts, allow-list, customer font picker~~ (done). D. Customer-chosen name colour mapped to filament slots (a fixed contrasting colour from the file is done). E. A negative-part sample, to confirm the engraved subtype. A lighter preview model for big files. Snapshot the slot per order (G-80) before real orders depend on any of it.

## Limits (what this proof of concept does not do)

| Gap | Why it matters / next step |
|---|---|
| ~~No check that the name stays on the surface~~ | Done for the widest name at save time (see "Fit check"). Not yet re-checked per order; the slot is not snapshotted (next row) |
| **Slot is read from the product at download time** | If the owner moves the slot after an order, the old order's file changes. Next: snapshot the slot (and font) on the order item when it is placed |
| **3MF layouts** | Works for a single plate object built from parts (Bambu, Orca, PrusaSlicer). A plain-mesh 3MF or several objects on the plate is refused. Not yet opened in a real slicer |
| **Raised text only** | Engraved text needs subtraction from the base mesh (CSG, for example `manifold-3d`) |
| **Flat or gently sloped faces** | Letters are a flat sheet placed on one plane; they are not wrapped onto curves |
| **Colour** | The name is a separate object so the slicer can colour it, but the preview draws it as a darker shade of the model. Which filament is used is decided in the slicer |
| **One name per product, one text option** | `personalizedName` uses the first text option that has a slot |
| **No moderation, no per-character price** | Allowed characters still come from the option's pattern; price is the option's flat add-on |
| **Admin order page shows no print report** | Width, stroke and watertight results are computed (`buildPrintFile().report`) but not displayed yet |
| **Fonts** | Six heavy Latin fonts. Letters outside them are refused with a message. More fonts = drop a file in `public/fonts` and add it to `NAME_FONTS` (an admin upload of the owner's own font is not built) |

## Questions that decide the next step

1. Which real products should get names first, and do they have a flat area? (The desk clicker cap is 21 × 21 × 9 mm: about 4 characters at a printable size.)
2. Please open one generated print file (Admin → an order → download) in Bambu Studio / Orca and tell me if the name shows up as a part of the stand.
3. Same colour as the product, or a contrasting filament?
4. Engraved letters needed, or is raised enough?
5. Allowed characters and a maximum length per product; flat fee or per-character price?

Last updated: 2026-11-11
