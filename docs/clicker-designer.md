# Clicker designer

Customers design their own clicker (a flat, coloured keyring tag) in the browser, see it in 3D, and order it. Added in
`feat/clicker-designer`. Decisions: D-48 to D-51 in [decisions.md](./decisions.md).

## What the customer can do
- **Shape** (circle, square, rounded, pill, hexagon, octagon, diamond, star, heart, shield, flower, soft square) and **size**
  (width and height, linked or not; the owner sets the range and price steps).
- **Design**: text layers (6 fonts, size, spacing, several lines) and picture layers (PNG, JPG, WebP or SVG). Layers can be
  moved (drag in "Move" mode), rotated, mirrored, hidden, reordered and copied.
- **Pictures** are traced in the browser into flat colour areas. The customer picks how many colours to look for and which to
  keep; each area is matched to the nearest colour the owner offers. The picture file is never uploaded.
- **Colours** of the body, the border and every design colour (only the owner's palette).
- **Style**: flat inlay, raised (emboss) or engraved; border on or off, width, height and colour.
- **Keyring**: a loop with a real hole, placed by angle or by dragging the ring; hole size and loop strength.
- **Several clickers in one order**, each with its own copies. Each becomes its own cart line.
- Undo and redo, a 3D view and a top view, and a draft kept in the browser across reloads and sign-in.

## How it is built
A clicker is a stack of flat, non-overlapping pieces, so each colour is its own filament piece:
body (base colour), top (interior minus the design), border, and one piece per design colour. Upper layers cover lower ones.
All 2D work uses `clipper-lib` (pure JavaScript). Units inside the polygon code are micrometres.

```
ClickerSpec (plain data, stored in the cart/order line)
  -> buildLayout()   2D pieces, warnings, errors        (src/lib/clicker/layout.ts)
  -> extrudeLayout() watertight solids per piece        (src/lib/clicker/extrude.ts)
  -> clickerTo3mf()  3MF with a part and colour each    (src/lib/clicker/export-3mf.ts)
```

The browser shows the same solids it would print. The server **never trusts a mesh from the browser**: it rebuilds the
geometry from the saved design (`checkDesign`, `buildClickerPrint` in `src/lib/clicker/server.ts`).

## Where the data lives (no migration)
- A clicker product is a normal product with one required `text` option, "Your clicker", whose `constraints.clicker` holds the
  owner's `ClickerConfig`.
- The customer's design is saved in the cart and order line's `config[optionId].design` (jsonb).
- The cart and order picture is an SVG data URI built from the design (`designSvgDataUri`).

## Owner settings (`ClickerConfig`)
Smallest and largest size, size price steps (`sizeTiers`), price per colour beyond the second, keyring price, picture price,
palette, most layers, most clickers per order, and whether text and pictures are allowed. Set them on
**Admin → Products → (product) → Clicker designer**. "Make this a clicker product" is refused if the product has other options.

## Price
`product price + size step + (colours - 2) x extra colour + keyring + picture`. Computed in `computeUnitPrice` and checked again
on the server when the line is added.

## Limits
| Limit | Value | Where |
|---|---|---|
| Size | 15 to 120 mm per side (owner narrows it) | `LIMITS` in `spec.ts` |
| Points in all traced pictures | 16,000 | `LIMITS.maxPoints` |
| One saved design | 300,000 characters of JSON | `MAX_SPEC_JSON` |
| One add to cart (all designs) | 3.5 MB; the Server Action body limit is 4 MB (`next.config.ts`) | `MAX_ADD_JSON` |
| Clickers per add | the owner's `maxClickers` (up to 30) | config |
| Finest printable detail | 0.5 mm (smaller is dropped with a note) | `LIMITS.minFeatureMm` |

## Print file
`clickerTo3mf` writes core `basematerials` (colours), `Metadata/model_settings.config` (Bambu/Orca parts and extruders) and
`Metadata/project_settings.config` (`filament_colour`). The admin order page's download button builds it from the saved design
(`/admin/orders/[id]/stl/[itemId]`, streamed). Each colour is its own part, so the slicer assigns one filament per colour.

## Known limits
- The 3MF has not been opened in a slicer yet (G-98). Open one in Bambu Studio before the first order.
- The engraved preview is a stencil carve in the viewer (like the name engraving), not the real solid.
- "Move" mode drags layers and the keyring; there are no resize handles (use the size slider).
- SVG import is tested in the browser only.

## Tests
`npx tsx scripts/test-clicker.ts` covers the schema, shapes, geometry (every shape x mode x border x keyring combination is a
closed solid that tiles the outline), text, tracing, price, validation, the 3MF and the cart integration (needs the database).
Browser: open `/clicker`, add text and a picture, change shape, add a second clicker, add to cart, then download the 3MF
from the admin order.
