# Product studio (AI)

> Last updated: 2026-11-23

Admin tools that use AI models. Today: **AI settings** (provider keys and model choices) and the **studio chat** (a marketing partner you
talk to, that drafts a product page and mockups from your 3MF/STL and photos of the real print). The **agent** (a chat on every admin page that
proposes changes for your approval) is documented in [ai-agent.md](./ai-agent.md); it reuses the same settings and the `ai_drafts` table.

## The rule
The AI only ever *drafts*. Nothing it makes reaches the shop until a person presses **Approve**, and even then the product is created
**unpublished**. Every write goes through the same Server Actions the product editor uses, so the same checks run again.

## AI settings (`/admin/ai/settings`)
- **Keys** for OpenRouter and Ollama Cloud. A key saved here is encrypted (AES-256-GCM with a key derived by scrypt, `lib/ai/crypto.ts`) before it is stored in `ai_settings`,
  is never sent back to the browser (the page only learns "set, ends in 1234") and wins over the `OPENROUTER_API_KEY` / `OLLAMA_API_KEY` env var.
  The encryption key comes from `AI_SETTINGS_SECRET`, or `BETTER_AUTH_SECRET` when that is not set. Changing the secret makes saved keys
  unreadable: enter them again. Saving or removing a key is written to `admin_audit`.
- **Model for writing** (the studio chat and the product copy): pick the provider, press Load models, filter, choose. The list is the provider's own (OpenRouter `/models`; Ollama `ollama.com/api/tags`),
  and only models that can call tools are listed, because the chat needs them. It shows which can see images and the OpenRouter price. "Test it" sends one tiny request.
- **Model for the agent**: same picker, optional (empty = the writing model).
- **Model for images**: OpenRouter's image models (`/models?output_modalities=image`, about 70, including image-only ones such as Flux and Seedream). **Default: `google/gemini-3.1-flash-image`**
  (`IMAGE_MODEL` in `lib/ai/settings.ts`), about $0.06 an image. A model must accept a photo as input to redraw your real product; the list says which ones do.
  Ollama Cloud has no image model we can rely on, so images always use OpenRouter.
- **The active model is marked.** After Load / Reload models, the model in use is pinned to the top of each list as **✓ ACTIVE**, whatever the filter says (and shown as "not in this list" if the provider dropped it).
- **Save models** saves the writing, agent and image choices together (`ai_settings.prefs`).

## The Product studio (`/admin/ai`, Admin → Product studio)
**One chat per product** with a product partner (an e-commerce expert for small-batch 3D prints: copy, photography direction, pricing,
colour design). It covers the listing, mockups, price, ready-made designs and options of that product. A chat is one `ai_drafts` row
(`kind = product`, its `payload.productId` says which product), so closing the tab loses nothing; recent chats are listed under the page.
Pick the product at the top ("+ A new product" or an existing one); the product editor's Design presets section links to its chat.
The top right shows the model that runs the chat (the writing model) with a "Change model" button to AI settings. The chat box
scrolls to the newest message, and to the "Working on it" line while the assistant answers.

### A new product
1. **Talk.** Attach up to 6 photos of the real print (image button) and one 3MF/STL (box button), then write. The files go straight to
   storage; the server checks them (real JPEG/PNG/WebP, real 3MF zip, size) and reads the 3D file's size, triangles and filament colours.
