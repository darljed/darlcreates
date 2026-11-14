import { pgTable, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * Owner-editable site content, one row per document (key "home" = landing page).
 * `data` is validated by `homeContentSchema` on every read and write, so the JSON shape lives
 * in code, not in the DB. Content is public marketing copy, not financial or audit data.
 */
export const siteContent = pgTable("site_content", {
  key: text("key").primaryKey(),
  data: jsonb("data").notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  updatedBy: text("updated_by").references(() => users.id, { onDelete: "set null" }),
});
