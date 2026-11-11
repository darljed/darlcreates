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
| Take a product off the shop | Products → set status to Archived |
| Customer locked out or reports a hijacked account | Users → Sign out everywhere (or Block) |
| Customer asks for their data or deletion | They use My account → Download my data / Delete account. You can delete from their user page |
| Change the shipping fee | Not editable in the admin. It is a flat ₱80 constant in `src/lib/shipping.ts` (see [configuration.md](./configuration.md)) |
