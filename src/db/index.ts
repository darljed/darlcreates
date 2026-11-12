/**
 * Drizzle client, reused across dev reloads. Throws if DATABASE_URL is missing. Pool size and prepared statements follow
 * the URL and the host (see options.ts): direct on a server, through the PgBouncer pooler on Vercel.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";
import { postgresOptions } from "./options";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set");
}

// Reuse the client across HMR reloads in dev to avoid exhausting connections.
const globalForDb = globalThis as unknown as {
  __dcPg?: ReturnType<typeof postgres>;
};

const client =
  globalForDb.__dcPg ?? postgres(connectionString, postgresOptions(connectionString, { VERCEL: process.env.VERCEL }));
if (process.env.NODE_ENV !== "production") globalForDb.__dcPg = client;

export const db = drizzle(client, { schema });
export { schema };
