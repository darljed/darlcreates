/**
 * Applying or rejecting a proposal. SERVER ONLY. Only a person reaches this (through a Server Action that checks the admin).
 * Before anything is written the proposal is re-checked: the arguments are parsed again, and the "before" picture is
 * compared with the data as it is now, so a change made in between (by the owner, a customer's order, another tab)
 * is never silently overwritten.
 */
import { randomUUID } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { adminAudit, aiDrafts } from "@/db/schema";
import { toolByName, type Preview } from "./tools";

export const PROPOSAL_TTL_MS = 24 * 60 * 60 * 1000;
type Payload = { tool: string; args: Record<string, unknown>; preview: Preview; page?: string; error?: string };

/** JSON with sorted keys. The database stores jsonb, which reorders keys, so two equal pictures must be compared like this. */
export function canon(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (v && typeof v === "object") return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v) ?? "null";
}

async function load(id: string) {
  const [row] = await db.select().from(aiDrafts).where(and(eq(aiDrafts.id, id), eq(aiDrafts.kind, "agent"))).limit(1);
  return row ?? null;
}
const setStatus = (id: string, status: string, payload?: Payload) =>
  db.update(aiDrafts).set({ status, updatedAt: new Date(), ...(status === "applied" ? { appliedAt: new Date() } : {}), ...(payload ? { payload } : {}) }).where(eq(aiDrafts.id, id));

export async function applyProposal(id: string, actorId: string): Promise<{ ok: true; link?: string } | { ok: false; error: string }> {
  const row = await load(id);
  if (!row) return { ok: false, error: "Proposal not found." };
  if (row.status !== "draft") return { ok: false, error: row.status === "applied" ? "This was already applied." : "This proposal can no longer be applied." };
  if (Date.now() - row.createdAt.getTime() > PROPOSAL_TTL_MS) { await setStatus(id, "expired"); return { ok: false, error: "This proposal is more than a day old. Ask the agent again." }; }
  const payload = row.payload as Payload;
  const tool = toolByName(payload.tool);
  if (!tool || tool.kind !== "write" || !tool.apply || !tool.preview) return { ok: false, error: "Unknown proposal." };
  const args = tool.params.safeParse(payload.args);
  if (!args.success) return { ok: false, error: "The saved request is not valid any more." };

  // claim it, so two clicks cannot apply it twice
  const claimed = await db.update(aiDrafts).set({ status: "applying", updatedAt: new Date() }).where(and(eq(aiDrafts.id, id), eq(aiDrafts.status, "draft"), gt(aiDrafts.createdAt, new Date(Date.now() - PROPOSAL_TTL_MS)))).returning({ id: aiDrafts.id });
  if (!claimed.length) return { ok: false, error: "This proposal is already being applied." };
  const fail = async (error: string) => { await setStatus(id, "failed", { ...payload, error }); return { ok: false as const, error }; };

  try {
    const now = (await tool.preview(args.data as never)) as Preview | { error: string };
    if ("error" in now) return await fail(now.error);
    if (canon(now.before) !== canon(payload.preview.before)) return await fail("This changed since the agent proposed it. Ask the agent again so it works from the current data.");
    const r = await tool.apply(args.data as never);
    if (!r.ok) return await fail(r.error);
    await db.insert(adminAudit).values({ id: randomUUID(), actorId, targetUserId: actorId, action: `agent.apply:${payload.tool}`, detail: { proposalId: id, summary: payload.preview.summary, args: payload.args } });
    await setStatus(id, "applied");
    return { ok: true, link: r.link };
  } catch (e) {
    console.error("agent apply failed:", payload.tool, e);
    return await fail("Something went wrong while applying it. Check the page and try again.");
  }
}

export async function rejectProposal(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const done = await db.update(aiDrafts).set({ status: "rejected", updatedAt: new Date() }).where(and(eq(aiDrafts.id, id), eq(aiDrafts.kind, "agent"), eq(aiDrafts.status, "draft"))).returning({ id: aiDrafts.id });
  return done.length ? { ok: true } : { ok: false, error: "Proposal not found or already decided." };
}

export type PendingProposal = { id: string; tool: string; summary: string; before: Record<string, unknown> | null; after: Record<string, unknown>; createdAt: string };
/** Proposals still waiting for a decision (so a page reload does not lose them). */
export async function pendingProposals(): Promise<PendingProposal[]> {
  const rows = await db.select().from(aiDrafts).where(and(eq(aiDrafts.kind, "agent"), eq(aiDrafts.status, "draft"), gt(aiDrafts.createdAt, new Date(Date.now() - PROPOSAL_TTL_MS)))).orderBy(aiDrafts.createdAt).limit(30);
  return rows.map((r) => { const p = r.payload as Payload; return { id: r.id, tool: p.tool, summary: p.preview.summary, before: p.preview.before, after: p.preview.after, createdAt: r.createdAt.toISOString() }; });
}
