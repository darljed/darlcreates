# Shipping: how to calculate it and how to integrate it (research)

> Researched 2026-11-11. Status: **proposal, nothing built** (tracked as F-05). Rate numbers below come from public pages dated 2023 to January 2025, so treat them as a starting point and confirm against your own courier rate card before using them.

Today checkout charges a flat ₱80 (`src/lib/shipping.ts`, `FLAT_SHIPPING_CENTS`). That is wrong for most orders: a keychain to Laguna costs the courier far less than a phone stand to Mindanao.

## Recommendation (short)

1. **Build our own rate table now, no courier API.** Shipping fee = lookup of *chargeable weight* × *destination zone*, editable by the owner in the admin. Cost: no per-order fees, no account approvals, about a day or two of work.
2. **Add a "Pick up in San Pablo" option** at ₱0.
3. **Keep booking manual** (the owner books in the courier's own app/portal) and use the internal waybill we just added for tracking. Do not integrate a courier API until order volume justifies the paperwork.
4. **Later, if volume grows:** Lalamove API for same-day local delivery (real quotes), and a tracking API (AfterShip / TrackingMore) to update shipment status automatically.

## How shipping cost is really worked out

A courier bills the **chargeable weight**: the larger of the real weight and the volumetric weight.

- Volumetric weight (kg) = length × width × height (cm) ÷ 3500 for J&T Express Philippines, according to a J&T parcel-size announcement ([copy on Scribd](https://www.scribd.com/document/870724412/Announcement-Peak-Season-08-15-23)). Other express couriers commonly use 5000.
- **3D prints are light but bulky**, so the box size often decides the price, not the plastic. A 30 × 24 × 16 cm box is 3.3 kg volumetric even if the print weighs 200 g.
- Price = rate for (origin zone, destination zone, weight tier). Origin is fixed for us (San Pablo, Laguna = Luzon).
- Rates are in weight tiers, so a tiny parcel pays the **minimum tier** whatever it weighs. That makes the small-item case a minimum-fee problem, not a weight problem.

### J&T Express published walk-in rates, from Luzon (₱, January 2025)

Source: [Tech Pilipinas, J&T rates](https://techpilipinas.com/jt-express-shipping-rates/), which quotes J&T Philippines' Facebook page. Up to 6 kg; heavier parcels are quoted by the branch.

| Weight | Luzon | Metro Manila | Visayas | Mindanao | Island |
|---|---|---|---|---|---|
| up to 0.5 kg | 85 | 95 | 100 | 105 | 115 |
| 0.5 to 1 kg | 155 | 165 | 180 | 195 | 205 |
| 1 to 3 kg | 180 | 190 | 200 | 220 | 230 |
| 3 to 4 kg | 270 | 280 | 300 | 330 | 340 |
| 4 to 5 kg | 360 | 370 | 400 | 440 | 450 |
| 5 to 6 kg | 455 | 465 | 500 | 550 | 560 |

Things to know:
- These are walk-in/public rates. Merchants with an account get their own (usually lower) rate card; ask J&T for it.
- A Play Store review of the J&T app reports a pickup quoted at ₱220 but ₱320 collected by the rider, so keep a small buffer or confirm the final figure on the waybill.
- For very small parcels the Philippine Post is cheaper on paper (about ₱60 up to 250 g within Luzon, per [PHLPost postal rates](https://phlpost.gov.ph/postal-rates/)), but it is slower. Worth knowing for keychains.
- J&T box prices (extra small to large) are separate from shipping and add ₱30 to ₱80 per parcel.

### Estimating the weight of a print

You need a weight per product. Two ways:
- **Weigh it** once with the packaging and type it in the product form. This is the truth and takes a minute per product.
- **Estimate from the model** to pre-fill the field: grams ≈ model volume (cm³) × density × fill factor. PLA is about 1.24 g/cm³, PETG 1.27, ABS 1.04 ([example calculator](https://www.zerosuniverse.com/tools/3d-mesh-obj-stl-polygon-print-calculator/)). The fill factor depends on walls and infill (a 15 to 20 % infill part is often 30 to 50 % of solid). We already hold the STL/3MF, and the volume of a mesh is a short computation, but it is an estimate only.

### What a correct calculation needs (data model)

| Piece | Where it lives |
|---|---|
| Packed weight (g) and packed size (L × W × H cm) per product | New product fields; default to a small standard box |
| Packaging weight per parcel | One setting |
| Destination zone | Province → zone map (Metro Manila, Luzon, Visayas, Mindanao, Island). Static data; islands such as Palawan, Mindoro, Siargao, Catanduanes belong in "Island" |
| Rate table (zone × weight tier → centavos) | Owner-editable document in `site_content`, validated with Zod, with a "last verified" date |
| Rules | Free shipping above a threshold? Pass the courier fee through exactly, round up to the next ₱5, or add a handling fee |

Parcel logic: add the items' weights plus packaging, estimate one box from the summed volume (plus a packing allowance), take the larger of actual and volumetric weight, then look up the tier. Store the result in `orders.shipping_cents` (already a snapshot) together with how it was calculated, so old orders never change when rates do.

## Integration options compared

| Option | What it gives | Cost and effort | Verdict |
|---|---|---|---|
| **Own rate table** (zone × weight) | Predictable fee at cart and checkout | Free. One to two days. Rates need manual updating (an admin screen and a "last verified" date keep that honest) | **Do this first.** It is also how most Philippine sellers do it, since no Philippine courier is natively supported by the big platforms ([Prosperna overview](https://www.prosperna.com/blog/shopify-shipping-philippines-local-courier-guide); note it is a competitor's marketing article) |
| **J&T Express** | Cheapest mainstream courier, free pickup | No public developer portal found ([API Evangelist profile](https://providers.apievangelist.com/providers/j-and-t-express/)). Merchant account and its VIP dashboard exist; the Shopify app is reported as unreliable for order sync | Book manually in J&T's app. Revisit only with volume |
| **Lalamove API** | Real same-day quotes with price breakdown and proof of delivery | Public docs at [developers.lalamove.com](https://developers.lalamove.com/); needs a business account and an API key that can take days to get; per-trip pricing, expensive outside the city | Good later for local rush deliveries |
| LBC, Ninja Van, Flash Express | Partner APIs | Behind commercial agreements; no public docs found | Skip for now |
| Aggregators such as Shippo | One API for many carriers | Strong in the US/EU; I found no sign that it covers Philippine couriers | Not useful here |
| Tracking APIs (AfterShip, TrackingMore) | Automatic status for J&T Philippines tracking numbers | Free tiers exist; tracking only, no rates | Optional later: update shipment status without typing |
| Store pickup | ₱0 shipping | Trivial | Add now |

## Worked examples (J&T, from Luzon, January 2025 prices)

| Order | Chargeable weight | Zone | Fee |
|---|---|---|---|
| 1 keychain (30 g, small pouch) | under 0.5 kg | Luzon | ₱85 |
| 1 phone stand (150 g, 14 × 12 × 10 cm = 0.48 kg volumetric) | under 0.5 kg | Visayas | ₱100 |
| 3 phone stands (450 g, box 30 × 24 × 16 cm = 3.3 kg volumetric) | 3 to 4 kg | Mindanao | ₱330 |

The third row shows why box size matters: the plastic weighs under half a kilo but the courier bills 3.3 kg. Smart packing (flat-pack, smaller box) is real money.

## Questions for the owner

1. Which courier do you use or want to use first (J&T, LBC, Lalamove), and do you have a merchant rate card?
2. Pass the exact courier fee to the customer, or round and add a small handling fee?
3. Free shipping above a certain order value? Pickup in San Pablo allowed?
4. Do you already know each product's packed weight and box size, or should the app estimate weight from the model to help?

## Suggested build order (when approved)

1. Product weight and packed-size fields, plus a packaging setting.
2. Province → zone map and the editable rate table (admin page, validation, "last verified").
3. Pure `calculateShipping(items, province)` in `src/lib/shipping.ts` with tests (replaces the flat fee; `placeOrder` and the checkout display both call it, so what the customer sees is what is charged, as today).
4. Pickup option and free-shipping threshold.
5. Optional: Lalamove quote for local addresses; tracking API for automatic status.

Content from the sources above was rephrased for compliance with licensing restrictions.
