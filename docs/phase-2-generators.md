# Phase 2 — In-browser STL Generators

**Status:** planned, not started. Needs its own spec before any code
(`.kiro/specs/stl-generators/`).

## Goal

Let customers create their own clicker / name keychain / ref magnet in the
browser (text and/or image in, product out), and produce a **real, print-ready
STL** the owner can download from the admin and print without rework.

Reference mechanic the owner pointed to: the *Clicker Generator*
(`vostoklabs.github.io/Clicker-Generator`). It is a client-side JS app, so it
could not be fetched as static HTML — we have **not** inspected its source. Before
designing, open it in a browser (or its GitHub repo), check its **license**, and
decide: reimplement the idea, or embed/fork if the license allows.

> **Not the same as personalizing an existing product** (adding a name to a stand etc.).
> That is a smaller feature with its own plan: [personalization-and-3mf.md](./personalization-and-3mf.md).

## Why this is its own phase

"Looks right on screen" and "slices cleanly and prints" are different bars. A
generated model needs:

- text → extruded 3D geometry (font outlines → triangulated shapes)
- boolean union with a base plate and a **solid keychain ring/hole**
- **minimum wall thickness / feature size** (thin letters snap or fail to print)
- no floating islands; no unsupported overhangs beyond the printer's limit
- watertight (manifold) mesh, correct units (mm), sensible orientation (flat on bed)
- image → silhouette/heightmap (trace, threshold, simplify) for logo products

## Decisions already made

- **Admin reviews every generated file before printing.** Never auto-fulfilled.
- The admin order page already has an STL download route; generated STLs will be
  stored in S3 and linked via `order_items.stl_key_snapshot` (the same field).
- Phase 1 catalog keeps working unchanged; generators are *additional* product
  types.

## Open questions (answer before the spec)

1. Which products first — name keychain (text only) is the simplest start.
2. Fonts: bundled set (license-checked) vs. user choice. Which characters allowed?
3. Where does geometry generation run — **browser** (three.js + `three-bvh-csg` /
   `manifold-3d` WASM) or **server** (Node + manifold / OpenSCAD in a container)?
   Browser = instant preview, no server cost. Server = consistent, testable output.
   Likely: browser preview + server-side regeneration/validation of the final file.
4. Printer constraints to encode as validators: nozzle size, min wall, bed size.
5. Pricing: does size/text length change price? (Extend the existing option
   `priceDelta` model or add a formula.)
6. Moderation: offensive text filter before the owner sees/prints it.
7. Image uploads: copyright/PII handling and retention.

## Proposed approach (to validate in the spec)

1. Generator module: pure functions `generateKeychain({text, font, size, ring})
   → BufferGeometry` + `toBinaryStl()`; unit-testable without a browser.
2. **Validators** that return human-readable failures (min stroke width, mesh
   manifold check, bounding-box vs. bed). The UI blocks checkout on a failed
   check and explains why.
3. Live 3D preview reuses the existing `StlViewer` (swap `url` for a geometry).
4. On order placement, the server regenerates from the saved parameters and
   stores the STL in S3 (do **not** trust a client-uploaded mesh).
5. Admin order page: download STL + view the parameters + a "flag problem /
   contact customer" action.

## Risks

- WASM CSG library size/perf on low-end phones → lazy-load, fall back to a
  parameter-only preview.
- Font licensing for redistributed/embedded fonts.
- Unusual Unicode (emoji, RTL, combining marks) breaking outlines → restrict
  charset v1.
