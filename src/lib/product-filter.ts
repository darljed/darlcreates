/**
 * Shop search + category filter. Pure so it is testable and can run in the browser: the catalog
 * is small and cached, so we filter client-side (instant results, and the listing page stays
 * static instead of reading searchParams). ponytail: substring/token match, no ranking; if the
 * catalog grows past a few hundred items, move to server-side search.
 */
export type Filterable = { name: string; description: string; category: string };

/** Lower-case, strip accents, collapse whitespace. */
export function normalize(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Every whitespace-separated word of the query must appear in name, description or category. */
export function matchesQuery(p: Filterable, query: string): boolean {
  const q = normalize(query);
  if (!q) return true;
  const hay = normalize(`${p.name} ${p.category} ${p.description}`);
  return q.split(" ").every((word) => hay.includes(word));
}

/** "Keychains " and "keychains" are the same category. */
export const categoryKey = (c: string) => c.trim().toLowerCase();

export function filterProducts<T extends Filterable>(items: T[], query: string, category: string | null): T[] {
  const want = category ? categoryKey(category) : null;
  return items.filter((p) => (!want || categoryKey(p.category) === want) && matchesQuery(p, query));
}

/** Categories with counts, most common first then alphabetical. */
export function categoryCounts(items: Filterable[]): { category: string; count: number }[] {
  const m = new Map<string, number>();
  for (const p of items) m.set(categoryKey(p.category), (m.get(categoryKey(p.category)) ?? 0) + 1);
  return [...m.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}
