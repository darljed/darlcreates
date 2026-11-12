# Clicker designer

Customers design their own **mechanical-switch clicker** in the browser, see it in 3D (including inside), and order it. You
print it, fit a real MX keyboard switch and ship it. Rebuilt on `feat/clicker-v2` after the first version (a flat keyring
tag) turned out to be the wrong product. Research and measurements: [clicker-redesign-plan.md](./clicker-redesign-plan.md).
Decisions: D-52 to D-54 in [decisions.md](./decisions.md).

## What a clicker is
Two printed objects around a real switch:

- **Base (housing):** a floor, a 14 × 14 mm chamber for the switch (with four clip windows), the deck the switch sits in, and a
  wall round the well the key moves in. One colour. Optionally a flat keyring tab with a real hole.
- **Key (cap):** hollow underneath with a round boss and a cross-shaped socket that pushes onto the switch stem, a solid face,
  and a thin top skin with the coloured artwork inlaid (flat, or standing 0.6 or 1.2 mm above it).
- **Switch:** a Cherry MX switch you buy and fit. There is one type, so the customer does not choose one; they choose how many (up to your limit) and where they go.

## What the customer can do
- **Clicker** (one big key): a shape, size of the key, text and/or pictures, colours, flat or raised artwork, wall height
  (low, standard, high, flush with the key), **1 to 6 switches placed where you want them**, keyring tab.
- **Follow my design (outline):** the key and the base take the shape of the text and pictures, with a coloured border round them (thin 0.8, normal 1.2, thick 2 or extra 3 mm). Gaps between letters are closed up and holes (the inside of an O) are filled, so it is one solid key. Pieces too far apart are wrapped in one shape. The 15 mm switch square is always inside it, so a very small design gets a small plate round the switch. The size is the design's size: "Longest side" scales the whole design and the key follows. The key colour is the border colour. Default for a new clicker.
- **Several switches:** pick 1 to your limit, then "In a row" or "In a grid", then drag each square on the map (or use the arrow keys) to fine-tune. Switches must be at least 17 mm apart so their parts do not touch and the print has solid walls between the chambers; a closer move is refused. The key grows to cover every switch (an outline key wraps the whole block of switch squares). Each extra switch adds your price. The key has a cavity and a socket over each switch and the base has a chamber and clip windows for each.
- **Name keys:** one key and switch per letter (up to your limit), a font, letter size, keys per row, key colour (one, or two that
  alternate), letter colour. Priced per key.
- **Inside** view lifts the key off to show the switch pocket and a ghost switch. Click any part of the model to change its colour.
- **Changing the shape** centres the artwork on the key and, if it would be cut off by the new shape, makes the whole design smaller by just enough to fit. Leaving "Follow my design" starts the fixed shape as a square of about the same size.
- The 3D view toolbar: **3D | Top** (stays on while you change settings), **Inside** (on/off), and a two-way switch **Rotate | Move** that says what dragging does: Rotate turns the view, Move drags the artwork or the keyring tab.
- Opening a step scrolls its title to the middle of the visible area (on a phone, between the pinned 3D view and the buy bar).
- Several clickers in one order, each its own cart line with its own copies. Undo and redo, "Move" mode to drag the artwork or the
  keyring tab (a light blue preview follows the pointer and the clicker is rebuilt once when you let go, because rebuilding on every pointer move is too slow), a draft kept in the browser, and a layout made for phones (3D view pinned at the top, buy bar at the bottom).
- Pictures are traced in the browser into flat colour areas and are never uploaded.

## The 4-colour rule
The Bambu Lab X2D prints at most **4 colours in one job** (set as `maxColours` in the admin). The base, the key and every artwork
colour share them, so the designer shows "3 of 4 colours used". A picture starts with the colours that are left (`maxColours - 2`),
and adding a picture moves the key to a colour that keeps the picture and text visible. The server refuses any design over the limit.

## How it is built
```
ClickerSpec (plain data, stored in the cart/order line)
  -> buildLayout()   2D pieces for the base and the keys, warnings, errors   (src/lib/clicker/layout.ts)
  -> extrudeLayout() watertight solids, one per colour piece                 (src/lib/clicker/extrude.ts)
  -> buildClickerPrint()  two objects laid out on the plate, 3MF             (src/lib/clicker/server.ts, export-3mf.ts)
```
All mechanical numbers are in one table, `FIT` in `src/lib/clicker/fit.ts`. All 2D work uses `clipper-lib` (micrometres inside).
The browser shows the same solids it would print. To keep editing smooth it keeps finished geometry in a small cache (`GeometryCache`), so a change to the artwork only rebuilds the artwork and the skin round it; the thumbnails of the other clickers are drawn 350 ms after the last change. The server **never trusts a mesh from the browser**: it rebuilds everything from the
saved design. Heights are "assembled with the key up"; the print file moves the key down to the bed.

The dimensions were measured from a clicker that prints and clicks well (a 50 × 33 mm key sits in a 55 × 38 mm base, 22.6 mm tall).
The size step of an outline key uses the size written on the design, which the designer keeps equal to the real one. The server rebuilds the shape and refuses a design whose written size is smaller than the real one (otherwise a big key could be priced as a small one).

A test builds that clicker and checks the base is the key plus 2.5 mm each side, the chamber is 14 mm, the levels are 1.2 / 7.2 / 8.7 /
10 / 18 mm and every piece is a closed solid.

