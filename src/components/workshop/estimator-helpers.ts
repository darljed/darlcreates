import {
  DEFAULT_SETTINGS,
  computeCost,
  perPieceMaterialParts,
  productUnitPrice,
  toDecimalHours,
  type Component,
  type Job,
  type LineItem,
  type MaterialLine,
  type Settings,
} from "@/lib/workshop/pricing";
import { PART_UNITS, TIER_LABELS, type PartUnit } from "@/lib/workshop/presets";
import type { EstimateInput, JobFormState } from "@/lib/workshop/types";

/**
 * Shared, non-visual helpers for the estimator UI: the peso formatters, the native-select class, the form row factory, turning
 * the typed form into a pricing `Job`, restoring a saved estimate's snapshot (defensively, it is stored JSON), and building the
 * one-piece "product draft" used by Save as product. The cost maths itself stays in `@/lib/workshop/pricing`.
 */

/** A pesos amount with two decimals: `₱1,234.50`. The estimator works in pesos; centavos only exist at the save edge. */
export const peso = (n: number): string =>
  "₱" + (Number.isFinite(n) ? n : 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Whole pesos when the amount is whole (tier prices), otherwise two decimals so relayed cents are not hidden. */
export const peso0 = (n: number): string => (Number.isInteger(n) ? "₱" + n.toLocaleString("en-PH") : peso(n));

/** Classes that make a native `<select>` look like the shadcn `Input`. */
export const selectClass =
  "h-9 w-full min-w-0 rounded-md border border-input bg-background px-2 text-base shadow-xs outline-none transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30 [&_option]:bg-background [&_option]:text-foreground";

/** One filament row of the job form (strings, as typed). */
export type MaterialRow = JobFormState["materials"][number];

/** A tracked inventory filament the form can pick: its cost is the part's weighted average per kg. */
export interface FilamentOption {
  id: string;
  name: string;
  pricePerKg: number;
}

export const emptyMaterialRow = (): MaterialRow => ({ partId: null, name: "PLA", grams: "", pricePerKg: "750" });

export const emptyJob = (): JobFormState => ({
  printH: "",
  printM: "",
  materials: [emptyMaterialRow()],
  wastePct: "",
  laborMinutes: "",
  quantity: "1",
  quantityMode: "per-unit",
});

export const isPartUnit = (u: string): u is PartUnit => (PART_UNITS as readonly string[]).includes(u);

/** The form's strings turned into the numbers the cost model wants (blank or junk becomes 0, quantity at least 1). */
export function buildJob(job: JobFormState, components: Component[], lineItems: LineItem[]): Job {
  const materials: MaterialLine[] = job.materials.map((r) => ({
    partId: r.partId,
    name: r.name,
    grams: Number(r.grams) || 0,
    pricePerKg: Number(r.pricePerKg) || 0,
  }));
  const baseGrams = materials.reduce((s, m) => s + m.grams, 0);
  const baseCost = materials.reduce((s, m) => s + (m.grams / 1000) * m.pricePerKg, 0);
  return {
    // The legacy single-material fields stay filled (total grams + weighted ₱/kg) for the model's fallback.
    filamentGrams: baseGrams,
    materialPricePerKg: baseGrams > 0 ? (baseCost / baseGrams) * 1000 : 0,
    materials,
    wastePct: Number(job.wastePct) || 0,
    printHours: toDecimalHours(Number(job.printH), Number(job.printM)),
    laborMinutes: Number(job.laborMinutes) || 0,
    quantity: Math.max(1, Math.floor(Number(job.quantity) || 1)),
    quantityMode: job.quantityMode,
    components,
    lineItems,
  };
}

/** At least one filament row with grams, and every row with grams has a price (a free row would silently under-cost the job). */
export function isValidJob(job: Job): boolean {
  const used = (job.materials ?? []).filter((m) => m.grams > 0);
  return used.length > 0 && used.every((m) => m.pricePerKg > 0);
}

/** The estimator's own settings as the plain object a saved estimate stores. */
export const settingsSnapshot = (s: Settings): Record<string, unknown> => ({ ...s, margins: [...s.margins] });

// ── Restoring stored data ────────────────────────────────────────────────────────────────────────────────────────────

const isRec = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const numOr = (v: unknown, d: number): number => (typeof v === "number" && Number.isFinite(v) ? v : d);
const strOr = (v: unknown, d: string): string => (typeof v === "string" ? v : typeof v === "number" ? String(v) : d);
const uuidOrNull = (v: unknown): string | null => (typeof v === "string" && v.length > 0 ? v : null);

/** Settings from stored JSON (localStorage or a saved estimate): unknown or malformed keys fall back to the defaults. */
export function restoreSettings(raw: unknown): Settings {
  const r = isRec(raw) ? raw : {};
  const m = Array.isArray(r.margins) && r.margins.length === 3 ? r.margins : DEFAULT_SETTINGS.margins;
  return {
    electricityRate: numOr(r.electricityRate, DEFAULT_SETTINGS.electricityRate),
    powerWatts: numOr(r.powerWatts, DEFAULT_SETTINGS.powerWatts),
    printerPrice: numOr(r.printerPrice, DEFAULT_SETTINGS.printerPrice),
    printerLifetimeHours: numOr(r.printerLifetimeHours, DEFAULT_SETTINGS.printerLifetimeHours),
    maintenancePerHr: numOr(r.maintenancePerHr, DEFAULT_SETTINGS.maintenancePerHr),
    laborRate: numOr(r.laborRate, DEFAULT_SETTINGS.laborRate),
    failurePct: numOr(r.failurePct, DEFAULT_SETTINGS.failurePct),
    queuePremiumPerHr: numOr(r.queuePremiumPerHr, DEFAULT_SETTINGS.queuePremiumPerHr),
    margins: [numOr(m[0], DEFAULT_SETTINGS.margins[0]), numOr(m[1], DEFAULT_SETTINGS.margins[1]), numOr(m[2], DEFAULT_SETTINGS.margins[2])],
    roundingStep: numOr(r.roundingStep, DEFAULT_SETTINGS.roundingStep),
  };
}

/** Everything the estimator needs to be put back as it was when an estimate was saved. */
export interface RestoredEstimate {
  job: JobFormState;
  settings: Settings;
  components: Component[];
  lineItems: LineItem[];
  margins: [number, number, number];
  selectedTier: number;
}

/** Rebuild the estimator state from a saved snapshot. It is stored JSON, so every field is checked. */
export function restoreEstimate(input: EstimateInput): RestoredEstimate {
  const i: Record<string, unknown> = isRec(input) ? input : {};
  const j = isRec(i.job) ? i.job : {};
  const settings = restoreSettings(i.settings);
  const rows: MaterialRow[] = (Array.isArray(j.materials) ? j.materials : []).filter(isRec).map((m) => ({
    partId: uuidOrNull(m.partId),
    name: strOr(m.name, "Custom") || "Custom",
    grams: strOr(m.grams, ""),
    pricePerKg: strOr(m.pricePerKg, ""),
  }));
  const components: Component[] = (Array.isArray(i.components) ? i.components : []).filter(isRec).map((c) => {
    const unit = strOr(c.unit, "piece");
    return { name: strOr(c.name, ""), unit: isPartUnit(unit) ? unit : "piece", unitPrice: numOr(c.unitPrice, 0), qty: numOr(c.qty, 0), partId: uuidOrNull(c.partId) };
  });
  const lineItems: LineItem[] = (Array.isArray(i.lineItems) ? i.lineItems : []).filter(isRec).map((l) => ({
    label: strOr(l.label, ""),
    amount: numOr(l.amount, 0),
    applyMargin: l.applyMargin === true,
  }));
  const m = Array.isArray(i.margins) && i.margins.length === 3 ? i.margins : settings.margins;
  const tier = numOr(i.selectedTier, 1);
  return {
    job: {
      printH: strOr(j.printH, ""),
      printM: strOr(j.printM, ""),
      materials: rows.length > 0 ? rows : [emptyMaterialRow()],
      wastePct: strOr(j.wastePct, ""),
      laborMinutes: strOr(j.laborMinutes, ""),
      quantity: strOr(j.quantity, "1") || "1",
      quantityMode: j.quantityMode === "batch" ? "batch" : "per-unit",
    },
    settings,
    components,
    lineItems,
    margins: [numOr(m[0], settings.margins[0]), numOr(m[1], settings.margins[1]), numOr(m[2], settings.margins[2])],
    selectedTier: tier === 0 || tier === 1 || tier === 2 ? tier : 1,
  };
}

// ── Save as product ──────────────────────────────────────────────────────────────────────────────────────────────────

/** One bill-of-materials line for the Server Actions (`unitPricePesos` is the cost of ONE unit: a gram for filament). */
export interface ProductComponent {
  partId: string | null;
  qty: number;
  unitPricePesos: number;
}

/**
 * What "Save as product" sends. A product is ONE piece, so in batch mode the cost and the filament are the per-piece share
 * (see COSTING-MODEL section 3a): `unitCost` is already per piece in both modes, and the filament per piece comes from
 * `perPieceMaterialParts` (waste included, divided by the yield in batch mode).
 */
export interface ProductDraft {
  defaultName: string;
  /** Per-piece cost, pesos. */
  unitCost: number;
  /** Per-piece price of the selected tier, pesos (fee-free, rounded once). */
  unitPrice: number;
  tierLabel: string;
  quantity: number;
  batch: boolean;
  /** Filament consumed per piece, waste included. */
  perPieceGrams: number;
  components: ProductComponent[];
  /** Distinct inventory parts in the bill of materials. */
  bomCount: number;
}

export function buildProductDraft(job: Job, settings: Settings, margins: [number, number, number], selectedTier: number, fallbackName = ""): ProductDraft {
  const cost = computeCost(job, settings);
  const batch = (job.quantityMode ?? "per-unit") === "batch";
  const quantity = Math.max(1, job.quantity || 1);
  const tier = selectedTier === 0 || selectedTier === 2 ? selectedTier : 1;
  const filament: ProductComponent[] = perPieceMaterialParts(job).map((m) => ({ partId: m.partId, qty: m.qty, unitPricePesos: m.pricePerKg / 1000 }));
  const attached: ProductComponent[] = (job.components ?? []).map((c) => ({ partId: c.partId ?? null, qty: c.qty, unitPricePesos: c.unitPrice }));
  const components = [...filament, ...attached];
  const first = (job.materials ?? []).find((m) => m.grams > 0)?.name;
  return {
    defaultName: fallbackName || (first ? `${first} print` : ""),
    unitCost: cost.unitCost,
    unitPrice: productUnitPrice(cost.unitCost, margins[tier], settings.roundingStep),
    tierLabel: TIER_LABELS[tier],
    quantity,
    batch,
    perPieceGrams: cost.totalGrams / (batch ? quantity : 1),
    components,
    bomCount: new Set(components.map((c) => c.partId).filter((p): p is string => p != null)).size,
  };
}
