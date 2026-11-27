# Image gallery (AI product pictures)

> Last updated: 2026-11-27. Source: `src/lib/ai/image-studio.ts`, `src/app/(admin)/admin/ai/images/page.tsx`,
> `src/components/ai/image-gallery.tsx`, `src/app/(admin)/admin/ai/image-actions.ts`, `ai_images`, `product_photos.hidden`.

AI → **Image gallery** (`/admin/ai/images`) makes product pictures without chat: pick a product, press a preset chip
with an optional extra direction, and the picture lands in the gallery as it is made. **Generate set** makes the
standard trio (Cover, Studio, Lifestyle) in one go.

## Why
Before this the only way to make a mockup was to ask the studio chat, and a small model sometimes claimed it had made
one without calling the tool. Presets call the image model directly — no text model, no tool call, no way to claim
anything. Generation, placement (on / off the product) and the cover choice live in one place; every generation's cost
and model are recorded, so the gallery is also the price history of the product's AI pictures.

## How each picture is made (`generateStudioImage` in `src/lib/ai/image-studio.ts`)
1. The product's real photos (`product_photos`, any state) are read as the base, oldest sort first, up to three sent
   (over 3 MB copies are skipped, like in the chat).
2. The prompt is built by the preset (prompts in `src/lib/ai/product-copy.ts`):
   - **Cover** asks the model to overlay the product's name as large legible text — it deliberately does NOT carry the
     "no text" guard the other prompts use;
   - **Studio / Lifestyle / Detail** are the chat's hero / lifestyle / detail prompts, which open with the guard that
     keeps the real product's shape, colours and layer lines unchanged;
   - **Custom** is the owner's own words plus the same guard.
3. The chosen image model (default `google/gemini-3.1-flash-image`, set in AI settings) is called through OpenRouter;
   a model that cannot take a photo needs no photos, a vision model is refused when the product has none ("Add one
   first" — a mockup redraws the real product, so it needs one).
4. The picture is stored as `photos/ai-<id>.<ext>` and a row is written to `ai_images` (`scene`, `direction`, `model`,
   `cost_usd`, `created_by`). Cap: 40 generated pictures per product.

## The gallery (`productGallery`)
One grid per product, newest first. Each tile shows the picture (linked to its 300-second signed URL), the preset,
model, cost, alt text, and its state: **On product** (green), **Off** (amber, still linked), or no badge (never
placed). Buttons per tile:
- **Add / Remove** — `setOnProduct`: adds a `product_photos` row (alt from the gallery row, sort = last) or sets that
  row's `hidden = true`. Hiding is reversible and never deletes the picture.
- **Cover** — `setCover`: the row's `sort` goes to `min(sort) - 1`, so it is the shop thumbnail. Refused while the
  picture is off the product.
- **Regenerate** — the same preset, direction and model again (a variation).
- **Alt text** — `writeImageAlt`: the writing model (needs vision) describes the picture in one sentence; saved on the
  gallery row and the linked `product_photos` row.
- **Delete** (only while off the product) — the gallery row goes and the stored file is removed; a picture on the
  product is refused ("turn it off first"), so nothing a customer can see disappears silently.

## What customers see
`product_photos.hidden` is filtered in **all** default catalog reads ([catalog.ts](../src/lib/catalog.ts)): the
storefront listing's card image, the product gallery, and `getProductsByIds` (so carts too). Admin reads that need
hidden pictures pass `{ allPhotos: true }` (product editor, design studio, order history). Setting hidden or cover
expires the `products` / `product:<slug>` tags, so the shop shows it on the next request.

## Relation to the Product studio chat
The chat keeps its `make_mockup` tool and its Pictures panel; both write into the same gallery: applying a chat's
ticked mockups adds `ai_images` rows for them (`applyDraftAction`), and the studio's Pictures panel keeps showing what
it always has. Costs from the chat are counted on the chat, gallery rows from `applyDraftAction` carry `cost_usd = 0`
(the per-picture split is not recorded there).

## Tests
`npx tsx scripts/test-image-studio.ts` (needs the database; no real network or storage): the preset prompts, one
generation end to end with fake model and storage, the vision guard, the per-product cap, the standard set, and the
place / hide / cover / alt / delete actions against `product_photos`.
