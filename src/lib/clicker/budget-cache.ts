/**
 * A small cache of strings that is limited by how much memory it holds, not just by how many entries. The server keeps a
 * picture (a data URL) for each design it has drawn; a count limit alone still lets a few hundred big designs hold a lot of
 * memory. This one drops the oldest entries until the total fits, and refuses to keep one that is huge on its own. Pure.
 */
export class BudgetCache {
  private map = new Map<string, string>();
  private total = 0;
  constructor(private maxChars: number, private maxEntryChars: number) {}
  get(key: string): string | undefined {
    const v = this.map.get(key);
    if (v !== undefined) {
      this.map.delete(key);
      this.map.set(key, v); // most recently used goes to the back
    }
    return v;
  }
  /** Keep `value` under `key`. Returns false (and keeps nothing) if it is too big to be worth keeping. */
  set(key: string, value: string): boolean {
    // too big on its own, or bigger than the whole budget: keep nothing (the budget is never exceeded, even by one entry)
    if (value.length > this.maxEntryChars || value.length > this.maxChars) return false;
    const old = this.map.get(key);
    if (old !== undefined) this.total -= old.length;
    this.map.delete(key);
    this.map.set(key, value);
    this.total += value.length;
    while (this.total > this.maxChars && this.map.size > 1) {
      const [oldestKey, oldest] = this.map.entries().next().value as [string, string];
      this.map.delete(oldestKey);
      this.total -= oldest.length;
    }
    return true;
  }
  get chars() {
    return this.total;
  }
  get size() {
    return this.map.size;
  }
}
