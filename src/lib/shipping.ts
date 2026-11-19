/**
 * Shipping fee: ONE definition, used by the checkout display, the /shipping rates page and order placement, so what the customer sees is
 * what is charged. The fee comes from where the parcel goes (its province, which gives a zone) and how heavy it is (the items' packed
 * weight plus the packaging), looked up in a rate table the owner edits in Admin -> Shipping. Pure: the config is passed in.
 * Amounts are integer centavos; weights are grams.
 */
import { z } from "zod";
import type { PsgcProvince } from "./psgc";

export const ZONE_IDS = ["metro-manila", "luzon", "visayas", "mindanao", "island"] as const;
export type ZoneId = (typeof ZONE_IDS)[number];
export const ZONE_LABELS: Record<ZoneId, string> = {
  "metro-manila": "Metro Manila",
  luzon: "Luzon (outside Metro Manila)",
  visayas: "Visayas",
  mindanao: "Mindanao",
  island: "Island provinces",
};

/**
 * Provinces that default to the "island" zone (parcels go by sea or air, so couriers charge more). PSGC codes, with the name for reading.
 * The owner can move any province to another zone in Admin -> Shipping.
 */
export const DEFAULT_ISLAND_PROVINCES: Record<string, string> = {
  "0200900000": "Batanes", "0502000000": "Catanduanes", "1704000000": "Marinduque", "0504100000": "Masbate", "1705900000": "Romblon",
  "1705100000": "Occidental Mindoro", "1705200000": "Oriental Mindoro", "1705300000": "Palawan", "1731599999": "City of Puerto Princesa",
  "0807800000": "Biliran", "1001800000": "Camiguin", "1806100000": "Siquijor", "0607900000": "Guimaras", "1608500000": "Dinagat Islands",
  "1900700000": "Basilan", "0990100000": "City of Isabela (Basilan)", "0906600000": "Sulu", "1907000000": "Tawi-Tawi",
};

const NCR_CODE = "1300000000";

/** The zone a province is in before the owner's overrides. */
export function defaultZone(p: Pick<PsgcProvince, "code" | "group">): ZoneId {
  if (p.code === NCR_CODE) return "metro-manila";
  if (DEFAULT_ISLAND_PROVINCES[p.code]) return "island";
  return p.group;
}

const zoneRecord = <T extends z.ZodType>(t: T) => z.object(Object.fromEntries(ZONE_IDS.map((z0) => [z0, t])) as Record<ZoneId, T>);

export const shippingConfigSchema = z
  .object({
    /** Upper limit of each weight tier, in grams, ascending. A parcel pays the first tier it fits in. */
    tiers: z.array(z.number().int().min(50).max(100_000)).min(1).max(10),
    /** Centavos per tier, per zone (same length as `tiers`). */
    rates: zoneRecord(z.array(z.number().int().min(0).max(10_000_000)).min(1).max(10)),
    /** Above the last tier: added per started extra kilogram, per zone. */
    overKgCents: zoneRecord(z.number().int().min(0).max(10_000_000)),
    /** Box, filler and tape, added to every parcel. */
    packagingGrams: z.number().int().min(0).max(5000),
    /** Used for a product that has no packed weight set. */
    defaultItemGrams: z.number().int().min(1).max(50_000),
    /** An order with a subtotal at or above this ships free. 0 = off. */
    freeOverCents: z.number().int().min(0).max(100_000_000),
    /** Province code -> zone, for provinces that are not in their default zone. */
    provinceZones: z.record(z.string().regex(/^\d{10}$/), z.enum(ZONE_IDS)),
    /** When the owner last checked the rates against the courier's rate card (YYYY-MM-DD), or "". */
    verifiedOn: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/),
    /** Shown on the rates page (for example the courier and delivery time). */
    note: z.string().trim().max(400),
  })
  .refine((c) => c.tiers.every((t, i) => i === 0 || t > c.tiers[i - 1]), { message: "Weight tiers must go up from light to heavy.", path: ["tiers"] })
  .refine((c) => ZONE_IDS.every((z0) => c.rates[z0].length === c.tiers.length), { message: "Every zone needs a price for every weight tier.", path: ["rates"] });
export type ShippingConfig = z.infer<typeof shippingConfigSchema>;