The key is **grown automatically** if the shape is too small to hold the 15 mm switch square (a note tells the customer).

## Print file
One 3MF, two objects, already placed on the 256 mm plate (6 mm margins and gap, side by side or stacked):

- `… - BASE` prints with **3 walls**; `… - TOP` with **1 wall**.
- One part per colour piece; filament numbers go to the distinct colours in order (base first). `basematerials` and
  `Metadata/model_settings.config` carry the colours; `project_settings.config` lists the filament colours.
- The key prints with its hollow side down on the bed, artwork on top (like the sample). No supports.

The admin order page's **Download** builds it from the saved design with your printer fit (`/admin/orders/[id]/stl/[itemId]`).

## Owner settings (`ClickerConfig`, on the product)
Key size range (for the fixed shapes), size price steps, price per extra colour, keyring, picture, palette, **most colours per print**, most layers, most
clickers per order, text and picture on/off, **most switches under one key and the price of each extra one**, **name keys** (on/off, most keys, price
per key after the first), and **printer fit** (`tune`: switch pocket, stem socket, gap round the key; mm, plus loosens).
Set on **Admin → Products → (product) → Clicker designer**.

## Fit test
`GET /admin/clicker-fit-test` (admin only) downloads a small plate: four bases with the switch pocket -0.1 / 0 / +0.1 / +0.2 mm and four
keys with the stem socket -0.1 / 0 / +0.1 / +0.2 mm, one colour. Print it, press a switch into each base and push each key onto a stem.
Enter the best numbers under **Printer fit**. Do this once per printer and filament.

## How far the artwork and key may reach (D-57)
A key rests on the stems of its switches and slides in the well. If it sticks out far past them, pressing the far end tilts it and it
jams, so two rules apply to a clicker (not to name keys):

- **Reach:** the key may stick out at most **20 mm** past the switch squares, on any side. With one switch that is **55 mm** across
  (like the sample clickers that work); two switches in a row allow 72 mm; more switches allow more.
- **Balance:** the middle of the key must be within **6 mm** of the middle of the switches, so a press is even.

Where it is enforced: the layout reports an error that stops the order (the message says what is wrong and how to fix it: move the
artwork back, make it smaller, or add a switch); the server refuses it; **dragging in Move mode stops at the limit** (the blue preview
turns amber and a note appears), and slides along the limit rather than sticking; **typing a position** is clamped the same way; the
size buttons and fields offer only sizes the switches allow; and the switch map will not put the switches' middle more than 6 mm
from the key's middle. The numbers are in `FIT` (`maxReachMm`, `balanceMm`); the arithmetic is in `reach.ts`.

## Price
`product price + size step (clicker) + extra switches x the extra-switch price + extra colours + keyring + picture` for a clicker;
`product price + keys after the first x the key price + extra colours + keyring` for name keys (each key already has its switch). Computed in `computeUnitPrice`
and checked again on the server when the line is added.

## Limits
| Limit | Value | Where |
|---|---|---|
| Reach past the switches | 20 mm; so one switch allows a key 55 mm across | `FIT.maxReachMm`, `reach.ts` |
| Key size | 24 to 120 mm per side (you narrow it; your minimum does not apply to an outline key); a smaller shape is grown to fit the switches | `LIMITS`, `FIT.keepoutMm` |
| Switches under one key | your `maxSwitches` (up to 6), at least 17 mm apart | `LIMITS.maxSwitches`, `FIT.switchPitchMm` |
| Colours per print | your `maxColours` (X2D: 4) | `ClickerConfig` |
| Points in all traced pictures | 16,000 | `LIMITS.maxPoints` |
| One saved design | 300,000 characters of JSON | `MAX_SPEC_JSON` |
| One add to cart (all designs) | 3.5 MB; the Server Action body limit is 4 MB (`next.config.ts`) | `MAX_ADD_JSON` |
| Name keys | your `maxKeys` (up to 12); must fit the plate | `ClickerConfig`, `plateLayout` |
| Finest printable detail | 0.5 mm (smaller is dropped with a note) | `LIMITS.minFeatureMm` |

## Known limits
- **Nothing has been printed yet (G-100).** The numbers come from a sample and from guides. Print the fit test and one clicker first.
- The key's resting height (16.6 mm above the base bottom) follows the sample. It depends on how far your switches' stems stand up
  (G-101). If the key does not seat on the stem or bottoms out early, that number is the first thing to check.
- The 3MF has not been opened in Bambu Studio (G-98).
- "Move" mode drags the artwork and the keyring tab; there are no resize handles (G-99). SVG import is tested in the browser only.
- Doodle, QR codes and cutting a clicker into any 3D model are not built.

## Tests
`npx tsx scripts/test-clicker.ts` covers the schema, shapes, geometry (every shape with and without a keyring, and rim and relief
variations, are closed solids that do not overlap), outline keys (one solid key, border sizes, scaling, the server's size check), several switches (patterns, spacing rule, chambers and sockets per switch, the key wrapping them), the measurements of the sample clicker, switch keep-out growth, name keys, the
4-colour rule, the keyring on every shape and angle, the plate layout, price, validation, the fit-test plate, the two-object 3MF and the
cart integration (needs the database).
Browser: open `/clicker`, try both kinds, upload a picture, press "Inside", add to cart, place an order, download the 3MF from the admin
order, and check it on a phone-size screen.
