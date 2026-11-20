# Name keychain designer

Customers design a 3D-printed **name keychain** in the browser, see it in 3D, and order it. A second standalone service next to the
[clicker designer](./clicker-designer.md), built the same way (a product flagged `is_service`, reached at `/keychain`). Nothing has been
printed from these files yet (G-110).

## What the customer can do
Three styles (the owner can switch any off):

| Style | What it is |
|---|---|
| **Name** | The name in a font, on a plate that follows the letters (like the sample photo), with a keyring loop. |
| **Name + icon** | The same, with a preset icon beside the name (left or right, any size). 40 icons drawn in code, in two groups. **Cute animals** (bracelet-charm style): cat, bunny, bear, panda, puppy, piggy, duck, chick, penguin, frog, fox, owl, butterfly, bee, ladybug, whale, dino, paw, fish, bone. **Charms and shapes**: heart, star, bow, strawberry, cherries, cupcake, ice cream, rainbow, mushroom, clover, flower, crown, lightning, moon, sun, cloud, smiley, music, diamond, leaf. Eyes and spots are real holes, so the plate colour shows through. |
| **Bag tag** (our own idea) | A name plus a small second line (phone number, class, address) inside a raised frame on a box-shaped plate. For bags, pets, luggage and school gear, where the keychain has a job. |

Every style can choose: **font** (10: Bold, Chunky, Marker, Modern, Condensed, and the script faces Script, Lobster, Courgette, Kaushan,
Damion), **letter height** (6 to 24 mm), letter spacing, **one or two lines** (owner limit, up to 3), **colours** for plate, name, icon and frame,
**plate shape** (follow the letters, rounded box, pill) and its margin, **thickness** (Thin 2.4 / Standard 3.2 / Chunky 5 mm presets, or plate
1.2 to 5 mm and letters standing 0.6 to 3 mm), and the **keyring hole** (left, right, top or none, 3 to 8 mm). Several different keychains
(names) in one order, copies of each, undo and redo, a draft kept in the browser, a pinned 3D view and buy bar on phones.

## How it is built
```
KeychainSpec (plain data, stored in the cart/order line, config[optionId].design)
  -> buildKeychainLayout()  flat pieces with heights: plate, name, icon, frame   (src/lib/keychain/layout.ts)
  -> extrudeParts()         watertight solids, one per colour piece              (clicker/extrude.ts, shared)
  -> buildKeychainPrint()   one object lying on the plate, 3MF                   (src/lib/keychain/server.ts, clicker/export-3mf.ts)
```
- Letter size is measured from the font's own capital H (some of the added fonts report a wrong cap height in their tables).
- The plate follows the letters by closing gaps and filling holes, then growing by the margin. The keyring loop overlaps the plate (shapes that only
  touch along an edge do not merge reliably), then the hole is cut. Points closer than 4 micrometres are dropped (`dropNear`) and pieces are opened by
  30 micrometres, because the triangulator that fills a piece loses a triangle on such points.
- Strokes thinner than 0.5 mm are dropped with a note ("a bolder font prints better").
- The server never trusts the browser: it rebuilds the layout from the saved design (`checkKeychain`) and the admin Download builds the 3MF from it.
- Print file: plate, name, icon and frame are separate parts (a filament per colour), 2 wall loops, flat on the bed, 6 mm from the corner.

## Owner settings (`KeychainConfig`, on the product's option)
Set on **Admin → Products → (product) → Name keychain designer**: styles, fonts and icons on offer, smallest and largest letters, most letters, most lines,
longest keychain (mm), most keychains per order, most colours per print (X2D: 4), the palette (the colour inventory under Admin → Colours IS the
palette when there is one) and **every price**:

`price = product price + length step + (lines - 1) x line price + style price (icon or bag tag) + colours beyond 2 x colour price + thick price`

- **Length step:** the first step whose "up to" reaches the plate's longest side. The last step must reach the longest keychain allowed.
- **Thick price:** added when plate + letters is more than the "thick means more than" value (default 6 mm).
- The length used for the price is written on the design by the designer. The server rebuilds the shape and refuses a design whose written length is
  more than 0.6 mm shorter than the real one (so a long name cannot be priced as a short one).
Defaults: steps 70 / 100 / 120 mm = 0 / 30 / 60, line 30, icon 20, bag tag 30, colour 15, thick 20 (pesos).

## Adding a font or an icon
- **Font:** put the `.ttf` and its licence in `public/fonts`, add it to `NAME_FONTS` (`name-mesh.ts`) and an `@font-face` to `globals.css`. It must parse with
  `opentype.js` (Bangers does not). Run `scripts/test-keychain.ts`: it builds names in every font.
- **Icon:** add the id to `ANIMAL_ICONS` or `CHARM_ICONS`, a label, and a builder (circles and polygons) in `src/lib/keychain/icons.ts`.

## Limits
| Limit | Value | Where |
|---|---|---|
| Letter height | 6 to 24 mm (owner narrows) | `LIMITS`, `KeychainConfig` |
| Plate thickness / letter height | 1.2 to 5 mm / 0.6 to 3 mm | `LIMITS` |
| Letters / lines | owner, up to 40 / 3 | `KeychainConfig` |
| Length | owner, up to 200 mm | `KeychainConfig` |
| Design size | 6,000 characters of JSON | `MAX_KEYCHAIN_JSON` |

## Known limits
- Not printed yet; the 3MF has not been opened in Bambu Studio (G-110). The plate margin, thickness presets and keyring wall are sensible defaults.
- Icons are simple silhouettes drawn from circles and polygons; a couple (cloud, whale tail) are plain. Nicer presets are a design job. Products saved before an icon was added do not offer it until you tick it under Icons on offer.
- Fonts are limited to the bundled ones; thin script strokes may be dropped (the customer is told).
- Emoji as colour pictures are not supported (only the icon presets), by design: one colour per piece.

## Admin design studio
Admin → Workshop → **Design studio** (`/admin/studio`) shows this designer, and the clicker designer, with `studio` on: no cart or sign-in, and the price bar offers **3MF (colours)** and **STL (zip)** for the design being edited. The browser posts the design to `POST /admin/studio/file`, which checks it with `checkKeychain` / `checkDesign` against the product's settings and builds the file. The STL zip holds one binary STL per print object and colour (an STL has no colours), already on the bed, with a README. Drafts are kept separately from the shop's (`:studio`). It needs a clicker or keychain product to exist (any status), because the product holds the limits.

## Tests
`npx tsx scripts/test-keychain.ts [fuzz count]` covers fonts, icons, schema, the owner's limits, price rules, every style x plate x keyring position
(closed solids, letters inside the plate, no overlaps, loop clear of the letters, hole through the plate), every font with real names, a pseudo-random
walk of odd designs (default 80), the server check (including an understated length), the 3MF, the cart pricing path and (with the database)
several keychains added to a cart at once. `npx tsx scripts/test-studio.ts` checks the STL zip for a keychain and a clicker. Browser: open `/keychain`, try the three styles, add to cart, place an order, download the 3MF in the admin order.
