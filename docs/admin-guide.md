# Admin guide (for the owner)

> Last updated: 2026-11-11. Plain-language guide to `/admin`. Technical detail: [order-lifecycle.md](./order-lifecycle.md), [security.md](./security.md).

Sign in with Google using the owner account. Only accounts with the admin role see `/admin`. The sidebar has: Dashboard, Orders, Payments, Reviews, Products, Users, Landing page, Logos & branding, Store & footer, Legal pages. Your name and email at the bottom of the sidebar open My account, View storefront and Sign out.

## Daily routine

1. **Payments** → check each new reference against your GCash history → Verify or Reject.
2. **Orders** → move paid orders to *In production*, then *Ready to ship*, then enter courier and tracking and mark *Shipped*.
3. **Reviews** → approve or hide new reviews.

## Dashboard

Numbers use **verified payments only**. Cancelled and refunded orders are left out.
- Cards: verified revenue, paid orders, and counts waiting at each step.
- Chart: revenue per day for the last 30 days (Philippine time).
- Top products (by quantity sold) and recent orders.

## Payments

The queue of GCash references customers submitted. For each one:
- **Verify** only after you see the money in GCash with the same reference and amount. The order becomes *Paid* and the customer gets an email.
- **Reject** needs a reason (the customer sees it and can send a corrected reference). The order stays *Awaiting payment*.
- You cannot verify an order you placed yourself with the same account.
- The system will not verify if the amount differs from the order total.

## Orders

- Search by order number, customer name or email. Status chips show counts. 25 orders per page.
- Open an order to see items (with the choices the customer made), customer, delivery address, latest payment and history.
- **Download STL**: each item has a signed link to its print file. Customer-uploaded artwork shows a preview.
- Change status with the buttons shown (only valid next steps appear). Add a note if useful. Moves never go backwards.
- **Shipping**: enter courier, tracking number and status. Marking *Shipped* emails the customer.
- **Order Acknowledgment**: a printable page for the customer's records.
- **Print waybill**: a small (A6) internal slip for our own tracking: order barcode, who it ships to, what to pack, courier and tracking lines (filled in once you save the shipment) and tick boxes (Printed, Cleaned, Packed, Handed to courier). It warns "NOT VERIFIED: do not ship" if the payment isn't verified. It has no prices. It is **not** a courier label; book the courier separately. Scan the barcode into the Orders search box to jump to the order.
- **Refunds and cancelling a paid order**: this changes the status only. Send the money back yourself in GCash.

## Reviews

Customers can review a product only after the order is *Delivered*. New reviews are hidden until you **Approve** them; **Hide** takes one down again. Use the filter to see ones needing approval first.

## Products

- **New product**: name, description, category, base price (₱) and status.
  - *Draft*: only you see it. *Published*: in the shop. *Archived*: removed from the shop but kept for old orders.
- **Print model**: upload an STL or 3MF (up to 50 MB). Customers see it in 3D. Only you can download the file.
- **Photos**: up to 5 MB each. The first photo is the shop thumbnail; delete from the photo grid.
- **Customization builder**: add options customers choose from: *color* (swatches), *size* (choices with price changes), *text* (with a length limit) and *image* (customer uploads artwork). Each choice can add to the price.
- Changing a product never changes orders already placed. They keep what the customer bought and paid.
- Changes appear on the storefront right away.

### Uploading a 3MF from Bambu Studio sets most of this up for you

