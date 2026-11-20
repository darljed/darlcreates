# AI studio

> Last updated: 2026-11-18

Admin tools that use AI models. Today: **AI settings** (provider keys and model choice) and the **marketing generator**
(a product page and images drafted from a 3MF/STL and photos of the real print). The **agent** (a chat on every admin page that proposes changes for your approval) is documented in [ai-agent.md](./ai-agent.md); it reuses the same settings and the `ai_drafts` table.

## The rule
The AI only ever *drafts*. Nothing it makes reaches the shop until a person presses **Approve**, and even then the product is created
**unpublished**. Every write goes through the same Server Actions the product editor uses, so the same checks run again.

## AI settings (`/admin/ai/settings`)
- **Keys** for OpenRouter and Ollama Cloud. A key saved here is encrypted (AES-256-GCM with a key derived by scrypt, `lib/ai/crypto.ts`) before it is stored in `ai_settings`,
  is never sent back to the browser (the page only learns "set, ends in 1234") and wins over the `OPENROUTER_API_KEY` / `OLLAMA_API_KEY` env var.
  The encryption key comes from `AI_SETTINGS_SECRET`, or `BETTER_AUTH_SECRET` when that is not set. Changing the secret makes saved keys
  unreadable: enter them again. Saving or removing a key is written to `admin_audit`.
- **Model for writing**: pick the provider, press Load models, filter, choose. The list is the provider's own (OpenRouter `/models`; Ollama `ollama.com/api/tags`),
  shows which models can see images and use tools, and the OpenRouter price. "Test it" sends one tiny request.
- **Model for images** is fixed: `google/gemini-3.1-flash-image` on OpenRouter (`IMAGE_MODEL` in `lib/ai/settings.ts`). It edits from reference photos and keeps the
  product's shape and colours, about $0.06 an image. Ollama Cloud has no image model we can rely on, so images always use OpenRouter.

## The marketing generator (`/admin/ai`)
1. **Upload** a 3MF or STL and up to 6 photos of the real print (direct to storage), and optional notes (only facts you type are used).
2. **Copy**: the writing model gets the file's facts (size in mm, filament colours) and your notes (and the photos, if it can see images) and answers with JSON:
   name, tagline, description, highlights, tags, category, SEO title, meta description. The answer is checked with Zod; one retry on bad JSON. It must not invent
   a material, price or guarantee, and the shop's words must not mention taxes or the shop's registration status (checked in code and by `test-content.ts`).
3. **Pictures**: hero, lifestyle and close-up, each made from your real photos (up to 3 are sent) with a prompt that says to keep the exact shape, colours and layer lines
   and add no text or logos. One image per request so a slow image cannot time out the page. Up to 9 AI images per draft. You tick which pictures to keep; the real photos
   are in the list too and the page warns when none is ticked (AI images must not be the only thing buyers see).
4. **Approve**: the draft is claimed first (status `applying`), so a double click or a second tab cannot create two products. Enter the price, then "Approve and create product". It runs `createProductAction` (status **draft**), `attachModelAction` (which also reads a 3MF
   for name slot and colours) and `addPhotoAction` for each ticked picture. If the product is created but the model or a picture fails to attach, you still get the product plus a warning (the draft is used up; fix it in the product editor). Unticked AI images are deleted. "Discard" deletes the draft's uploaded files.

Drafts are rows in `ai_drafts` (`kind = product`), so closing the tab loses nothing; recent drafts are listed under the page.

## Cost and safety
- AI spend per draft is added up from the provider's reported cost and shown on the draft.
- Prompts contain only the file's facts, your notes and your photos. No customer data is sent.
- Provider errors reach the screen as plain sentences; the key never appears in them.
- A fake key fails with "The provider rejected the API key" (checked by `scripts/test-ai.ts`).

## Files
`lib/ai/{crypto,settings,providers,product-copy}.ts`, `db/schema/ai.ts`, `components/ai/*`, `app/(admin)/admin/ai/**`. Tests: `npx tsx scripts/test-ai.ts`.

## Known limits
- Photos over 3 MB are not sent to the AI (the request goes out as one JSON body); upload smaller copies.
- A generated image is about 1.5 MB (PNG, 1024 px). The product editor's photo limit is 5 MB, so a much larger image would be refused at approval.
- The image model is not switchable in the UI (decision: one model, consistent look).
- No daily spend cap yet; the per-draft image cap (9) is the only limit.
- Images are not yet reviewed for "does this still look like my product" beyond your own eyes. Always compare with the real photo.
