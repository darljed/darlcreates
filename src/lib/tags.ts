/**
 * Product tags: short lower-case labels ("gift", "desk", "name keychain") that customers can filter and search by.
 * PURE, so the admin form, the server action, the Product studio and the shop filter all clean tags the same way.
 */
export const MAX_TAGS = 8;
export const MAX_TAG_LENGTH = 30;

/** One tag as stored: lower-case, no leading #, single spaces, letters/digits/space/hyphen only, at most 30 characters. Empty = drop. */
export function cleanTag(raw: string): string {
  return raw
    .normalize("NFKC")
    .toLowerCase()
    .replace(/^#+/, "")
    .replace(/[^\p{L}\p{N} -]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

/** A list (or a comma-separated string) cleaned: no empties, no repeats, first 8 kept in the order given. */
export function normalizeTags(input: string | readonly string[] | null | undefined): string[] {
  const list = typeof input === "string" ? input.split(/[,\n]/) : [...(input ?? [])];
  const out: string[] = [];
  for (const t of list) {
    const c = cleanTag(t);
    if (c && !out.includes(c)) out.push(c);
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
