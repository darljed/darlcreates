import {
  pgTable,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";
import { products } from "./catalog";

export const orderStatus = pgEnum("order_status", [
  "awaiting_payment",
  "paid",
  "in_production",
  "ready_to_ship",
  "shipped",
  "delivered",
  "cancelled",
  "refunded",
]);

export const paymentStatus = pgEnum("payment_status", [
  "pending",
  "verified",
  "rejected",
]);

export const addresses = pgTable("addresses", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull().default("Home"),
  recipient: text("recipient").notNull(),
  phone: text("phone").notNull(),
  line1: text("line1").notNull(),
  line2: text("line2").notNull().default(""),
  barangay: text("barangay").notNull().default(""),
  city: text("city").notNull(),
  province: text("province").notNull(),
  postalCode: text("postal_code").notNull().default(""),
  isDefault: integer("is_default").notNull().default(0),
});

export const carts = pgTable("carts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

/** `config` is an immutable snapshot of the chosen customization options. */
export const cartItems = pgTable("cart_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  cartId: uuid("cart_id")
    .notNull()
    .references(() => carts.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  qty: integer("qty").notNull().default(1),
  config: jsonb("config").notNull().default({}),
  imageKey: text("image_key"),
  unitPriceCents: integer("unit_price_cents").notNull(),
});

/**
 * An order. Financial fields are integer centavos. `shipAddress` and item
 * snapshots are immutable so later catalog/address edits never mutate history.
 * BIR-ready but feature-off: `orNumber` + `vatCents` present, unused for now.
 */
export const orders = pgTable("orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderNo: text("order_no").notNull().unique(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "restrict" }),
  status: orderStatus("status").notNull().default("awaiting_payment"),
  subtotalCents: integer("subtotal_cents").notNull(),
  shippingCents: integer("shipping_cents").notNull().default(0),
  totalCents: integer("total_cents").notNull(),
  shipAddress: jsonb("ship_address").notNull(),
  orNumber: text("or_number"),
  vatCents: integer("vat_cents").notNull().default(0),
  placedAt: timestamp("placed_at").defaultNow().notNull(),
});

export const orderItems = pgTable("order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "restrict" }),
  nameSnapshot: text("name_snapshot").notNull(),
  qty: integer("qty").notNull(),
  config: jsonb("config").notNull().default({}),
  imageKey: text("image_key"),
  unitPriceCents: integer("unit_price_cents").notNull(),
  stlKeySnapshot: text("stl_key_snapshot"),
});

/**
 * Append-only payment ledger. A re-submission inserts a NEW row; rows are never
 * destructively updated except to record the verify/reject decision + actor.
 */
export const payments = pgTable("payments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  method: text("method").notNull().default("gcash"),
  gcashReference: text("gcash_reference").notNull(),
  amountCents: integer("amount_cents").notNull(),
  proofKey: text("proof_key"),
  status: paymentStatus("status").notNull().default("pending"),
  submittedAt: timestamp("submitted_at").defaultNow().notNull(),
  verifiedBy: text("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  rejectReason: text("reject_reason"),
});

export const shipments = pgTable("shipments", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  carrier: text("carrier").notNull().default(""),
  trackingNo: text("tracking_no").notNull().default(""),
  status: text("status").notNull().default(""),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

/** Append-only audit trail of order status transitions. */
export const orderStatusHistory = pgTable("order_status_history", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  fromStatus: orderStatus("from_status"),
  toStatus: orderStatus("to_status").notNull(),
  note: text("note").notNull().default(""),
  actorId: text("actor_id").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
