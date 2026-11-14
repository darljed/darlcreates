/**
 * Catalog tables: products, photos, options and option values, plus reviews and review photos.
 */
import {
  pgTable,
  text,
  integer,
  boolean,
  timestamp,
  jsonb,
  pgEnum,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./auth";

export const productStatus = pgEnum("product_status", [
  "draft",
  "published",
  "archived",
]);

/** Customization option kinds. Phase 1 supports all four as predefined options. */
export const optionType = pgEnum("option_type", [
  "color",
  "text",
  "size",
  "image",
]);

/**
 * A ready-to-print product. `basePriceCents` is integer centavos (PHP).
 * `stlKey` is the S3 key of the print-ready mesh shown in the 3D viewer.
 */
export const products = pgTable("products", {
  id: uuid("id").defaultRandom().primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  category: text("category").notNull().default("general"),
  basePriceCents: integer("base_price_cents").notNull().default(0),
  status: productStatus("status").notNull().default("draft"),
  stlKey: text("stl_key"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const productPhotos = pgTable("product_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  s3Key: text("s3_key").notNull(),
  alt: text("alt").notNull().default(""),
  sort: integer("sort").notNull().default(0),
});

/**
 * A single customization axis for a product (e.g. "Color", "Your name").
 * `constraints` holds type-specific rules:
 *   text:  { maxLen, pattern?, fonts? }
 *   image: { formats, maxBytes, minW?, minH? }
 *   color/size: {} (enumerated via productOptionValues)
 */
export const productOptions = pgTable("product_options", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  type: optionType("type").notNull(),
  label: text("label").notNull(),
  required: boolean("required").notNull().default(false),
  priceDeltaCents: integer("price_delta_cents").notNull().default(0),
  constraints: jsonb("constraints").notNull().default({}),
  sort: integer("sort").notNull().default(0),
});

/** Enumerated value for color/size options. `value` = hex (color) or code (size). */
export const productOptionValues = pgTable("product_option_values", {
  id: uuid("id").defaultRandom().primaryKey(),
  optionId: uuid("option_id")
    .notNull()
    .references(() => productOptions.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  value: text("value").notNull(),
  priceDeltaCents: integer("price_delta_cents").notNull().default(0),
  stlKey: text("stl_key"),
  sort: integer("sort").notNull().default(0),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  productId: uuid("product_id")
    .notNull()
    .references(() => products.id, { onDelete: "cascade" }),
  orderId: uuid("order_id"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  rating: integer("rating").notNull(),
  body: text("body").notNull().default(""),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const reviewPhotos = pgTable("review_photos", {
  id: uuid("id").defaultRandom().primaryKey(),
  reviewId: uuid("review_id")
    .notNull()
    .references(() => reviews.id, { onDelete: "cascade" }),
  s3Key: text("s3_key").notNull(),
  sort: integer("sort").notNull().default(0),
});
