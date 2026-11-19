/**
 * Workshop tables (the internal costing, stock and sales-log side of the shop): parts and their stock ledger, product bills of
 * materials, saved estimates and manual (off-site) sales. Money is integer centavos; quantities are doubles because some parts
 * are measured in g / mL / cm. `stock_movements` is append-only: every change of a part's quantity is a row.
 */
import { doublePrecision, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { products } from "./catalog";

export const parts = pgTable("parts", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  /** e.g. "filament", "switch", "hardware". */
  category: text("category"),
  /** piece | g | mL | cm */
  unit: text("unit").notNull().default("piece"),
  /** Running sum of the part's stock movements. Never set directly. */
  qtyOnHand: doublePrecision("qty_on_hand").notNull().default(0),
  reorderLevel: doublePrecision("reorder_level").notNull().default(0),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** Purchase lots: the cost basis. Weighted-average unit cost = sum(total cost) / sum(qty) over a part's lots. */
export const stockPurchases = pgTable(
  "stock_purchases",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partId: uuid("part_id").notNull().references(() => parts.id, { onDelete: "cascade" }),
    qty: doublePrecision("qty").notNull(),
    totalCostCents: integer("total_cost_cents").notNull(),
    supplier: text("supplier"),
    purchasedAt: timestamp("purchased_at").defaultNow().notNull(),
  },
  (t) => [index("stock_purchases_part_idx").on(t.partId)],
);

/**
 * Append-only stock ledger. `reason`: purchase | purchase-void | adjustment | order | order-restock | sale | sale-restock.
 * `refType` + `refId` point at what caused it (a purchase lot, a manual sale, an online order).
 */
export const stockMovements = pgTable(
  "stock_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    partId: uuid("part_id").notNull().references(() => parts.id, { onDelete: "cascade" }),
    delta: doublePrecision("delta").notNull(),
    reason: text("reason").notNull(),
    refType: text("ref_type"),
    refId: text("ref_id"),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("stock_movements_part_idx").on(t.partId), index("stock_movements_ref_idx").on(t.refType, t.refId)],
);

/** Bill of materials: the parts (and how much of each) one unit of a product consumes. */
export const productParts = pgTable(
  "product_parts",
  {
    productId: uuid("product_id").notNull().references(() => products.id, { onDelete: "cascade" }),
    partId: uuid("part_id").notNull().references(() => parts.id, { onDelete: "cascade" }),
    qty: doublePrecision("qty").notNull(),
  },
  (t) => [primaryKey({ columns: [t.productId, t.partId] })],
);

/**
 * A saved estimator run. `input` is everything needed to reload it (job, settings, components, fees, margins, chosen tier);
 * `tiers` the three prices at save time. Tags are lower-case.
 */
export const estimates = pgTable("estimates", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title"),
  comment: text("comment"),
  input: jsonb("input").notNull(),
  tiers: jsonb("tiers").notNull(),
  totalCostCents: integer("total_cost_cents").notNull(),
  /** The chosen tier's price for the whole quantity. */
  priceCents: integer("price_cents").notNull().default(0),
  quantity: integer("quantity").notNull().default(1),
  tags: text("tags").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** A sale taken outside the website (Messenger, in person…), tracked like a spreadsheet row. One product per row. */
export const manualSales = pgTable(
  "manual_sales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    saleDate: timestamp("sale_date").defaultNow().notNull(),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    /** The product's name when the sale was saved. */
    product: text("product").notNull(),
    quantity: integer("quantity").notNull(),
    pricePerItemCents: integer("price_per_item_cents").notNull(),
    totalCents: integer("total_cents").notNull(),
    /** The product's unit cost when the sale was saved. */
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    /** One-off parts for this sale beyond the product's BOM: [{ partId, qty, unitCostCents }]. */
    extraParts: jsonb("extra_parts").notNull().default([]),
    paymentStatus: text("payment_status").notNull().default("Unpaid"),
    modeOfPayment: text("mode_of_payment"),
    status: text("status").notNull().default("For Processing"),
    deliveryDetails: text("delivery_details"),
    contact: text("contact"),
    details: text("details"),
    /** Set when the sale first used stock (Packaged / Delivered). Guards against deducting twice. */
    deductedAt: timestamp("deducted_at"),
    paidAt: timestamp("paid_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("manual_sales_date_idx").on(t.saleDate)],
);
