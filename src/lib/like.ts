/** Escape LIKE wildcards so a search for "50%" or "a_b" matches literally. */
export const likeTerm = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
