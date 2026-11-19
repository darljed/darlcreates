/**
 * Client-safe types and constants for the workshop (no database imports, so client components can use them).
 */
export const PAYMENT_STATUSES = ["Paid", "Unpaid", "Free"] as const;
/** The manual sales' stages. Packaged and Delivered mean the stock has been used. */
export const SALE_STATUSES = ["For Processing", "Packaged", "Delivered", "Cancelled"] as const;
export const PAYMENT_MODES = ["Gcash", "Cash", "Maya", "Bank", "Other"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];
export type SaleStatus = (typeof SALE_STATUSES)[number];

/** A one-off part added to a single sale beyond the product's BOM (the cost is saved with it). */
export interface SaleExtraPart {
  partId: string;
  qty: number;
  unitCostCents: number;
}

export interface SaleRow {
  id: string;
  saleDate: string;
  productId: string | null;
  product: string;
  quantity: number;
  pricePerItemCents: number;
  totalCents: number;
  unitCostCents: number;
  extraParts: SaleExtraPart[];
  paymentStatus: PaymentStatus;
  modeOfPayment?: string;
  status: SaleStatus;
  deliveryDetails?: string;
  contact?: string;
  details?: string;
  deductedAt: string | null;
  paidAt: string | null;
  createdAt: string;
}

export interface PartWithCost {
  id: string;
  name: string;
  category: string | null;
  unit: string;
  qtyOnHand: number;
  reorderLevel: number;
  notes: string | null;
  /** Weighted-average cost of one unit. */
  unitCostCents: number;
  stockValueCents: number;
  lowStock: boolean;
}

export interface PurchaseRow {
  id: string;
  partId: string;
  qty: number;
  totalCostCents: number;
  supplier: string | null;
  purchasedAt: string;
}

export interface BomLineCosted {
  partId: string;
  partName: string;
  qty: number;
  unit: string;
  unitCostCents: number;
  qtyOnHand: number;
}

export interface ProductCosting {
  id: string;
  name: string;
  status: string;
  basePriceCents: number;
  printCostCents: number;
  bom: BomLineCosted[];
  partsCostCents: number;
  /** Parts + print cost: what one unit costs to make. */
  unitCostCents: number;
  /** Price minus cost, as a share of the price (0 when the price is 0). */
  marginPct: number;
  /** How many could be built from the stock on hand (null when there is no BOM). */
  buildableQty: number | null;
}

/** The three prices the estimator shows, as saved. */
export interface SavedTier {
  marginPct: number;
  price: number;
  rounded: number;
  profit: number;
  pricePerUnit: number;
  profitPerUnit: number;
}

export interface SavedEstimate {
  id: string;
  createdAt: string;
  title: string | null;
  comment: string | null;
  /** Everything needed to reload it into the estimator (see `EstimateInput`). */
  input: EstimateInput;
  tiers: SavedTier[];
  totalCostCents: number;
  priceCents: number;
  quantity: number;
  tags: string[];
}

/** The job as typed in the form (strings, so empty fields stay empty). */
export interface JobFormState {
  printH: string;
  printM: string;
  materials: { partId: string | null; name: string; grams: string; pricePerKg: string }[];
  wastePct: string;
  laborMinutes: string;
  quantity: string;
  quantityMode: "per-unit" | "batch";
}

/** What a saved estimate stores: enough to reload and edit it later. `settings` is the estimator's `Settings`. */
export interface EstimateInput {
  job: JobFormState;
  settings: Record<string, unknown>;
  components: { name: string; unit: string; unitPrice: number; qty: number; partId?: string | null }[];
  lineItems: { label: string; amount: number; applyMargin: boolean }[];
  /** The tier margins in force when it was saved (with any slider overrides). */
  margins: [number, number, number];
  selectedTier: number;
}
