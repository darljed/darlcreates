"use client";

/**
 * The admin agent: a floating chat on every admin page (⌘J / Ctrl+J). It sends the page's address with each message, and the
 * server reads that page's record, so "this product" means the product being looked at. The agent only PROPOSES changes;
 * each shows what would change, and nothing happens until Approve is pressed.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ExternalLink, Loader2, Send, Sparkles, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { agentChatAction, approveProposalAction, pendingProposalsAction, rejectProposalAction } from "@/app/(admin)/admin/agent/actions";

type Prop = { id: string; tool: string; summary: string; before: Record<string, unknown> | null; after: Record<string, unknown>; state: "pending" | "applying" | "applied" | "rejected" | "failed"; error?: string; link?: string };
type Msg = { role: "user" | "assistant"; content: string; proposals?: Prop[]; steps?: string[]; page?: string };

const STORE = "dc:agent:v1";
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** The page in words and a few things worth asking there (the server reads the actual record). */
function pageKind(path: string): { label: string; ideas: string[] } {
  if (new RegExp(`^/admin/products/${UUID}`, "i").test(path)) return { label: "this product", ideas: ["Review this product's listing and suggest fixes", "Rewrite the description to be shorter", "Is the price healthy given its costing?"] };
  if (new RegExp(`^/admin/orders/${UUID}`, "i").test(path)) return { label: "this order", ideas: ["Summarise this order", "What is the margin on this order?"] };
  if (/^\/admin\/products/.test(path)) return { label: "Products", ideas: ["Which products have no costing yet?", "Which drafts are ready to publish?"] };
  if (/^\/admin\/orders/.test(path)) return { label: "Orders", ideas: ["What needs my attention in orders?"] };
  if (/^\/admin\/inventory/.test(path)) return { label: "Inventory", ideas: ["What is low on stock?", "I bought 2 kg of white PLA for ₱1,200"] };
  if (/^\/admin\/sales/.test(path)) return { label: "Off-site sales", ideas: ["How are off-site sales doing this month?", "Log a sale of 3 keychains at ₱120 each"] };
  if (/^\/admin\/?$/.test(path)) return { label: "the dashboard", ideas: ["How is the shop doing this week?", "What should I do first today?"] };
  return { label: "this page", ideas: ["What can you do on this page?"] };
}

