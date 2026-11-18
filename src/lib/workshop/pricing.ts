// Pure pricing calculations for the estimator (ported from the 3dEstimator app).
// Source of truth for the math: docs/workshop.md ("The costing model"). Amounts here are in pesos (floats), because this is a
// calculator; they become integer centavos at the edge (src/lib/money.ts) when something is saved.
// No I/O here: pure functions, covered by scripts/test-workshop.ts.

export interface Settings {
  electricityRate: number; // ₱/kWh
  powerWatts: number; // W (average draw)
  printerPrice: number; // ₱ (for depreciation)
  printerLifetimeHours: number; // expected productive hours
  maintenancePerHr: number; // ₱/hr (nozzles, belts, wear)
  laborRate: number; // ₱/hr
  failurePct: number; // % buffer for failed prints
  queuePremiumPerHr: number; // ₱/hr opportunity premium (0 = off)
  margins: [number, number, number]; // fractional, e.g. [0.3, 0.5, 0.65]
  roundingStep: number; // round final tier price UP to nearest ₱ (1 | 5 | 10)
}

export interface Job {
  filamentGrams: number; // legacy single-material grams (used when `materials` is empty)
  printHours: number; // decimal hours (3h37m -> 3.6167)
  materialPricePerKg: number; // legacy single-material ₱/kg
  laborMinutes: number;
  quantity: number;
  quantityMode?: QuantityMode; // how quantity scales cost (default "per-unit")
  materials?: MaterialLine[]; // one line per filament/color/material used
  wastePct?: number; // extra % of filament lost to purge/tower/supports (default 0)
  components?: Component[]; // optional attached add-on parts (per unit)
  lineItems?: LineItem[]; // optional ad-hoc fees (design, delivery, rush…)
}

/**
 * One filament used by the job (a color and/or a material type). `grams` is in
 * the same frame as the rest of the job's print inputs: ONE piece in "per-unit"
 * mode, the WHOLE plate in "batch" mode. When `partId` is set the line is a real
 * inventory part (price locked to its weighted-average cost, grams deducted from
 * stock via the product BOM); otherwise it is a priced-only preset/custom line.
 */
export interface MaterialLine {
  partId?: string | null;
  name: string;
  grams: number;
  pricePerKg: number; // ₱/kg
}

/**
 * What the Quantity field + the entered grams/print-time mean:
 * - "per-unit" (default): grams/time describe ONE piece; EVERYTHING scales ×qty
 *   (making N identical pieces, each its own print). Per-unit price stays flat.
 * - "batch": grams/time describe the WHOLE print that yields `quantity` pieces.
 *   Material + machine are shared (entered as the batch total, NOT ×qty); only
 *   per-piece costs (components + labor) scale ×qty. Per-unit price DROPS as the
 *   fixed print cost is split across more pieces.
 */
export type QuantityMode = "per-unit" | "batch";

/**
 * An ad-hoc fee on a quote beyond parts/machine/labor (design fee, delivery,
 * rush surcharge…). Applied for the WHOLE job (not per unit, not ×qty).
 * - `applyMargin: true`  → folded into cost, so the failure buffer AND the
 *   pricing margin apply on top of it (e.g. a design fee you want to profit on).
 * - `applyMargin: false` → pure pass-through: added to the final selling price
 *   AFTER margin, contributing zero profit (e.g. courier fee you just relay).
 */
export interface LineItem {
  label: string;
  amount: number; // ₱ (whole-job)
  applyMargin: boolean;
}

/** Unit a component is priced in. Display-only; cost is unitPrice * qty regardless. */
export type ComponentUnit = "piece" | "g" | "mL" | "cm";

/**
 * An attached add-on part used to build the product (mechanical keyboard,
 * keychain chain, wire, glue, …). Priced as unitPrice × qty, PER produced unit.
 * `unit` is a label for the UI; the cost math is unit-agnostic.
 */
export interface Component {
  name: string;
  unit: ComponentUnit;
  unitPrice: number; // ₱ per unit
  qty: number; // how many units per produced item
  partId?: string | null; // when set, this component IS an inventory part
}

export interface CostBreakdown {
  machineHourRate: number;
  material: number; // filament cost before waste (Σ over material lines)
  materialWaste: number; // extra filament cost from the waste allowance
  totalGrams: number; // Σ grams across lines, INCLUDING waste (what is consumed)
  materialLines: { name: string; grams: number; cost: number }[]; // per-line cost, pre-waste
  components: number; // sum of attached component line costs (per unit)
  machine: number;
  labor: number;
  subtotal: number;
  failure: number;
  unitCost: number;
  marginLineItems: number; // ad-hoc fees that margin applies to (whole-job)
  passThroughLineItems: number; // ad-hoc fees added after margin (whole-job)
  totalCost: number; // unitCost * quantity + marginLineItems (the margin base)
}

