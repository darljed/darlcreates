"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ImagePlus, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/shell/ui";
import { uploadToS3 } from "@/lib/upload-client";
import { fileUrl } from "@/lib/storage-url";
import { ICON_NAMES, type HomeContent } from "@/lib/site-content-schema";
import { resetHomeContentAction, saveHomeContentAction } from "@/app/(admin)/admin/content/actions";

/** Label wraps its control, so every input has an accessible name without id plumbing. */
function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`grid gap-1 text-xs font-medium ${className ?? ""}`}>
      <span>{label}</span>
      {children}
      {hint && <span className="font-normal text-muted-foreground">{hint}</span>}
    </label>
  );
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-sm font-medium">
      <input type="checkbox" className="size-4 accent-[var(--primary)]" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function RowTools({ i, n, onMove, onRemove, what }: { i: number; n: number; onMove: (d: -1 | 1) => void; onRemove: () => void; what: string }) {
  return (
    <div className="flex shrink-0 gap-1">
      <Button type="button" size="icon" variant="outline" disabled={i === 0} onClick={() => onMove(-1)} aria-label={`Move ${what} up`}>
        <ArrowUp className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="outline" disabled={i === n - 1} onClick={() => onMove(1)} aria-label={`Move ${what} down`}>
        <ArrowDown className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="outline" onClick={onRemove} aria-label={`Remove ${what}`}>
        <Trash2 className="size-4 text-destructive" />
      </Button>
    </div>
  );
}

function swap<T>(arr: T[], i: number, d: -1 | 1) {
  const j = i + d;
  if (j < 0 || j >= arr.length) return;
  [arr[i], arr[j]] = [arr[j], arr[i]];
}