function Diff({ p }: { p: Prop }) {
  const keys = Object.keys(p.after);
  const show = (v: unknown) => (v === null || v === undefined ? "none" : typeof v === "string" ? v : JSON.stringify(v));
  return (
    <dl className="space-y-1 text-xs">
      {keys.map((k) => {
        const was = p.before?.[k];
        return (
          <div key={k} className="grid grid-cols-[6rem_1fr] gap-2">
            <dt className="truncate font-medium text-muted-foreground">{k}</dt>
            <dd className="min-w-0 break-words">
              {p.before && <span className="mr-1 text-muted-foreground line-through decoration-red-500/60">{show(was).slice(0, 200)}</span>}
              <span className="font-medium text-foreground">{show(p.after[k]).slice(0, 400)}</span>
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

export function AgentDock() {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, startBusy] = useTransition();
  const [waiting, setWaiting] = useState<Prop[]>([]);
  const end = useRef<HTMLDivElement>(null);
  const loaded = useRef(false);
  const kind = pageKind(pathname);

  // restore the chat for this tab
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sessionStorage only exists in the browser, so it cannot be read while rendering
    try { const raw = sessionStorage.getItem(STORE); if (raw) setMsgs(JSON.parse(raw) as Msg[]); } catch { /* ignore */ }
    loaded.current = true;
  }, []);
  useEffect(() => {
    // never write an empty list: on a fresh page this effect runs before the restored chat is in state
    if (!loaded.current || msgs.length === 0) return;
    try { sessionStorage.setItem(STORE, JSON.stringify(msgs.slice(-40))); } catch { /* ignore */ }
  }, [msgs]);
  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [msgs, busy, open]);

  // ⌘J / Ctrl+J
  useEffect(() => {
    const on = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") { e.preventDefault(); setOpen((o) => !o); } };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, []);

  // proposals still waiting from earlier (a reload or another tab)
  const refreshWaiting = useCallback(async () => {
    const list = await pendingProposalsAction().catch(() => []);
    setWaiting(list.map((p) => ({ ...p, state: "pending" as const })));
  }, []);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- loads from the server when the chat opens
  useEffect(() => { if (open) void refreshWaiting(); }, [open, refreshWaiting]);

  const known = new Set(msgs.flatMap((m) => m.proposals?.map((p) => p.id) ?? []));
  const orphan = waiting.filter((p) => !known.has(p.id));

  const patch = (id: string, change: Partial<Prop>) => {
    setMsgs((all) => all.map((m) => ({ ...m, proposals: m.proposals?.map((p) => (p.id === id ? { ...p, ...change } : p)) })));
    setWaiting((all) => all.map((p) => (p.id === id ? { ...p, ...change } : p)));
  };
  async function decide(p: Prop, approve: boolean) {
    patch(p.id, { state: "applying" });
    if (approve) {
      const r = await approveProposalAction({ id: p.id });
      if (r.ok) { patch(p.id, { state: "applied", link: r.link }); toast.success("Applied"); router.refresh(); }
      else { patch(p.id, { state: "failed", error: r.error }); toast.error(r.error); }
    } else {
      const r = await rejectProposalAction({ id: p.id });
      patch(p.id, r.ok ? { state: "rejected" } : { state: "failed", error: r.error });
    }
  }

  function send(content: string) {
    const t = content.trim();
    if (!t || busy) return;
    const history: Msg[] = [...msgs, { role: "user", content: t }];
    setMsgs(history);
    setText("");
    startBusy(async () => {
      // the model sees the text of earlier turns, plus what became of each proposal
      const turns = history.map((m) => ({ role: m.role, content: (m.content + (m.proposals?.length ? `\n(Earlier proposals from this turn, for reference only: ${m.proposals.map((p) => `${p.summary} is ${p.state}`).join("; ")}.)` : "")).slice(0, 4000) }));
      const r = await agentChatAction({ messages: turns, path: pathname, search: window.location.search });
      if (!r.ok) { setMsgs([...history, { role: "assistant", content: r.error }]); return; }
      setMsgs([...history, { role: "assistant", content: r.reply, page: r.page, steps: r.steps, proposals: r.proposals.map((p) => ({ ...p, state: "pending" as const })) }]);
    });
  }

  const pendingCount = orphan.filter((p) => p.state === "pending").length + msgs.reduce((n, m) => n + (m.proposals?.filter((p) => p.state === "pending").length ?? 0), 0);

  const card = (p: Prop) => (
    <div key={p.id} className="space-y-2 rounded-md border bg-background p-2.5">
      <p className="text-sm font-semibold">{p.summary}</p>
      <Diff p={p} />
      {p.state === "pending" && (
        <div className="flex gap-2">
          <Button size="sm" onClick={() => decide(p, true)}><Check className="mr-1 size-3.5" />Approve</Button>
          <Button size="sm" variant="outline" onClick={() => decide(p, false)}><X className="mr-1 size-3.5" />Reject</Button>
        </div>
      )}
      {p.state === "applying" && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Working…</p>}
      {p.state === "applied" && <p className="flex items-center gap-1 text-xs font-medium text-green-700"><Check className="size-3.5" />Applied{p.link && <Link href={p.link} className="ml-2 inline-flex items-center gap-0.5 underline">Open <ExternalLink className="size-3" /></Link>}</p>}
      {p.state === "rejected" && <p className="text-xs text-muted-foreground">Rejected. Nothing changed.</p>}
      {p.state === "failed" && <p className="text-xs text-destructive">{p.error ?? "Failed."}</p>}
    </div>
  );

  return (
    <>
      {!open && (
        <button type="button" onClick={() => setOpen(true)} aria-label="Ask the agent (Control or Command J)" title="Ask the agent (⌘J)" className="fixed bottom-4 right-4 z-40 flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Sparkles className="size-5" />
          {pendingCount > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-amber-500 text-[11px] font-bold text-white">{pendingCount}</span>}
        </button>
      )}
      {open && (
        <section role="dialog" aria-modal="false" aria-label="Admin agent" className="fixed bottom-4 right-4 z-40 flex h-[min(42rem,calc(100dvh-2rem))] w-[min(26rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-xl border bg-card shadow-2xl">
          <header className="flex items-center justify-between gap-2 border-b px-3 py-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 text-sm font-bold"><Sparkles className="size-4 text-primary" />Agent</h2>
              <p className="truncate text-[11px] text-muted-foreground">Looking at {kind.label}. It proposes; you approve.</p>
            </div>
            <div className="flex items-center gap-1">
              {msgs.length > 0 && <Button size="icon" variant="ghost" className="size-8" aria-label="Clear chat" onClick={() => { setMsgs([]); sessionStorage.removeItem(STORE); }}><Trash2 className="size-4" /></Button>}
              <Button size="icon" variant="ghost" className="size-8" aria-label="Close" onClick={() => setOpen(false)}><X className="size-4" /></Button>
            </div>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto p-3 text-sm" aria-live="polite">
            {orphan.length > 0 && (
              <div className="space-y-2 rounded-md border border-amber-300 bg-amber-50 p-2">
                <p className="text-xs font-semibold text-amber-900">Waiting for your review</p>
                {orphan.map(card)}
              </div>
            )}
            {msgs.length === 0 && (
              <div className="space-y-2">
                <p className="text-muted-foreground">Ask about {kind.label}, or tell me what to change. I read the page you are on.</p>
                <div className="flex flex-wrap gap-1.5">
                  {kind.ideas.map((s) => <button key={s} type="button" onClick={() => send(s)} className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted">{s}</button>)}
                </div>
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={cn("space-y-2", m.role === "user" && "text-right")}>
                <div className={cn("inline-block max-w-[92%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-left", m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>{m.content}</div>
                {m.steps && m.steps.length > 0 && <p className="text-[11px] text-muted-foreground">Looked at: {[...new Set(m.steps)].join(", ").replaceAll("_", " ")}</p>}
                {m.proposals?.map(card)}
              </div>
            ))}
            {busy && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" />Thinking…</p>}
            <div ref={end} />
          </div>

          <form className="flex items-end gap-2 border-t p-2" onSubmit={(e) => { e.preventDefault(); send(text); }}>
            <textarea aria-label="Message the agent" rows={2} value={text} maxLength={2000} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(text); } }} placeholder={`Ask about ${kind.label}…`} className="min-h-10 flex-1 resize-none rounded-md border bg-background px-2 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <Button type="submit" size="icon" disabled={busy || !text.trim()} aria-label="Send"><Send className="size-4" /></Button>
          </form>
        </section>
      )}
    </>
  );
}
