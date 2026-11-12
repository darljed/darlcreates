/**
 * How to open the Postgres connection for the URL we were given. Pure, so a script can check it.
 *
 * Two places run this app. On a laptop or a server it uses the direct connection (up to 10 connections kept open). On
 * Vercel (serverless) every function instance opens its own connection, so it must go through the PgBouncer pooler
 * (`…:6432`, transaction mode): one connection per instance, a short idle timeout, and NO prepared statements (a
 * transaction pooler may hand the next statement to another server connection, which would not know the prepared name).
 */
export type PgOptions = { max: number; prepare: boolean; idle_timeout?: number };

/** True when the URL points at the PgBouncer pooler (port 6432, or `pgbouncer=true`). */
export function isPooledUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.port === "6432" || u.searchParams.get("pgbouncer") === "true";
  } catch {
    return false; // not a URL we can read: treat as a direct connection
  }
}

export function postgresOptions(url: string, env: { VERCEL?: string }): PgOptions {
  const pooled = isPooledUrl(url);
  const serverless = Boolean(env.VERCEL);
  return {
    max: serverless ? 1 : 10,
    prepare: !pooled,
    ...(serverless ? { idle_timeout: 20 } : {}),
  };
}
