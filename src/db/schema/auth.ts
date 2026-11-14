/**
 * Auth and account tables: users (role, consent, block fields), sessions, accounts, verifications and the
 * admin_audit log.
 */
import {
  pgTable,
  text,
  timestamp,
  boolean,
  pgEnum,
  jsonb,
} from "drizzle-orm/pg-core";

export const userRole = pgEnum("user_role", ["customer", "admin"]);

/**
 * BetterAuth core tables. Column names/shapes follow BetterAuth's Drizzle
 * adapter expectations (camelCase fields mapped to snake_case columns).
 * `role` is our app-level addition (default customer).
 */
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified")
    .$defaultFn(() => false)
    .notNull(),
  image: text("image"),
  role: userRole("role").default("customer").notNull(),
  // RA 10173: when the user accepted the privacy policy, and which version.
  consentAt: timestamp("consent_at"),
  consentVersion: text("consent_version"),
  // Set when the user deletes their account (PII is anonymized; order records are kept).
  deletedAt: timestamp("deleted_at"),
  // Set by an admin: the user cannot sign in and their sessions are ended. Reason is internal, never shown to them.
  blockedAt: timestamp("blocked_at"),
  blockedReason: text("blocked_reason"),
  // Private notes for admins about this customer (never shown to the customer).
  adminNote: text("admin_note").notNull().default(""),
  createdAt: timestamp("created_at")
    .$defaultFn(() => new Date())
    .notNull(),
  updatedAt: timestamp("updated_at")
    .$defaultFn(() => new Date())
    .notNull(),
});

export const sessions = pgTable("sessions", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
});

export const verifications = pgTable("verifications", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").$defaultFn(() => new Date()),
  updatedAt: timestamp("updated_at").$defaultFn(() => new Date()),
});

/**
 * Append-only record of what an admin did to a user account (block, edit, sign out, delete…).
 * Deliberately no foreign keys: the trail must survive even if a user row is ever removed.
 */
export const adminAudit = pgTable("admin_audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  targetUserId: text("target_user_id").notNull(),
  action: text("action").notNull(),
  detail: jsonb("detail").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
