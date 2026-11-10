import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { eq } from "drizzle-orm";

/**
 * BetterAuth server instance. Google OAuth only (per project decision).
 * The app-level `role` column (customer|admin) is added as an extra user field
 * so sessions carry it; it defaults to "customer" and is never client-settable.
 */
export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  // BetterAuth rejects POSTs (sign-out) from any origin other than baseURL. In development we also
  // browse via localhost, so allow those origins there only; production trusts baseURL alone.
  trustedOrigins:
    process.env.NODE_ENV === "production"
      ? []
      : ["http://localhost:3000", "http://localhost:3001", "http://127.0.0.1:3000", "http://127.0.0.1:3001"],
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.users,
      session: schema.sessions,
      account: schema.accounts,
      verification: schema.verifications,
    },
  }),
  socialProviders: {
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID as string,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
    },
  },
  user: {
    additionalFields: {
      role: {
        type: "string",
        required: false,
        defaultValue: "customer",
        input: false, // never accept role from the client
      },
    },
  },
  // A blocked account can never get a new session, however it signs in. (Blocking also deletes existing sessions.)
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const [u] = await db.select({ blockedAt: schema.users.blockedAt }).from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
          if (u?.blockedAt) return false;
        },
      },
    },
  },
  // A failed Google sign-in comes back to our own page (with ?error=…) instead of BetterAuth's bare error page.
  onAPIError: { errorURL: "/sign-in" },
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