/** Starting rates: the J&T Express public walk-in rates from Luzon (January 2025). Confirm against your own courier rate card. */
export const DEFAULT_SHIPPING_CONFIG: ShippingConfig = {
  tiers: [500, 1000, 3000, 4000, 5000, 6000],
  rates: {
    "metro-manila": [9500, 16500, 19000, 28000, 37000, 46500],
    luzon: [8500, 15500, 18000, 27000, 36000, 45500],
    visayas: [10000, 18000, 20000, 30000, 40000, 50000],
    mindanao: [10500, 19500, 22000, 33000, 44000, 55000],
    island: [11500, 20500, 23000, 34000, 45000, 56000],
  },
  overKgCents: { "metro-manila": 9000, luzon: 9000, visayas: 10000, mindanao: 11000, island: 11000 },
  packagingGrams: 100,
  defaultItemGrams: 150,
  freeOverCents: 0,
  provinceZones: {},
  verifiedOn: "",
  note: "",
};

/** The saved settings, or the defaults when nothing valid is saved (a damaged document must not block checkout). */
export function parseShippingConfig(raw: unknown): ShippingConfig {
  if (raw === undefined || raw === null) return DEFAULT_SHIPPING_CONFIG;
  const r = shippingConfigSchema.safeParse({ ...DEFAULT_SHIPPING_CONFIG, ...(raw as object) });
  return r.success ? r.data : DEFAULT_SHIPPING_CONFIG;
}

export function zoneOf(cfg: ShippingConfig, p: Pick<PsgcProvince, "code" | "group">): ZoneId {
  return cfg.provinceZones[p.code] ?? defaultZone(p);
}

export type ShippingItem = { qty: number; weightGrams: number | null };

export type ShippingQuote = {
  zone: ZoneId;
  zoneLabel: string;
  /** What the parcel weighs: items + packaging. */
  grams: number;
  /** The tier it falls in, as text ("up to 1 kg"), or the over-the-top rule. */
  tierLabel: string;
  /** The fee from the table, before free shipping. */
  baseCents: number;
  /** What is charged. */
  feeCents: number;
  free: boolean;
};

export const kg = (grams: number) => `${Math.round((grams / 1000) * 100) / 100} kg`;

/** Pure: what shipping this order to this province costs. `province` is the PSGC province-level unit of the address. */
export function quoteShipping(cfg: ShippingConfig, province: Pick<PsgcProvince, "code" | "group">, items: ShippingItem[], subtotalCents: number): ShippingQuote {
  const zone = zoneOf(cfg, province);
  const grams = cfg.packagingGrams + items.reduce((s, i) => s + Math.max(1, Math.floor(i.qty)) * (i.weightGrams && i.weightGrams > 0 ? i.weightGrams : cfg.defaultItemGrams), 0);
  const tier = cfg.tiers.findIndex((t) => grams <= t);
  let baseCents: number;
  let tierLabel: string;
  if (tier >= 0) {
    baseCents = cfg.rates[zone][tier];
    tierLabel = `up to ${kg(cfg.tiers[tier])}`;
  } else {
    const last = cfg.tiers.length - 1;
    const extraKg = Math.ceil((grams - cfg.tiers[last]) / 1000);
    baseCents = cfg.rates[zone][last] + extraKg * cfg.overKgCents[zone];
    tierLabel = `over ${kg(cfg.tiers[last])} (${extraKg} extra kg)`;
  }
  const free = cfg.freeOverCents > 0 && subtotalCents >= cfg.freeOverCents;
  return { zone, zoneLabel: ZONE_LABELS[zone], grams, tierLabel, baseCents, feeCents: free ? 0 : baseCents, free };
}

/** The cheapest and dearest fee in the table, for "shipping from ₱X" text. */
export function rateRange(cfg: ShippingConfig): { minCents: number; maxCents: number } {
  const all = ZONE_IDS.flatMap((z0) => cfg.rates[z0]);
  return { minCents: Math.min(...all), maxCents: Math.max(...all) };
}

/** How an order's fee was worked out, from the snapshot saved on the order ("Luzon (outside Metro Manila) · 0.7 kg · up to 1 kg"), or null for older orders. */
export function shippingNote(shipAddress: Record<string, unknown>): string | null {
  const q = shipAddress.shipping as Partial<ShippingQuote> | undefined;
  if (!q || typeof q.zoneLabel !== "string" || typeof q.grams !== "number" || typeof q.tierLabel !== "string") return null;
  return `${q.free ? "Free shipping · " : ""}${q.zoneLabel} · ${kg(q.grams)} · ${q.tierLabel}`;
}