2. **It proposes a listing and mockups.** `propose_listing` saves a listing (name, tagline, description, highlights, tags, category, SEO
   title, meta description, and a price only if you gave or accepted one) on the right; it is checked with Zod and the banned-word check
   (no invented facts, nothing about taxes or the shop's registration status). `make_mockup` makes one picture from your real photos. Its `photos` argument is lenient: labels (`P1`), storage keys or file names all
   resolve; with none, it uses the photos attached to your latest message, else the first three (a strict `P\d` check used to reject
   the whole call when the model passed keys, so no mockup was made).
3. **Create product.** Enter the price and press it. The chat is claimed first (status `applying`) so a double click or a second tab cannot
   do it twice. It runs `createProductAction` (status **draft**, unpublished, with the listing's tags), `attachModelAction` (which detects
   the 3MF's colour parts) and `addPhotoAction` for each ticked picture. The chat stays open and moves to the product.
4. **Keep going.** The same chat now works on the product: designs, options and price (next section).

Designs and options cannot come earlier: the colour parts are read from the 3D file when it is attached to the product.

### An existing product
The assistant gets `get_product` (price, costing, margin) and the option tools (`lib/ai/agent/options-tools.ts`). Listing changes and new
pictures are applied with **Apply to product** (`updateProductAction`, keeping its status and weight; an empty price keeps the current one,
then `addPhotoAction` for ticked pictures not added before). Changes to designs and options are **cards** in the chat, each approved on its own
(or "Approve all", one by one so each is re-checked). Approval is the admin agent's ([ai-agent.md](./ai-agent.md)): the before picture is
read again, and if the product changed in between the card is refused instead of overwriting. The right side shows the product's designs
with a 3D preview of each, and its options; it refreshes after each approval.

| You can ask for | Tool | Applied through |
|---|---|---|
| A ready-made design, or a change to one ("Ocean: blue body, white lid") | `save_design_preset` | `savePresetAction` |
| Show or hide a design | `set_preset_visibility` | `setPresetActiveAction` |
| Custom only / designs only / either | `set_design_mode` | `saveDesignModeAction` |
| Add or remove colours a part offers (from the Colours list) | `set_option_colours` | `addOptionValueAction`, `deleteOptionValuesAction` |
| Rename an option, required, extra price, text length | `update_option` | `updateOptionAction` |
| Rename a choice or change its extra price | `update_choice` | `updateOptionValueAction` |
| A new size, text or whole-model colour option | `add_option` | `addOptionAction`, `addOptionValueAction` |
| A better listing, a new price | `propose_listing` | Apply to product → `updateProductAction` |

You name things in words; the tools match them to the real options and colours. **The tools always act on the chat's product**, whatever
id the model writes, and no other tool (stock, sales, orders) is offered. Not offered on purpose: deleting an option or a design (hide it),
re-detecting parts, changing the 3D file (the product editor does that), publishing.

### Images: the model is chosen in the message box
The dropdown next to Send picks the image model for that message's mockups (OpenRouter models that take a photo as input; your default from
AI settings is preselected and marked "(default)"). To compare models, switch it and ask again: every mockup is labelled with the model that
drew it, in the chat and in Pictures. At most 2 mockups per message and 12 per chat.

### Pictures and closing a chat
Pictures lists your real photos and the mockups; tick what goes on the product, or delete one with its bin icon (mockups made from a
deleted photo stay). Pictures already added say "on product" and cannot be removed from the chat (remove them in the product editor). "Discard chat" (new product) deletes the chat's uploads; "Close chat" (existing product) deletes only mockups not
added to it and never the product's files.

## Cost and safety
- AI spend per chat is added up from the provider's reported cost (writing calls plus each picture) and shown above the chat.
- Prompts contain only the file's facts, what you type and your photos. No customer data is sent.
- Provider errors reach the screen as plain sentences; the key never appears in them.
- **No false claims.** A reply that says it made something (a mockup, a listing, a card) without calling a tool is sent back to the model once ("nothing was made: call the tool or say you could not"). If it still claims it, the reply is shown with a note that nothing was made (`claimsWithoutWork` / `CLAIMS` in `lib/ai/agent/run.ts`). Small models (for example Gemini 2.5 Flash Lite) do this more often; a stronger writing model calls the tools more reliably.
- A fake key fails with "The provider rejected the API key" (checked by `scripts/test-ai.ts`).
- The draft row is locked while it is updated, so a mockup finishing during a chat message (or four models finishing together) cannot overwrite each other.

## Files
`lib/ai/{crypto,settings,providers,product-copy,draft-types,studio}.ts`, `db/schema/ai.ts`, `components/ai/*`, `app/(admin)/admin/ai/**`. Tests: `npx tsx scripts/test-ai.ts` (settings, parsing, keys), `npx tsx scripts/test-ai-studio.ts` (the chat loop, mockups, one chat per product and its tools, locking) and `npx tsx scripts/test-options-agent.ts` (the option tools).

## Known limits
- Photos over 3 MB are not sent to the AI (the request goes out as one JSON body); upload smaller copies. The assistant is told when this happened.
- Mockups need a real photo. A 3D file alone cannot be redrawn (the assistant only knows its size and colours); rendering the model to a picture first is a possible later step (roadmap F-19).
- A generated image is about 1.5 MB (PNG, 1024 px). The product editor's photo limit is 5 MB, so a much larger image would be refused at approval.
- Older drafts made before the chat existed open as a chat with no messages; their copy and pictures still show on the right. Chats from before "one chat per product" that already created their product show as `applied` and are closed.
- No daily spend cap yet; the per-chat image cap (12) and 2 mockups per message are the only limits.
- Images are not yet reviewed for "does this still look like my product" beyond your own eyes. Always compare with the real photo.
- Replies are not streamed: a message with mockups can take up to a minute.
