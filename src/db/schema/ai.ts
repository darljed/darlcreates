/**
 * AI tables. `ai_settings` holds the provider keys (encrypted with AES-256-GCM, see lib/ai/crypto.ts) and the owner's
 * model choices. `ai_drafts` holds work the AI prepared that a person has not approved yet (a product draft with its
 * copy and images; later, an agent's proposed changes). Nothing in a draft touches the shop until it is applied.
 */
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

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
