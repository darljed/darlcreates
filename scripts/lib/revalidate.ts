/**
 * After a script changes products/content straight in the database, tell the running app to drop its
 * cached copies (otherwise the storefront can keep listing a deleted product for up to an hour).
 * Best effort: prints a warning instead of failing. Needs REVALIDATE_SECRET in .env.local and a running app.
 * Only talks to REVALIDATE_URL (default http://localhost:3001) and BETTER_AUTH_URL, never to other local ports.
 */
export async function refreshStorefrontCache(productSlugs: string[] = []): Promise<void> {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    console.warn("note: REVALIDATE_SECRET is not set, so the running site may show stale products for up to an hour.");
    return;
  }
  const tags = ["products", "site:home", "site:info", ...productSlugs.map((s) => `product:${s}`)];
  const bases = [process.env.REVALIDATE_URL ?? "http://localhost:3001", process.env.BETTER_AUTH_URL].filter((b): b is string => Boolean(b));
  for (const base of bases) {
    try {
      const res = await fetch(`${base.replace(/\/$/, "")}/api/revalidate`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-revalidate-secret": secret },
        body: JSON.stringify({ tags }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        console.log(`storefront cache refreshed via ${base}`);
        return;
      }
    } catch {
      /* try the next address */
    }
  }
  console.warn("note: could not reach the running app to refresh its cache; restart it or wait up to an hour.");
}