If the 3MF has a **text element** (Bambu Studio's text tool) as an example, uploading it does the rest: the name position, size and depth are taken from the example, the example is removed from the model (so customers and the print file never show it), a "Name" option is added if the product has none, and the closest font is chosen. If the product has no colour option, **Colors** is created from the project's filaments. Toasts tell you what it did; check it under "Name on the model" and adjust if needed. A normal part is raised text. (Engraved text is not supported yet.) An STL upload changes nothing, and options you already have are never overwritten.

### Fonts

Under "Name on the model", pick the default **Font** and tick the fonts **customers can choose** (two or more shows a Font picker above the name preview). Bold, Chunky and Marker print sturdiest; Script has thin strokes and refuses longer names.

### Putting the customer's name on a product

For a product with an **STL or 3MF** model and a **text** option (for example "Name"): open the product, scroll to **Name on the model**, and click the spot on the 3D model where the name should go. Drag to turn the model first if you need another face. Then set:
- **Letter height**, **Widest name** and **Tallest name** (mm). Widest and tallest together are the area the name must stay inside, tails and loops included (a Script "Gypsy" is much taller than "Maria"); a bigger name is made smaller to fit; a name so long its letters would be too thin is refused for the customer with a message.
- **Stands out** (how far the letters rise, about 1.2 mm) and **Sunk in** (leave at 0.4 so the letters fuse to the surface).
- **Font** (Bold or Chunky) and **Rotate**.

The size boxes are **limited to what fits** at the spot you clicked ("max N mm here"); if you ask for more, the other value is reduced so the name stays on the surface. If there is no room, the editor says so. Under **Name colours** add the colours customers may pick for the name (from your Colors, or any colour), with the slicer filament number if you want the print file to assign it; the **Preview** button shows a colour on the model.

Type a sample name to see it; the line under it shows the real size and the thinnest stroke. **Save position.** Customers now see their name on the model as they type. In an order, the item's download is a **3MF with two parts: the base and the name**. Open it in your slicer and give the name its own filament if you want a contrasting colour. If the name would hang off the surface, saving is refused and the message tells you the widest name that fits; lower "Widest name" (or move the spot) and save again. The name is a part of the model's object, so you can still give it its own filament in the slicer.

## Users

Find customers by name or email; filter by active, blocked, admins or deleted. A user page lets you:
- Fix their **name, email or private note**, and edit or delete their **saved addresses**.
- See **where they are signed in** and end any session.
- **Sign out everywhere**: sign-in is Google only, so there are no passwords to reset; this is the equivalent. They sign in again with Google.
- **Block**: refuses sign-in and ends all sessions at once. Give a reason; it is kept private and the customer is not told. **Unblock** reverses it.
- **Ask them to accept the privacy policy again**: this user sees the consent screen on their next visit. To ask every customer, use Legal pages.
- **Delete the account**: refused while they have an order in progress.
- The **Activity log** lists what admins did to the account.
- Admin accounts cannot be blocked or deleted here, and you cannot block, delete or sign out your own account (use your Sign out menu).

## Landing page

Edit what customers see on the home page: announcement bar, hero (headline, text, buttons, image), highlights, featured products, FAQ and the call-to-action band. Save to publish. Empty sections are hidden.

## Search engines and AI answers

Under **Store & footer** the panel "Search engines and AI answers" holds the title and description Google, Facebook and AI assistants show for your home page. Aim for about 60 and 155 characters; say what you make, where and how to buy. Product pages build theirs from the product name and description, so write a clear first sentence in each product description. The landing-page FAQ is also published for search and AI answers, so keep it accurate (payment, timing, shipping).

## Installing the shop as an app

Customers can install the site on their phone or computer from the "Install the app" link in the footer (iPhone: Share, then Add to Home Screen). It opens full-screen and shows an offline page when there is no connection. The installed icon is your browser-tab icon if you upload one that is 512 px or larger, otherwise the built-in logo icon.

## Logos & branding

Six upload slots: wide logo, dark-background logo, icon-only mark, browser-tab icon, phone home-screen icon and link-sharing image. Each slot shows where it is used, the exact size and allowed types, and a preview. Files are checked again on the server. SVG is not accepted. **Use built-in logos** restores the originals.

## Store & footer

Store name, tagline, about text, contact email, phone, address, hours, explore links and social links. These show in the footer of every storefront page and in emails.

## Legal pages

Privacy Policy and Terms and Conditions, each with *Write* and *Preview* tabs (preview at desktop or phone width).
- Toolbar for headings, bullets and links (unsafe links are refused). Word count and section outline help you move around.
- A dot marks unsaved changes; leaving the page warns you. Ctrl/Cmd+S saves. Discard restores the saved text.
- The page shows who last saved and how many customers accepted the current privacy version.
- **Ask every customer to accept again** raises the privacy version. Do this only for a material change.
- Have a lawyer review the text before relying on it.

## Common workflows

| Task | Steps |
|---|---|
| Customer paid but I cannot find it | Payments → check the pending list. If the amount in GCash differs from the order total, reject with the reason and ask for the right payment |
| Customer sent the wrong reference | Reject with the reason. They submit a new one |
| Customer wants to cancel before paying | They can cancel from their order page. You can also cancel in Orders |
| Customer wants to cancel after paying | Orders → Cancel (or Refunded), then return the money in GCash |
| Print a packing slip | Orders → open the order → Print waybill → Print |
| Take a product off the shop | Products → set status to Archived |
| Customer locked out or reports a hijacked account | Users → Sign out everywhere (or Block) |
| Customer asks for their data or deletion | They use My account → Download my data / Delete account. You can delete from their user page |
| Change the shipping fee | Not editable in the admin. It is a flat ₱80 constant in `src/lib/shipping.ts` (see [configuration.md](./configuration.md)) |
