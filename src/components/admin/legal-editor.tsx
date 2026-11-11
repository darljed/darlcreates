"use client";

/**
 * One legal document's editor: formatting toolbar, link dialog, word count and section outline.
 */

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Heading2, Link2, List, Loader2, Monitor, RotateCcw, Smartphone, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check, Field } from "@/components/admin/editor-bits";
import { LegalBody } from "@/components/legal-body";
import { insertLink, outline, toggleBullets, toggleHeading, wordCount, type Edit } from "@/lib/legal-format";
import type { LegalDoc, LegalSlug } from "@/lib/site-content-schema";
import { resetLegalAction, saveLegalAction } from "@/app/(admin)/admin/content/actions";

export type LegalMeta = { updatedAt: string; updatedByName: string | null } | null;

const LABEL: Record<LegalSlug, string> = { privacy: "Privacy Policy", terms: "Terms and Conditions" };

function when(iso: string) {
  return new Date(iso).toLocaleString("en-PH", { dateStyle: "medium", timeStyle: "short" });
}

/**
 * One legal page. Write and Preview are tabs (the preview is exactly what customers see, at desktop or
 * phone width). The browser keeps unsaved text; leaving the page with unsaved changes asks first.
 */
export function LegalEditor({
  slug,
  initial,
  meta,
  acceptance,
  onDirtyChange,
}: {
  slug: LegalSlug;
  initial: LegalDoc;
  meta: LegalMeta;
  /** Privacy only: how many customers accepted the current version. */
  acceptance?: { accepted: number; total: number };
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const router = useRouter();
  const label = LABEL[slug];
  const [saved, setSaved] = useState({ title: initial.title, effective: initial.effective, body: initial.body });
  const [d, setD] = useState(saved);
  const [askAgain, setAskAgain] = useState(false);
  const [tab, setTab] = useState("write");
  const [device, setDevice] = useState<"desktop" | "phone">("desktop");
  const [pending, start] = useTransition();
  const [confirm, setConfirm] = useState<null | "ask" | "reset">(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [link, setLink] = useState({ label: "", url: "https://" });
  const [linkError, setLinkError] = useState("");
  const area = useRef<HTMLTextAreaElement>(null);
  const selection = useRef({ start: 0, end: 0 });

  const dirty = d.title !== saved.title || d.effective !== saved.effective || d.body !== saved.body || askAgain;
  const sections = useMemo(() => outline(d.body), [d.body]);
  const words = useMemo(() => wordCount(d.body), [d.body]);
  const tooLong = d.body.length > 20000;

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // Warn before closing the tab / navigating away with unsaved text.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  function apply(edit: Edit) {
    setD((p) => ({ ...p, body: edit.value }));
    requestAnimationFrame(() => {
      const el = area.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(edit.start, edit.end);
    });
  }
  const sel = () => {
    const el = area.current;
    return { start: el?.selectionStart ?? d.body.length, end: el?.selectionEnd ?? d.body.length };
  };

  function runSave() {
    start(async () => {
      const res = await saveLegalAction({ slug, title: d.title, effective: d.effective, body: d.body, askAgain });
      if (res.ok) {
        toast.success(askAgain ? `${label} saved. Customers will be asked to accept it again.` : `${label} saved`);
        setSaved({ ...d });
        setAskAgain(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function onSave() {
    if (tooLong) return void toast.error("The text is too long (max 20,000 characters).");
    if (askAgain) setConfirm("ask");
    else runSave();
  }

  function onReset() {
    start(async () => {
      const res = await resetLegalAction({ slug });
      if (res.ok) window.location.reload();
      else toast.error(res.error);
    });
  }

  // Ctrl/Cmd+S saves while the editor has focus.
  function onKeyDown(e: React.KeyboardEvent) {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      if (dirty && !pending) onSave();
    }
  }

  function jumpTo(heading: string) {
    const idx = d.body.indexOf(`## ${heading}`);
    if (idx < 0) return;
    setTab("write");
    requestAnimationFrame(() => {
      const el2 = area.current;
      if (!el2) return;
      el2.focus();
      el2.setSelectionRange(idx, idx + heading.length + 3);
      const line = d.body.slice(0, idx).split("\n").length - 1;
      el2.scrollTop = Math.max(0, line * 22 - 40);
    });
  }

  return (
    <div className="space-y-3" onKeyDown={onKeyDown}>
      {/* status line */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <p>
          {meta ? (
            <>
              Last saved {when(meta.updatedAt)}
              {meta.updatedByName && <> by {meta.updatedByName}</>}
            </>
          ) : (
            "Showing the built-in default text. It becomes yours when you save."
          )}
        </p>
        <a href={`/${slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 font-semibold text-foreground underline">
          Open live page <ExternalLink className="size-3" aria-hidden />
        </a>
      </div>

      {slug === "privacy" && acceptance && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md border bg-muted/40 px-3 py-2 text-xs">
          <span>
            <strong>{acceptance.accepted}</strong> of <strong>{acceptance.total}</strong> customers have accepted the current version.
          </span>
          {acceptance.total > 0 && (
            <span className="h-1.5 w-32 overflow-hidden rounded-full bg-border" aria-hidden>
              <span className="block h-full bg-primary" style={{ width: `${Math.round((acceptance.accepted / acceptance.total) * 100)}%` }} />
            </span>
          )}
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>

        <TabsContent value="write" className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Page title">
              <Input value={d.title} maxLength={80} onChange={(e) => setD((p) => ({ ...p, title: e.target.value }))} />
            </Field>
            <Field label="Effective date / note" hint="Shown under the title">
              <Input value={d.effective} maxLength={60} onChange={(e) => setD((p) => ({ ...p, effective: e.target.value }))} />
            </Field>
          </div>

          <div className="rounded-md border">
            <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-1 border-b bg-muted/40 p-1.5">
              <Button type="button" size="sm" variant="ghost" onClick={() => { const s = sel(); apply(toggleHeading(d.body, s.start, s.end)); }}>
                <Heading2 className="mr-1 size-4" /> Heading
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => { const s = sel(); apply(toggleBullets(d.body, s.start, s.end)); }}>
                <List className="mr-1 size-4" /> Bullets
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  const s = sel();
                  selection.current = s;
                  setLink({ label: d.body.slice(s.start, s.end), url: "https://" });
                  setLinkError("");
                  setLinkOpen(true);
                }}
              >
                <Link2 className="mr-1 size-4" /> Link
              </Button>
              <span className="ml-auto pr-1 text-[11px] text-muted-foreground">
                {words.toLocaleString()} words · {d.body.length.toLocaleString()}/20,000
              </span>
            </div>
            <Textarea
              ref={area}
              aria-label={`${label} text`}
              rows={20}
              value={d.body}
              className="rounded-none border-0 font-mono text-[13px] leading-[22px] shadow-none focus-visible:ring-0"
              onChange={(e) => setD((p) => ({ ...p, body: e.target.value }))}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Blank line = new paragraph. <code>## Heading</code> makes a heading, lines starting with <code>- </code> make a list, and{" "}
            <code>[text](https://…)</code> makes a link.
          </p>

          {sections.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold">Sections ({sections.length})</p>
              <ul className="flex flex-wrap gap-1.5">
                {sections.map((s, i) => (
                  <li key={`${s}-${i}`}>
                    <button
                      type="button"
                      onClick={() => jumpTo(s)}
                      className="rounded-md border bg-card px-2 py-0.5 text-xs hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {slug === "privacy" && (
            <div className="rounded-md border border-dashed p-3">
              <Check label="Ask every customer to accept this policy again" checked={askAgain} onChange={setAskAgain} />
              <p className="mt-1 text-xs text-muted-foreground">
                For changes that affect customers&apos; rights or how their data is used. Leave it off for typo fixes.
              </p>
            </div>
          )}
        </TabsContent>

        <TabsContent value="preview" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">Exactly what customers will see (unsaved text included).</p>
            <div role="group" aria-label="Preview width" className="inline-flex rounded-md border p-0.5">
              <Button type="button" size="sm" variant={device === "desktop" ? "secondary" : "ghost"} aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")}>
                <Monitor className="mr-1 size-4" /> Desktop
              </Button>
              <Button type="button" size="sm" variant={device === "phone" ? "secondary" : "ghost"} aria-pressed={device === "phone"} onClick={() => setDevice("phone")}>
                <Smartphone className="mr-1 size-4" /> Phone
              </Button>
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 p-3 sm:p-6">
            <div className={`mx-auto rounded-md border bg-background px-6 py-8 shadow-sm ${device === "phone" ? "max-w-[375px]" : "max-w-2xl"}`}>
              <h1 className="text-3xl font-extrabold">{d.title || "Untitled"}</h1>
              {d.effective && <p className="mt-1 text-sm text-muted-foreground">{d.effective}</p>}
              <div className="mt-6">
                <LegalBody body={d.body} />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* action bar */}
      <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 border-t bg-background/95 px-1 py-2 backdrop-blur">
        <div className="flex items-center gap-3 text-xs">
          {dirty ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden /> Unsaved changes
            </span>
          ) : (
            <span className="text-muted-foreground">All changes saved</span>
          )}
          <button type="button" onClick={() => setConfirm("reset")} className="inline-flex items-center gap-1 text-muted-foreground underline hover:text-foreground">
            <RotateCcw className="size-3" aria-hidden /> Restore default text
          </button>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!dirty || pending}
            onClick={() => {
              setD(saved);
              setAskAgain(false);
            }}
          >
            <Undo2 className="mr-1 size-4" /> Discard
          </Button>
          <Button type="button" size="sm" disabled={!dirty || pending} onClick={onSave} title="Ctrl/Cmd + S">
            {pending && <Loader2 className="mr-1 size-4 animate-spin" />} Save {label}
          </Button>
        </div>
      </div>

      {/* link dialog */}
      <Dialog open={linkOpen} onOpenChange={setLinkOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a link</DialogTitle>
            <DialogDescription>Use a path like /terms, an https:// address, mailto: or tel:.</DialogDescription>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              const r = insertLink(d.body, selection.current.start, selection.current.end, link.label, link.url);
              if (!r.ok) return void setLinkError(r.error);
              setLinkOpen(false);
              apply(r);
            }}
          >
            <Field label="Link text">
              <Input value={link.label} onChange={(e) => setLink((p) => ({ ...p, label: e.target.value }))} placeholder="Privacy Policy" />
            </Field>
            <Field label="Address">
              <Input value={link.url} onChange={(e) => setLink((p) => ({ ...p, url: e.target.value }))} autoFocus />
            </Field>
            {linkError && <p role="alert" className="text-xs text-destructive">{linkError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setLinkOpen(false)}>Cancel</Button>
              <Button type="submit">Insert link</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* confirm dialogs */}
      <Dialog open={confirm !== null} onOpenChange={(o) => !o && setConfirm(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{confirm === "reset" ? `Restore the default ${label}?` : "Ask every customer to accept again?"}</DialogTitle>
            <DialogDescription>
              {confirm === "reset"
                ? "Your edited text is replaced by the built-in default. This cannot be undone."
                : `After saving, every customer sees the consent screen once on their next visit and must accept the new ${label} to keep ordering.`}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirm(null)}>Cancel</Button>
            <Button
              type="button"
              variant={confirm === "reset" ? "destructive" : "default"}
              onClick={() => {
                const c = confirm;
                setConfirm(null);
                if (c === "reset") onReset();
                else runSave();
              }}
            >
              {confirm === "reset" ? "Restore default" : "Save and ask again"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
