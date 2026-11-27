/**
 * AI tables. `ai_settings` holds the provider keys (encrypted with AES-256-GCM, see lib/ai/crypto.ts) and the owner's
 * model choices. `ai_drafts` holds work the AI prepared that a person has not approved yet (a product draft with its
 * copy and images; later, an agent's proposed changes). Nothing in a draft touches the shop until it is applied.
 */
import { jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { products } from "./catalog";

export const aiSettings = pgTable("ai_settings", {
  /** "key:openrouter" | "key:ollama" ({ enc }), "prefs" (model choices). */
  key: text("key").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
});

export const aiDrafts = pgTable("ai_drafts", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** "product" (marketing generator) | "agent" (proposed changes). */
  kind: text("kind").notNull(),
  /** draft -> applied | discarded */
  status: text("status").notNull().default("draft"),
  title: text("title").notNull().default(""),
  payload: jsonb("payload").notNull(),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  appliedAt: timestamp("applied_at"),
});

/**
 * One AI-generated picture (an image-studio preset shot or a chat mockup). A generated image that was placed on the
 * product also has a `product_photos` row (the shop's source of truth); hiding it there leaves this history intact.
 */
export const aiImages = pgTable("ai_images", {
  id: uuid("id").defaultRandom().primaryKey(),
  /** The product this picture belongs to. Draft-only pictures (no product yet) are added here when "Create product" runs. */
  productId: uuid("product_id").references(() => products.id, { onDelete: "cascade" }),
  s3Key: text("s3_key").notNull(),
  /** "cover" | "studio" | "lifestyle" | "detail" | "custom" (IMAGE_PRESETS in lib/ai/image-studio.ts); chat mockups use the scene they were made with. */
  scene: text("scene").notNull(),
  /** The owner's extra direction the prompt was built from. */
  direction: text("direction").notNull().default(""),
  model: text("model").notNull(),
  alt: text("alt").notNull().default(""),
  /** What the generation cost in USD (OpenRouter's usage cost). */
  costUsd: real("cost_usd").notNull().default(0),
  createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
