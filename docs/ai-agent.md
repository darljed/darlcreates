# Admin agent

> Last updated: 2026-11-18

A chat on **every admin page** (floating button bottom right, or **Ctrl/Cmd + J**). It knows which page you are on, can look
things up, and can **propose** changes. A proposal shows exactly what would change (before and after) and nothing happens until you press
**Approve**. Uses the keys and the model chosen in [AI settings](./ai-studio.md) (a separate "Model for the agent" that must support tool calling;
empty = the writing model).

## Page awareness
Each message carries the page's address (`path` and query). The **server** then reads the record behind it (`lib/ai/agent/page-context.ts`):
on `/admin/products/<id>` the agent is given that product's details and id, on `/admin/orders/<id>` that order's, on list pages a one-line
description and any filters in the address. "This", "here" and "it" mean that page. The browser never supplies the record itself, so it cannot make
the agent see something false. The chat panel says "Looking at this product". Navigating keeps the chat (kept in the tab's `sessionStorage`).

## What it can do (`lib/ai/agent/tools.ts`)
| Kind | Tools |
|---|---|
| Read (runs at once) | `list_products`, `get_product`, `list_orders`, `get_order`, `sales_summary`, `list_parts` |
| Write (proposal, needs Approve) | `update_product`, `create_product` (always a draft), `set_product_costing`, `record_purchase`, `adjust_stock`, `create_offsite_sale` |

**Not available to it at all:** verifying payments, refunds, order status changes, users and roles, deleting anything, site content. If asked, it says
to do it by hand. Add a tool only after deciding how it is previewed and what happens if the model is tricked.

## How a change happens
1. The model asks for a write tool. The server validates the arguments (Zod), computes a **preview** from the live data (`before` and `after`), stores it as a row in
   `ai_drafts` (`kind = agent`) and tells the model "proposed, NOT applied". The chat shows a card with the diff.
2. **Approve** (`approveProposalAction`, admin only): the draft is claimed (`draft` → `applying`), the arguments are parsed again, the preview is recomputed and its
   `before` must still equal the stored one. If the data changed in between (you edited it, an order came in) the proposal is **refused** and you ask again.
   Then the existing Server Action runs (`updateProductAction`, `recordPurchaseAction`, ...), so every check, audit and cache refresh is the normal one. An
   `admin_audit` row `agent.apply:<tool>` records it. Proposals expire after 24 hours. **Reject** closes it.
3. Proposals still waiting show in the panel when you reopen it ("Waiting for your review") and as a number on the button.

If the model *says* it proposed something without calling the tool, the reply is flagged ("I did not actually create a proposal").

## Privacy and safety
- Read tools return no customer name, email, phone or address, and no payment proof. Only shop data goes to the AI provider.
- Tool results and page details are treated as data. Even a tricked model can only create proposals, never apply one.
- Limits: 8 tool rounds per message, 16 earlier turns sent, 40 messages per admin per hour (in memory per server instance), tool output cut at 6,000 characters.
- Cost is summed per reply (`costUsd`) from the provider.

## Files
`lib/ai/agent/{tools,run,apply,page-context}.ts`, `app/(admin)/admin/agent/actions.ts`, `components/ai/agent-dock.tsx` (mounted in the admin layout),
`lib/ai/providers.ts` (`chat` with `tools`). Tests: `npx tsx scripts/test-agent.ts` (needs the database; the model is scripted).

## Known limits
- Replies are not streamed: you wait for the whole answer.
- A draft left in `applying` by a server crash is not shown anywhere (rare).
- A model may ask for the same change twice; each is its own proposal.
- Only the tab's chat is kept, not a history across days.
