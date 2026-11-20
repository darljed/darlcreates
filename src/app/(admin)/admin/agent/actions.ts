"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/session";
import { applyProposal, pendingProposals, rejectProposal, type PendingProposal } from "@/lib/ai/agent/apply";
import { runAgent, turnSchema, type AgentReply } from "@/lib/ai/agent/run";

/** ponytail: counted in memory per server instance (resets on restart, multiplies with instances). Upgrade: a counter table. */
const sent = new Map<string, number[]>();
const PER_HOUR = 40;
function takeSlot(userId: string, now = Date.now()): boolean {
  const recent = (sent.get(userId) ?? []).filter((t) => now - t < 3_600_000);
  if (recent.length >= PER_HOUR) { sent.set(userId, recent); return false; }
  recent.push(now);
  sent.set(userId, recent);
  return true;
}

const chatSchema = z.object({ messages: z.array(turnSchema).min(1).max(30), path: z.string().max(300), search: z.string().max(400).default("") });

/** One owner message (with the chat so far). The page the owner is on comes from the browser's address; its data is read here. */
export async function agentChatAction(input: unknown): Promise<AgentReply> {
  const admin = await requireAdmin();
  const p = chatSchema.safeParse(input);
  if (!p.success || p.data.messages[p.data.messages.length - 1].role !== "user" || !p.data.path.startsWith("/admin")) return { ok: false, error: "Invalid message." };
  if (!takeSlot(admin.id)) return { ok: false, error: `That is ${PER_HOUR} messages in the last hour, which is the limit. Try again later.` };
  return runAgent({ messages: p.data.messages, path: p.data.path, search: p.data.search, actorId: admin.id });
}

const idSchema = z.object({ id: z.string().uuid() });

export async function approveProposalAction(input: unknown): Promise<{ ok: true; link?: string } | { ok: false; error: string }> {
  const admin = await requireAdmin();
  const p = idSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  const r = await applyProposal(p.data.id, admin.id);
  if (r.ok) revalidatePath("/admin", "layout");
  return r;
}

export async function rejectProposalAction(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin();
  const p = idSchema.safeParse(input);
  if (!p.success) return { ok: false, error: "Invalid request." };
  return rejectProposal(p.data.id);
}

export async function pendingProposalsAction(): Promise<PendingProposal[]> {
  await requireAdmin();
  return pendingProposals();
}
