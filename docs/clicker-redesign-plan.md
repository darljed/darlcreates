# Clicker redesign: research and plan (for review)

Status: **plan only, nothing built yet.** Written 2026-11-12 after trying the two reference sites.

## 1. The finding

The clicker in both reference sites is a **mechanical fidget clicker**: a printed, coloured **cap** that sits on a printed
**housing** around a real **MX keyboard switch** (the click comes from the switch). What I built in PR #3 is a **flat keyring
tag** with no switch, no cap and no housing. That is the wrong product, so the build needs a redesign, not polish.

## 2. What I tried

| Site | How I tested it | Not tested |
|---|---|---|
| [AF Inventions Clicker Maker](https://www.af-inventions.com/design.html?slug=clicker-maker) | Opened the maker, read every option in all 9 steps (Clicker and Name keys), used the Inside view, checked it on a 390 px phone | Download (needs an account), Doodle, QR |
| [Vostok Labs Clicker Generator](https://vostoklabs.github.io/Clicker-Generator/) | Opened every tab, assembled / exploded / cut-open views, read the full changelog | Uploading my own image, downloading a 3MF |
| [PrintPal guide](https://blog.printpal.io/how-to-make-your-own-custom-fidget-clicker/) | Read in full (it has the real dimensions) | The tool itself (downloads are paid) |
| [MyLaserTools](https://www.mylasertools.com/learn/guides/clicker-generator) | Read the guide and FAQ | The tool (did not load for me) |
| MakerWorld parametric models, Etsy sellers | Search results only | Everything inside the listings |

I had not inspected their output files until you sent two (section 2b); the print-file facts there are measured.

## 2b. Your two sample files (measured)

Both are AF Inventions exports (`bini-clicker 3` was re-saved in Bambu Studio, `test` is the untouched download). I measured the
meshes. The two files agree with each other, and you said the size of the bini clicker is right, so these are our **target
numbers**. The files are your personal-use downloads: used for measuring only, not copied into the repo.

| Item | bini clicker | test | Notes |
|---|---|---|---|
| Parts | 2 objects: BASE, TOP | same | Base = 1 colour part (+ a separate keyring part in bini). Top = cap body + skin + one part per artwork colour |
| Base footprint | 55.07 × 37.91 mm | 39.91 × 54.83 mm | Cap footprint plus **2.5 mm per side** in both files |
| Cap footprint | 50.02 × 32.84 mm | 34.81 × 49.77 mm | |
| Base height | 18.0 mm | 18.0 mm | Levels at 0 / 1.2 / 7.2 / 8.7 / 10 / 18 mm: bottom plate, switch pocket and clip undercuts, deck at 10, **8 mm rim** above it |
| Switch pocket | 14.0 × 14.0 mm (196.0 mm²) | same | Standard MX plate cutout |
| Rim wall | not measured | about 2.0 mm | Estimated from areas, so approximate |
| Cap to rim clearance | not measured | about 0.5 mm per side | Estimated from areas; PrintPal says 0.32 mm |
| Cap height | 5.4 mm body + 0.6 mm skin | same | Underside has a cavity and stem socket up to about 4.2 mm, leaving a face about 1.2 mm thick |
| Artwork | pieces 1.2 mm tall (0.6 raised) | pieces 0.6 mm (flush) | Each colour is its own part; raise = taller pieces |
| Keyring (bini) | 11 × 11 × 3 mm part at the bottom | n/a | |
| Colours | pink base, white top, pink art | 5 colours: white base; black cap; white, red, yellow, blue art | Filament slot numbers follow colour order (cap = 2, then 3, 4, 5) |
| Per-object print settings | base **3 walls**, top **1 wall** | same | Saved as object settings in `model_settings.config` |
| Plate layout | Positioned by the slicer | Baked into the vertex coordinates: base and cap side by side with a 6 mm margin and 6 mm gap | No build transforms, no supports |
| 3MF structure | Bambu project | Core 3MF `colorgroup` (hex colours) per object + `Metadata/model_settings.config` (parts, extruders, wall loops) + `project_settings.config` | Our PR #3 writer already uses the same approach, so it extends to two objects |
| Printer in the project | **Bambu Lab X2D**, 256 × 256 mm, PLA Basic, 0.4 mm nozzle, 0.2 mm layers, Textured PEI, by object | Bambu P2S (AF's default) | The X2D is the one you saved, so I read it as your printer. Please confirm. |

## 2c. Confirmed constraints

- **Printer: Bambu Lab X2D**, 256 × 256 mm plate.
- **At most 4 colours (filaments) in one print job.**

The 4-colour limit is the biggest design rule, because the base, the cap body and every artwork colour share those 4 slots.
The AF test file above uses 5 colours (white, black, red, yellow, blue), which this printer could not do in one job.

| If the clicker has | Colours left for artwork |
|---|---|
| Base and cap body in the same colour | 3 |
| Base and cap body in different colours | 2 |

How the designer handles it:
- A colour meter ("3 of 4 colours used") on the colour step and the summary.
- A picture is reduced to the colours that are left, each matched to the nearest colour in your palette. If the customer wants
  more artwork colours, the meter shows the trade-off (same colour for base and cap frees a slot).
- Your palette can hold any number of filaments. The limit is per clicker, not per shop.
- Extra colours cost the customer more only up to the limit. The price rule "each colour after the 2nd" stays.
- The server rejects any design that needs more than 4 distinct colours (same check as the browser).

## 3. What makes them effective

1. **Pick the intent first.** AF opens on four cards: Clicker, Name keys, Doodle, QR. You can switch any time.
2. **Never an empty screen.** Both start with a sample (a rocket, the Vostok logo) plus sample images to click.
3. **A numbered step list with a summary.** AF: 9 steps, one open at a time. Done steps get a green tick and a one-line
   summary ("Size, 40 × 55 mm"). Each step ends in "Next: Colors". The last step is a full summary: size, shape, filaments,
   about 16 g of filament, what is in the download.
4. **The preview is physically honest.** Real millimetre labels (40 × 55, 22.6 mm tall), a ghost MX switch, **Exploded /
   Assembled**, and **Inside / Cut it open** to show the switch pocket. "Click a part to change it" works on the model.
5. **Picture advice before upload.** A green "flat colours, clear shapes" example next to a red "photo, shading" example.
   Remove background. "Your image stays on your device."
6. **Colour count is a choice (1 to 12).** Each picture colour maps to a real filament name. Their tip: pick the most colours
   first, then merge down.
7. **Auto-fixes instead of errors.** The body grows until the switch fits ("Grown to 39 mm so the switch fits").
8. **Printers vary, so fit is tunable.** Vostok has a Fit tab (top gap, stem fit, pocket fit) and a **printable fit-test
   strip**. AF has "how tight the switch fits".
9. **Print-ready output.** 3MF with colours on filament slots and parts laid out for the chosen plate (A1, P/X series).
10. **Fast iteration.** Vostok keeps a public changelog. An AF user asked for flush walls and had it within a day.
11. **Phone layout (AF).** Full-screen sheet; 3D view pinned at the top; steps scroll under it; the main button is pinned
    at the bottom; start cards become a 2 × 2 grid.

## 4. Feature checklist from the sources

| Area | Options seen |
|---|---|
| Kinds | Clicker (picture or text or both), Name keys (one switch per letter), Doodle, QR, photo frame, stamp, NFC/magnets (AF only) |
| Artwork | Image (remove background), SVG, icon, text (2 lines, symbols), blank cap |
| Text | 11 to 12 bold fonts, 24 symbols, import your own font, colour each letter |
| Colours | 1 to 12 picture colours, map to filaments, matte option, recolour by clicking the model |
| Relief | Flat, or raised 0.6 / 1.2 / 2 mm (all, or per colour; PrintPal 0.8 mm steps), bevel |
| Shape | Outline that follows the design, circle, oval, square, rectangle, hexagon, heart, star, cloud, bone, shield, drop, tag, arch, polygon; Vostok has hundreds |
| Size | 24 to 90 mm (PrintPal), presets 30 to 100 (AF); default about 38 to 40 mm; body grows to fit the switch |
| Switches | 1 to 6 switches, drag to position |
| Base | Colour, rim height (low 4 / standard 8 / high 11 / flush), rounded edge, 12 side textures, hollow underneath |
| Keyring | Hole or loop around the rim, any angle, hole size |
| Name keys | Row, two rows, grid, L, plus, X, draw-it layouts; colour presets (all same, two colours, rainbow); keycap height and profiles (Vostok) |
| Extras | Undo/redo, save and load designs, share, dark mode, copies, fit test, print profile links, changelog |

## 5. Numbers to design around

From your sample files (section 2b) first, then the third-party guides. Verify the estimated ones with a test print.

| Item | Value | Source |
|---|---|---|
| Switch pocket | 14.0 × 14.0 mm | Your files (matches MX plate standard 13.97) |
| Base height / rim | 18 mm, rim 8 mm above a deck at 10 mm | Your files |
| Cap inset from base edge | 2.5 mm per side (rim wall about 2.0 + clearance about 0.5) | Your files (estimated split) |
| Cap | body 5.4 mm + skin 0.6 mm, artwork 0.6 mm flush or 1.2 mm raised | Your files |
| Cap face thickness | about 1.2 mm, cavity underneath | Your files (approximate) |
| Walls when printing | base 3, cap 1 | Your files |
| Switch keepout in the cap face | about 15 mm | PrintPal |
| Size range | 24 to 90 mm; default about 38 mm | PrintPal |
| Key travel | 3.75 to 4 mm | PrintPal, MyLaserTools |
| Print | Cap face down, base open side up, no supports, PLA, 0.2 mm layers | Guides and your files |

## 6. Licensing: we copy ideas, not code or files

- **Vostok Labs** code and designs are **CC BY-NC-ND 4.0**. No reuse, no derivatives, and selling prints of its designs needs
  their $15/month commercial membership.
- **AF Inventions** says selling prints needs a MASTER or PRO licence. **PrintPal** downloads are paid.
- **MyLaserTools** says a commercial licence is included, but the tool is closed source.
- Standard MX dimensions (14 mm cutout and so on) are public facts. Our geometry will be **written from scratch**.
  Nothing from these sites' code, files, fonts, images or icons is copied.

## 7. How this build differs from the references

They are **tools for makers**: free, the user prints it, buys the switch, downloads a 3MF. **Darl Creates sells finished
clickers**: the customer designs, you print, fit the switch and ship. So:

- The customer picks a **switch type** (clicky, tactile, linear). It is a priced option, and you hold the stock.
- The customer never gets a 3MF. **You** get it on the order, with both parts and the switch to pack.
- **Fit tolerances are a shop setting**, calibrated once per printer and filament with a fit-test strip, not a customer option.
- Colours come from **your** palette, and a clicker may use **at most 4** (your X2D), shared by base, cap and artwork. See 2c.
- Price = base + size + switches + colours + extras, checked on the server (already how PR #3 works).

## 8. What I can reuse from PR #3

| Keep | Rework | Drop |
|---|---|---|
| Polygon engine (`poly.ts`), text to shapes, picture tracing, image import | Design spec: switches, positions, base options, cap options | Flat keyring-tag model (body / top / border as one slab) |
| Undo/redo and layer state | Layout and solids: cap + housing with switch pocket and cross socket | "Keyring-only" hole logic (becomes a loop on the housing) |
| Cart, order, pricing, price check on the server | Shapes: grow to enclose the switch keepout; "outline follows design" | Tag-style defaults and limits |
| 3MF writer with parts and colours | 3MF: two parts per clicker, plate layout, orientation | |
| Admin setup shell, skeletons, docs, test scripts | Viewer: ghost switch, exploded, cut-open, dimension labels | |
| Draft in localStorage, multiple clickers per order | Designer UI: step list instead of tabs; mobile layout | |

## 9. Fixes to the current build (needed whatever we decide)

| # | Fix |
|---|---|
| F1 | Wrong product (section 1). |
| F2 | **Phone layout never tested.** Most shoppers will be on phones. Needs the pinned-viewer, scrolling steps, sticky buy button pattern. WebGL cost on low-end phones also needs checking. |
| F3 | Thumbnails of every clicker are rebuilt on each edit. Build only the changed one. |
| F4 | White renders grey in the viewer (lighting). No millimetre labels. |
| F5 | Tool panel is capped at 640 px and cuts off the colour rows. |
| F6 | The 3MF has never been opened in Bambu Studio (G-98). |
| F7 | The published test product `custom-clicker` on the dev DB and PR #3's description describe the old product. |

## 10. Plan

Each phase ends with: typecheck, eslint, `next build`, its test script, browser check on desktop **and 390 px phone**, docs.

| Phase | What | Size | Done when |
|---|---|---|---|
| 0 | Your answers to section 11 | n/a | Scope is fixed |
| 1 | **Geometry v2.** Cap (artwork inlaid, cross socket, skirt) and housing (deck, 14 mm cutout, pocket, wall, rim) as watertight solids; body auto-grows to the keepout; calibration constants. Test script checks watertight, clearances, keepout. | L | All shape x switch combinations pass; a design with more than 4 colours is refused; for a 50 × 33 mm cap our solids match the table in 2b (14 mm pocket, 18 mm base, 2.5 mm inset); **you print the fit-test strip and a first clicker** |
| 2 | **Designer v2.** Start cards (Clicker, Name keys), sample designs, step list with summaries, final summary step, viewer with ghost switch, exploded, cut-open and mm labels, picture advice, colour count and mapping with a 4-colour meter, phone layout. | L | Full flow works on desktop and phone |
| 3 | **Name keys.** One cap and switch per letter, layouts, fonts, symbols, colour presets, one housing bar. | M | Name of 1 to 8 letters prints |
| 4 | **Shop side.** Switch type and stock as options, price by switch count, admin calibration page and fit-test download, order page lists both parts and the switch to pack, plate-layout 3MF for your printer. | M | An order produces a file that prints correctly |
| 5 | **Polish.** Save and share designs, owner-curated sample gallery, optional "make artwork with AI" prompt for customers with no art, SEO, changelog page. | M | Review pass |
| Later | Doodle, QR, 3D-model import, keycap-block mode, textures and hundreds of shapes | | Only if wanted |

**Risk:** I cannot judge switch fit or print quality from code. Phase 1 needs you to print a test and report back.

## 11. Decisions I need from you

1. **Confirm the product:** mechanical-switch clicker (cap + housing + real switch), sold finished?
2. **The flat tag:** drop it, or keep it as a separate "keychain tag" product? (I suggest drop; the cap reuses its engine.)
3. **Scope of v1:** Clicker and Name keys only? (I suggest yes. Doodle and QR later.)
4. **Switches:** which types do you stock and what do they cost the customer?
5. ~~Printer~~ **Answered:** Bambu Lab X2D, max 4 colours per job (section 2c).
6. **Licensing:** OK to build our own geometry and not use any Vostok / AF files or code? (I recommend yes.)
7. **PR #3:** mark it as draft and continue on the same branch, or close it and start `feat/clicker-v2`?

Last updated: 2026-11-12 (sample file measurements; X2D and 4-colour limit confirmed)