export interface Tier {
  marginPct: number; // 0..1
  price: number; // exact selling price (for the whole quantity)
  rounded: number; // price rounded up to nearest ₱5 (for the whole quantity)
  profit: number; // rounded - totalCost (for the whole quantity)
  pricePerUnit: number; // rounded / quantity
  profitPerUnit: number; // profit / quantity
}

export const DEFAULT_SETTINGS: Settings = {
  electricityRate: 12,
  powerWatts: 150,
  printerPrice: 25000,
  printerLifetimeHours: 5000,
  maintenancePerHr: 2,
  laborRate: 150,
  failurePct: 5,
  queuePremiumPerHr: 0,
  margins: [0.3, 0.5, 0.65],
  roundingStep: 5,
};

/** Machine-time → money. Depreciation + maintenance + electricity (+ optional queue premium). ₱/hr. */
export function machineHourRate(s: Settings): number {
  const depreciation =
    s.printerLifetimeHours > 0 ? s.printerPrice / s.printerLifetimeHours : 0;
  const electricity = (s.powerWatts / 1000) * s.electricityRate;
  return depreciation + s.maintenancePerHr + electricity + s.queuePremiumPerHr;
}

/** Sum of attached component line costs (per produced unit). Empty/absent -> 0. */
export function componentsCost(components?: Component[]): number {
  if (!components || components.length === 0) return 0;
  return components.reduce(
    (sum, c) => sum + (c.unitPrice || 0) * (c.qty || 0),
    0,
  );
}

/** Split ad-hoc line items into margin-applied vs pass-through totals (whole-job). */
export function lineItemsSplit(items?: LineItem[]): {
  marginLineItems: number;
  passThroughLineItems: number;
} {
  let marginLineItems = 0;
  let passThroughLineItems = 0;
  for (const it of items ?? []) {
    const amt = it.amount || 0;
    if (it.applyMargin) marginLineItems += amt;
    else passThroughLineItems += amt;
  }
  return { marginLineItems, passThroughLineItems };
}

/**
 * The job's material lines. Falls back to the legacy single-material fields so
 * old saved quotes (and callers that never set `materials`) behave exactly as
 * before: one anonymous line of `filamentGrams` at `materialPricePerKg`.
 */
export function resolveMaterials(job: Job): MaterialLine[] {
  const lines = (job.materials ?? []).filter((m) => (m.grams || 0) > 0);
  if (lines.length > 0) return lines;
  if ((job.filamentGrams || 0) > 0) {
    return [
      {
        partId: null,
        name: "Filament",
        grams: job.filamentGrams,
        pricePerKg: job.materialPricePerKg || 0,
      },
    ];
  }
  return [];
}

/** Waste multiplier: 1 + wastePct/100 (never below 1). Real filament, so it is
 *  both costed AND deducted from stock. */
export function wasteFactor(wastePct?: number): number {
  return 1 + Math.max(0, wastePct || 0) / 100;
}

/**
 * The tracked-filament BOM for ONE finished piece: one entry per inventory part
 * (rows sharing a part are summed), grams INCLUDING the waste allowance, and in
 * batch mode divided by the yield (the entered grams are for the whole plate).
 * Priced-only preset rows (no partId) have nothing to deduct and are skipped —
 * their cost stays in the product's print cost.
 */
export function perPieceMaterialParts(
  job: Job,
): { partId: string; name: string; qty: number; pricePerKg: number }[] {
  const divisor =
    (job.quantityMode ?? "per-unit") === "batch"
      ? Math.max(1, job.quantity || 1)
      : 1;
  const waste = wasteFactor(job.wastePct);
  const byPart = new Map<
    string,
    { partId: string; name: string; qty: number; pricePerKg: number }
  >();
  for (const m of resolveMaterials(job)) {
    if (m.partId == null) continue;
    const qty = (m.grams * waste) / divisor;
    const cur = byPart.get(m.partId);
    if (cur) cur.qty += qty;
    else
      byPart.set(m.partId, {
        partId: m.partId,
        name: m.name,
        qty,
        pricePerKg: m.pricePerKg,
      });
  }
  return [...byPart.values()];
}

