# Shipping fees and Philippine addresses

Replaces the old flat ₱80 (G-75, F-05). The fee depends on **where the parcel goes** and **how heavy it is**, from a rate table the owner edits. The
destination is picked from dropdowns of the official Philippine location list, so it is exact, and the same figure is shown at checkout and charged.
Background and the rate sources: [shipping-research.md](./shipping-research.md).

## How the fee is worked out
```
zone   = the province's zone            (default by island group; Metro Manila; island provinces; the owner can move any province)
grams  = packaging + sum of (quantity x packed weight of each product; the default item weight when a product has none)
fee    = the table's price for (zone, first weight tier the parcel fits in)
         over the last tier: the last tier's price + (started extra kilograms x the zone's per-kg price)
         free when the subtotal is at or above the owner's free-shipping amount (if set)
```
- Five zones: **Metro Manila, Luzon (outside Metro Manila), Visayas, Mindanao, Island provinces**. The default island list (Batanes, Catanduanes, Marinduque, Masbate, Romblon, both Mindoros, Palawan and Puerto Princesa, Biliran, Camiguin, Siquijor, Guimaras, Dinagat, Basilan, Sulu, Tawi-Tawi) is in `DEFAULT_ISLAND_PROVINCES`; independent cities follow their island group.
- The starting table is the **J&T Express public walk-in rates from Luzon, January 2025** (₱85 to ₱560). It is a starting point: the owner checks it against their own courier rate card in **Admin → Shipping** and sets the "last checked" date.
- Everything is in `src/lib/shipping.ts` (pure, `quoteShipping`); the settings live in the `site_content` document `shipping` (cache tag `site:shipping`).
- **Where the customer sees it:** checkout (the fee updates when the province is picked, with the zone, weight and tier under it), the public **/shipping** rates page (table, provinces per zone, a "check your fee" box), the cart note, the product page note, the footer, and the order pages (how the fee was worked out).
- **What an order keeps:** `orders.shipping_cents` and, in `ship_address.shipping`, the zone, weight, tier and fee (so a later change to the table never changes an old order).
- **Server is the authority:** `placeOrder` recomputes the fee from the validated address and the product weights; the browser's figure is only a preview.

## Packed weight
Each product has an optional **Packed weight (g)** (admin product form): one unit with its wrapping. Without it the shop's default item weight applies, so the fee is still sensible on day one. Volumetric (box-size) weight is not modelled: enter a heavier packed weight for bulky items.

## The address
Customers pick **Province → City / Municipality → Barangay** (and type street, optional landmark and postal code). The picker (`src/components/location-picker.tsx`) fetches small static files; nothing is typed free-form for the location.
- **Data:** the PSA Philippine Standard Geographic Code (PSGC), Q1 2026 release, via the MIT-licensed `psgc` package: **18 regions (with Negros Island Region and BARMM), 102 province-level units, 1,642 cities and municipalities, 42,010 barangays**. Province-level units include Metro Manila and the independent cities and special areas that PSGC lists that way (shown as "City of Baguio (independent city)"). City of Manila's 14 districts are merged into it (897 barangays); poblacion barangays are marked "(Pob.)".
- **Files:** `public/psgc/index.json` (regions and provinces) and `public/psgc/p/<province code>.json` (that province's cities and barangays), 1.2 MB in all, fetched only when a province is chosen. Built by `scripts/build-psgc.ts` (it explains how to refresh when PSA publishes a new quarter).
- **Checked on the server:** the three codes must exist and belong together (a city from another province, a barangay from another city, or a made-up code is refused); the names saved on the order, the waybill and the address book come from the data, never from the browser (`completeAddress`, `resolveLocation`).
- **Saved addresses** keep the codes (`addresses.region_code`, `province_code`, `city_code`, `barangay_code`). Older addresses with only text are matched to the list when exactly one match exists (`guessLocation`); otherwise the customer is asked to pick the location once.
- Admins edit a customer's saved address with the same picker (Admin → Users).

## Known limits
- The default rates are J&T's public walk-in rates, not a merchant rate card; courier prices change, so check them (the page shows when they were last checked).
- No "pick up in San Pablo" option, no courier API, no automatic booking (booking stays manual with the waybill).
- No postal-code lookup (it is optional and typed). PSGC changes each quarter; barangays merged or renamed since the data's date will not be in the list until it is rebuilt.
- Zones are per province: a few remote municipalities inside a mainland province (for example parts of Siargao) cost more to reach but share the province's zone.

## Tests
`npx tsx scripts/test-psgc.ts` (data completeness and consistency, resolving and refusing codes, guessing older addresses, a zone for every province) and `npx tsx scripts/test-shipping.ts` (the rate math, saved settings, and real orders: the fee, the snapshot, forged locations refused, names replaced, saved address codes).