export function ContentEditor({ initial }: { initial: HomeContent }) {
  const router = useRouter();
  const [d, setD] = useState<HomeContent>(initial);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const upd = (fn: (n: HomeContent) => void) =>
    setD((p) => {
      const n = structuredClone(p);
      fn(n);
      return n;
    });

  function save() {
    start(async () => {
      const res = await saveHomeContentAction(d);
      if (res.ok) {
        toast.success("Landing page saved");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function reset() {
    if (!window.confirm("Restore the original landing page text? Your edits will be lost.")) return;
    start(async () => {
      const res = await resetHomeContentAction();
      if (res.ok) {
        toast.success("Restored defaults");
        router.refresh();
        window.location.reload();
      } else toast.error(res.error);
    });
  }

  async function onImage(file: File) {
    setUploading(true);
    try {
      const key = await uploadToS3("site", file);
      upd((n) => void (n.hero.imageKey = key));
      toast.success("Image uploaded. Save to publish it.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const imageSrc = fileUrl(d.hero.imageKey);

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-1 py-2 backdrop-blur">
        <p className="text-xs text-muted-foreground">Changes go live when you save.</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={reset} disabled={pending}>
            Restore defaults
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={pending || uploading}>
            {pending && <Loader2 className="mr-1 size-4 animate-spin" />} Save changes
          </Button>
        </div>
      </div>

      <Panel title="Announcement bar" description="A thin banner above the hero. Good for promos.">
        <div className="grid gap-3 md:grid-cols-2">
          <Check label="Show announcement" checked={d.announcement.enabled} onChange={(v) => upd((n) => void (n.announcement.enabled = v))} />
          <span />
          <Field label="Text">
            <Input value={d.announcement.text} maxLength={160} onChange={(e) => upd((n) => void (n.announcement.text = e.target.value))} />
          </Field>
          <Field label="Link (optional)" hint="/products, #how or https://…">
            <Input value={d.announcement.href} onChange={(e) => upd((n) => void (n.announcement.href = e.target.value))} />
          </Field>
        </div>
      </Panel>

      <Panel title="Hero">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Badge (small label above the title)">
            <Input value={d.hero.badge} maxLength={60} onChange={(e) => upd((n) => void (n.hero.badge = e.target.value))} />
          </Field>
          <span />
          <Field label="Title, line 1">
            <Input value={d.hero.titleLine1} maxLength={60} onChange={(e) => upd((n) => void (n.hero.titleLine1 = e.target.value))} />
          </Field>
          <Field label="Title, line 2 (highlighted)">
            <Input value={d.hero.titleLine2} maxLength={60} onChange={(e) => upd((n) => void (n.hero.titleLine2 = e.target.value))} />
          </Field>
          <Field label="Subtext" className="md:col-span-2">
            <Textarea rows={2} value={d.hero.subtext} maxLength={300} onChange={(e) => upd((n) => void (n.hero.subtext = e.target.value))} />
          </Field>
          <Field label="Main button label">
            <Input value={d.hero.primary.label} maxLength={30} onChange={(e) => upd((n) => void (n.hero.primary.label = e.target.value))} />
          </Field>
          <Field label="Main button link">
            <Input value={d.hero.primary.href} onChange={(e) => upd((n) => void (n.hero.primary.href = e.target.value))} />
          </Field>
          <Field label="Second button label (optional)">
            <Input value={d.hero.secondary.label} maxLength={30} onChange={(e) => upd((n) => void (n.hero.secondary.label = e.target.value))} />
          </Field>
          <Field label="Second button link">
            <Input value={d.hero.secondary.href} onChange={(e) => upd((n) => void (n.hero.secondary.href = e.target.value))} />
          </Field>
        </div>

        <div className="mt-4 flex flex-wrap items-start gap-4 border-t pt-3">
          {imageSrc ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageSrc} alt={d.hero.imageAlt || "Hero image preview"} className="size-28 rounded-md border object-cover" />
          ) : (
            <div className="flex size-28 items-center justify-center rounded-md border border-dashed text-xs text-muted-foreground">No image</div>
          )}
          <div className="grid min-w-60 flex-1 gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Choose hero image"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void onImage(f);
              }}
            />
            <div className="flex gap-2">
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={() => fileInput.current?.click()}>
                {uploading ? <Loader2 className="mr-1 size-4 animate-spin" /> : <ImagePlus className="mr-1 size-4" />}
                {d.hero.imageKey ? "Replace image" : "Add hero image"}
              </Button>
              {d.hero.imageKey && (
                <Button type="button" variant="outline" size="sm" onClick={() => upd((n) => void (n.hero.imageKey = null))}>
                  Remove
                </Button>
              )}
            </div>
            <Field label="Image description (for screen readers)">
              <Input value={d.hero.imageAlt} maxLength={120} onChange={(e) => upd((n) => void (n.hero.imageAlt = e.target.value))} />
            </Field>
            <p className="text-xs text-muted-foreground">Optional. JPEG, PNG or WebP, up to 5 MB. Square works best.</p>
          </div>
        </div>
      </Panel>

      <Panel
        title="Highlights"
        description={`${d.highlights.length}/6 cards under the hero.`}
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={d.highlights.length >= 6}
            onClick={() => upd((n) => void n.highlights.push({ icon: "Sparkles", title: "New highlight", body: "" }))}
          >
            <Plus className="mr-1 size-4" /> Add
          </Button>
        }
      >
        <div className="space-y-2">
          {d.highlights.map((h, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
              <Field label="Icon">
                <select
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                  value={h.icon}
                  onChange={(e) => upd((n) => void (n.highlights[i].icon = e.target.value as (typeof ICON_NAMES)[number]))}
                >
                  {ICON_NAMES.map((name) => (
                    <option key={name}>{name}</option>
                  ))}
                </select>
              </Field>
              <Field label="Title" className="min-w-40 flex-1">
                <Input value={h.title} maxLength={40} onChange={(e) => upd((n) => void (n.highlights[i].title = e.target.value))} />
              </Field>
              <Field label="Text" className="min-w-56 flex-[2]">
                <Input value={h.body} maxLength={200} onChange={(e) => upd((n) => void (n.highlights[i].body = e.target.value))} />
              </Field>
              <RowTools
                i={i}
                n={d.highlights.length}
                what={`highlight ${i + 1}`}
                onMove={(dir) => upd((n) => swap(n.highlights, i, dir))}
                onRemove={() => upd((n) => void n.highlights.splice(i, 1))}
              />
            </div>
          ))}
          {d.highlights.length === 0 && <p className="text-sm text-muted-foreground">No highlights. The section is hidden.</p>}
        </div>
      </Panel>

      <Panel title="Featured products" description="Shows your newest published products on the landing page.">
        <div className="grid gap-3 md:grid-cols-3">
          <Check label="Show this section" checked={d.featured.enabled} onChange={(v) => upd((n) => void (n.featured.enabled = v))} />
          <Field label="Section title">
            <Input value={d.featured.title} maxLength={60} onChange={(e) => upd((n) => void (n.featured.title = e.target.value))} />
          </Field>
          <Field label="How many (1 to 8)">
            <Input
              type="number"
              min={1}
              max={8}
              value={d.featured.limit}
              onChange={(e) => upd((n) => void (n.featured.limit = Math.min(8, Math.max(1, Math.round(Number(e.target.value)) || 1))))}
            />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Questions (FAQ)"
        description={`${d.faq.length}/10`}
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={d.faq.length >= 10}
            onClick={() => upd((n) => void n.faq.push({ q: "New question", a: "Answer" }))}
          >
            <Plus className="mr-1 size-4" /> Add
          </Button>
        }
      >
        <div className="space-y-2">
          {d.faq.map((f, i) => (
            <div key={i} className="flex flex-wrap items-start gap-2 rounded-md border p-2">
              <div className="grid min-w-60 flex-1 gap-2">
                <Field label="Question">
                  <Input value={f.q} maxLength={120} onChange={(e) => upd((n) => void (n.faq[i].q = e.target.value))} />
                </Field>
                <Field label="Answer">
                  <Textarea rows={2} value={f.a} maxLength={600} onChange={(e) => upd((n) => void (n.faq[i].a = e.target.value))} />
                </Field>
              </div>
              <RowTools
                i={i}
                n={d.faq.length}
                what={`question ${i + 1}`}
                onMove={(dir) => upd((n) => swap(n.faq, i, dir))}
                onRemove={() => upd((n) => void n.faq.splice(i, 1))}
              />
            </div>
          ))}
          {d.faq.length === 0 && <p className="text-sm text-muted-foreground">No questions. The section is hidden.</p>}
        </div>
      </Panel>

      <Panel title="Call-to-action band">
        <div className="grid gap-3 md:grid-cols-3">
          <Field label="Headline">
            <Input value={d.cta.title} maxLength={80} onChange={(e) => upd((n) => void (n.cta.title = e.target.value))} />
          </Field>
          <Field label="Button label">
            <Input value={d.cta.label} maxLength={30} onChange={(e) => upd((n) => void (n.cta.label = e.target.value))} />
          </Field>
          <Field label="Button link">
            <Input value={d.cta.href} onChange={(e) => upd((n) => void (n.cta.href = e.target.value))} />
          </Field>
        </div>
      </Panel>

      <Panel
        title="Footer (every storefront page)"
        actions={
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={d.footer.links.length >= 6}
            onClick={() => upd((n) => void n.footer.links.push({ label: "Link", href: "/" }))}
          >
            <Plus className="mr-1 size-4" /> Add link
          </Button>
        }
      >
        <div className="space-y-2">
          <Field label="Text after “© Darl Creates ·”">
            <Input value={d.footer.text} maxLength={160} onChange={(e) => upd((n) => void (n.footer.text = e.target.value))} />
          </Field>
          {d.footer.links.map((l, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
              <Field label="Label" className="min-w-32 flex-1">
                <Input value={l.label} maxLength={30} onChange={(e) => upd((n) => void (n.footer.links[i].label = e.target.value))} />
              </Field>
              <Field label="Link" className="min-w-48 flex-[2]">
                <Input value={l.href} onChange={(e) => upd((n) => void (n.footer.links[i].href = e.target.value))} />
              </Field>
              <RowTools
                i={i}
                n={d.footer.links.length}
                what={`footer link ${i + 1}`}
                onMove={(dir) => upd((n) => swap(n.footer.links, i, dir))}
                onRemove={() => upd((n) => void n.footer.links.splice(i, 1))}
              />
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
