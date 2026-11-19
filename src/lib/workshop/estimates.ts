/**
 * Saved estimates: a snapshot of an estimator run (so it can be reloaded and edited), with a comment and tags.
 * Tags are stored lower-case; filtering by several tags keeps the estimates that have ALL of them. Server only.
 */
import { desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { estimates } from "@/db/schema";
import type { EstimateInput, SavedEstimate, SavedTier } from "./types";

export interface EstimateData {
  title?: string;
  comment?: string;
  input: EstimateInput;
  tiers: SavedTier[];
  totalCostCents: number;
  priceCents: number;
  quantity: number;
  tags: string[];
}

/** Lower-case, trimmed, no blanks, no repeats, at most 12 tags of 30 characters. */
export function normalizeTags(raw: string[]): string[] {
  const seen = new Set<string>();
  for (const t of raw) {
    const k = t.trim().toLowerCase().slice(0, 30);
    if (k) seen.add(k);
    if (seen.size >= 12) break;
  }
  return [...seen];
}

const values = (d: EstimateData) => ({
  title: d.title?.trim().slice(0, 120) || null,
  comment: d.comment?.trim().slice(0, 2000) || null,
  input: d.input,
  tiers: d.tiers,
  totalCostCents: d.totalCostCents,
  priceCents: d.priceCents,
  quantity: d.quantity,
  tags: normalizeTags(d.tags),
});

const toRow = (r: typeof estimates.$inferSelect): SavedEstimate => ({
  id: r.id,
  createdAt: r.createdAt.toISOString(),
  title: r.title,
  comment: r.comment,
  input: r.input as EstimateInput,
  tiers: r.tiers as SavedTier[],
  totalCostCents: r.totalCostCents,
  priceCents: r.priceCents,
  quantity: r.quantity,
  tags: r.tags,
});

export async function saveEstimate(d: EstimateData): Promise<string> {
  const [row] = await db.insert(estimates).values(values(d)).returning({ id: estimates.id });
  return row.id;
}

export async function updateEstimate(id: string, d: EstimateData): Promise<boolean> {
  const rows = await db.update(estimates).set(values(d)).where(eq(estimates.id, id)).returning({ id: estimates.id });
  return rows.length > 0;
}

export async function deleteEstimate(id: string): Promise<void> {
  await db.delete(estimates).where(eq(estimates.id, id));
}

export async function getEstimate(id: string): Promise<SavedEstimate | null> {
  const [r] = await db.select().from(estimates).where(eq(estimates.id, id)).limit(1);
  return r ? toRow(r) : null;
}

/** Newest first. With tags, only estimates that carry every one of them. */
export async function listEstimates(filterTags: string[] = []): Promise<SavedEstimate[]> {
  const wanted = normalizeTags(filterTags);
  const rows = await db
    .select()
    .from(estimates)
    .where(wanted.length ? sql`${estimates.tags} @> ${sql.raw(`ARRAY[${wanted.map((t) => `'${t.replace(/'/g, "''")}'`).join(",")}]::text[]`)}` : undefined)
    .orderBy(desc(estimates.createdAt));
  return rows.map(toRow);
}

/** Every tag in use, for the filter chips and the save dialog's suggestions. */
export async function listEstimateTags(): Promise<string[]> {
  const rows = await db.execute<{ tag: string }>(sql`select distinct unnest(${estimates.tags}) as tag from ${estimates} order by 1`);
  return rows.map((r) => r.tag);
}
