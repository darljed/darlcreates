"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/shell/ui";
import { Check, Field } from "@/components/admin/editor-bits";
import { LegalBody } from "@/components/legal-body";
import type { LegalDoc, LegalSlug } from "@/lib/site-content-schema";
import { resetLegalAction, saveLegalAction } from "@/app/(admin)/admin/content/actions";

/** One legal page (privacy policy or terms). Body uses a tiny text format; the preview shows exactly what customers see. */
export function LegalEditor({ slug, initial }: { slug: LegalSlug; initial: LegalDoc }) {
  const router = useRouter();
  const [d, setD] = useState({ title: initial.title, effective: initial.effective, body: initial.body });
  const [askAgain, setAskAgain] = useState(false);
  const [preview, setPreview] = useState(false);
  const [pending, start] = useTransition();
  const label = slug === "privacy" ? "Privacy Policy" : "Terms and Conditions";

  function save() {
    start(async () => {
      const res = await saveLegalAction({ slug, ...d, askAgain });
      if (res.ok) {
        toast.success(`${label} saved${askAgain ? ". Customers will be asked to accept it again." : ""}`);
        setAskAgain(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function reset() {
    if (!window.confirm(`Restore the original ${label} text? Your edits will be lost.`)) return;
    start(async () => {
      const res = await resetLegalAction({ slug });
      if (res.ok) window.location.reload();
      else toast.error(res.error);
    });
  }

  return (
    <Panel
      title={label}
      actions={
        <a href={`/${slug}`} target="_blank" rel="noopener" className="inline-flex items-center gap-1 text-xs font-semibold underline">
          View page <ExternalLink className="size-3" aria-hidden />
        </a>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Title">
            <Input value={d.title} maxLength={80} onChange={(e) => setD((p) => ({ ...p, title: e.target.value }))} />
          </Field>
          <Field label="Effective date / note" hint="Shown under the title, e.g. Effective 10 November 2026">
            <Input value={d.effective} maxLength={60} onChange={(e) => setD((p) => ({ ...p, effective: e.target.value }))} />
          </Field>
        </div>

        <Field
          label="Text"
          hint="Leave a blank line between paragraphs. “## Heading” makes a heading. Start lines with “- ” for a bullet list. [text](https://…) makes a link."
        >
          <Textarea
            rows={16}
            value={d.body}
            maxLength={20000}
            className="font-mono text-[13px] leading-relaxed"
            onChange={(e) => setD((p) => ({ ...p, body: e.target.value }))}
          />
        </Field>

        {slug === "privacy" && (
          <div className="rounded-md border border-dashed p-3">
            <Check label="Ask every customer to accept this policy again" checked={askAgain} onChange={setAskAgain} />
            <p className="mt-1 text-xs text-muted-foreground">
              Tick this after a change that affects customers&apos; rights or how their data is used. Everyone sees one consent screen
              on their next visit. Leave it off for typo fixes.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? "Hide preview" : "Show preview"}
          </Button>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={reset} disabled={pending}>
              Restore default
            </Button>
            <Button type="button" size="sm" onClick={save} disabled={pending}>
              {pending && <Loader2 className="mr-1 size-4 animate-spin" />} Save changes
            </Button>
          </div>
        </div>

        {preview && (
          <div className="rounded-md border bg-card p-4">
            <h3 className="text-xl font-extrabold">{d.title}</h3>
            {d.effective && <p className="mt-1 text-sm text-muted-foreground">{d.effective}</p>}
            <div className="mt-4">
              <LegalBody body={d.body} />
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}