/** Full cost build-up for a job. See COSTING-MODEL §3. */
export function computeCost(job: Job, s: Settings): CostBreakdown {
  const rate = machineHourRate(s);
  const quantity = Math.max(1, job.quantity || 1);
  const mode: QuantityMode = job.quantityMode ?? "per-unit";

  // Raw, as entered. In per-unit mode these describe ONE piece; in batch mode
  // material+machine describe the whole plate, components+labor are per-piece.
  const lines = resolveMaterials(job);
  const materialLines = lines.map((m) => ({
    name: m.name,
    grams: m.grams,
    cost: (m.grams / 1000) * m.pricePerKg,
  }));
  const material = materialLines.reduce((sum, l) => sum + l.cost, 0);
  // Waste allowance (purge/tower/supports on multi-color prints): extra filament
  // proportional to what's used. Costed here, and deducted via wasteFactor().
  const waste = wasteFactor(job.wastePct);
  const materialWaste = material * (waste - 1);
  const totalGrams = lines.reduce((sum, m) => sum + m.grams, 0) * waste;
  const components = componentsCost(job.components);
  const machine = rate * job.printHours;
  const labor = s.laborRate * (job.laborMinutes / 60);

  const { marginLineItems, passThroughLineItems } = lineItemsSplit(
    job.lineItems,
  );

  let subtotal: number;
  let failure: number;
  let unitCost: number;
  let buildCost: number; // cost of the whole job before whole-job fees

  if (mode === "batch") {
    // One print yields `quantity` pieces: material + machine are shared (fixed),
    // components + per-piece labor scale ×qty. Failure buffer covers the lot.
    subtotal =
      material + materialWaste + machine + (components + labor) * quantity;
    failure = subtotal * (s.failurePct / 100);
    buildCost = subtotal + failure; // whole batch
    unitCost = buildCost / quantity; // derived per-piece (drops as qty rises)
  } else {
    // per-unit: grams/time/labor describe ONE piece; everything scales ×qty.
    subtotal = material + materialWaste + components + machine + labor; // one piece
    failure = subtotal * (s.failurePct / 100);
    unitCost = subtotal + failure;
    buildCost = unitCost * quantity;
  }

  // Ad-hoc margin-applied fees are whole-job (not per unit, not failure-buffered
  // — a design fee isn't "wasted" on a failed print). Pass-through fees are
  // surfaced separately and added after margin in priceTiers.
  return {
    machineHourRate: rate,
    material,
    materialWaste,
    totalGrams,
    materialLines,
    components,
    machine,
    labor,
    subtotal,
    failure,
    unitCost,
    marginLineItems,
    passThroughLineItems,
    totalCost: buildCost + marginLineItems,
  };
}

/** Round a price UP to the nearest ₱5 for clean quoting. (Legacy default step.) */
export function roundTo5(n: number): number {
  return Math.ceil(n / 5) * 5;
}

/**
 * Round a price UP to the nearest `step` pesos (step<=0 -> no rounding).
 * The value is first snapped to 1e-6: binary floats make e.g. 21/(1-0.3) come out
 * as 30.000000000000004, which a bare Math.ceil would push a whole step higher
 * (₱35 instead of ₱30).
 */
export function roundUpTo(n: number, step: number): number {
  if (!(step > 0)) return n;
  // Snap the QUOTIENT (not just n): n/step is itself inexact for fractional
  // steps (1.1/0.1 = 11.000000000000002 would ceil to 12).
  return Math.ceil(Math.round((n / step) * 1e6) / 1e6) * step;
}

/**
 * Default selling price for ONE finished piece, from its per-piece cost and a
 * margin (margin, NOT markup), rounded up once. Deliberately fee-free: whole-job
 * fees (design/delivery) belong to the quote, not to a reusable product price.
 */
export function productUnitPrice(
  unitCost: number,
  margin: number,
  roundingStep: number,
): number {
  const safe = Math.min(Math.max(margin, 0), 0.95);
  return roundUpTo(unitCost / (1 - safe), roundingStep);
}

/**
 * Three margin tiers. price = cost / (1 - margin)  (margin, NOT markup).
 * `marginBase` is the margin-bearing cost for the whole quantity (i.e.
 * CostBreakdown.totalCost, which already includes margin-applied line items).
 *
 * Pass-through line items (`passThrough`, whole-job) are added to the selling
 * price AFTER margin and rounding, contributing zero profit — they're relayed
 * at cost. Profit is therefore measured against the margin base only.
 *
 * `margins` may be the Settings defaults or per-tier slider overrides.
 * `roundingStep` rounds the final price up (defaults to ₱5 for back-compat).
 */
export function priceTiers(
  marginBase: number,
  margins: [number, number, number],
  quantity = 1,
  opts: { roundingStep?: number; passThrough?: number } = {},
): Tier[] {
  const qty = Math.max(1, Math.floor(quantity) || 1);
  const step = opts.roundingStep ?? 5;
  const passThrough = opts.passThrough ?? 0;
  return margins.map((m) => {
    // Guard against a 100%+ margin (division by zero / negative).
    const safeMargin = Math.min(Math.max(m, 0), 0.95);
    const marginPrice = marginBase / (1 - safeMargin);
    // Round the margin-bearing part, then add pass-through at cost on top.
    const rounded = roundUpTo(marginPrice, step) + passThrough;
    // Profit excludes pass-through (relayed at cost) — measure vs margin base.
    const profit = rounded - passThrough - marginBase;
    return {
      marginPct: m,
      price: marginPrice + passThrough,
      rounded,
      profit,
      pricePerUnit: rounded / qty,
      profitPerUnit: profit / qty,
    };
  });
}

/** Convenience: hours+minutes -> decimal hours. */
export function toDecimalHours(hours: number, minutes: number): number {
  return (hours || 0) + (minutes || 0) / 60;
}
