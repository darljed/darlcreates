"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/shell/ui";
import { Field, RowTools, swap } from "@/components/admin/editor-bits";
import type { SiteInfo } from "@/lib/site-content-schema";
import { resetSiteInfoAction, saveSiteInfoAction } from "@/app/(admin)/admin/content/actions";

type LinkList = "links" | "social";

export function StoreEditor({ initial }: { initial: SiteInfo }) {
  const router = useRouter();
  const [d, setD] = useState<SiteInfo>(initial);
  const [pending, start] = useTransition();

  const upd = (fn: (n: SiteInfo) => void) =>
    setD((p) => {
      const n = structuredClone(p);
      fn(n);
      return n;
    });

  function save() {
    start(async () => {
      const res = await saveSiteInfoAction(d);
      if (res.ok) {
        toast.success("Store info and footer saved");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function reset() {
    if (!window.confirm("Restore the original store info and footer? Your edits will be lost.")) return;
    start(async () => {
      const res = await resetSiteInfoAction();
      if (res.ok) window.location.reload();
      else toast.error(res.error);
    });
  }

  const linkList = (key: LinkList, title: string, description: string, max: number, what: string, fresh: { label: string; href: string }) => (
    <Panel
      title={title}
      description={`${description} (${d[key].length}/${max})`}
      actions={
        <Button type="button" size="sm" variant="outline" disabled={d[key].length >= max} onClick={() => upd((n) => void n[key].push({ ...fresh }))}>
          <Plus className="mr-1 size-4" /> Add
        </Button>
      }
    >
      <div className="space-y-2">
        {d[key].map((l, i) => (
          <div key={i} className="flex flex-wrap items-end gap-2 rounded-md border p-2">
            <Field label="Label" className="min-w-32 flex-1">
              <Input value={l.label} maxLength={30} onChange={(e) => upd((n) => void (n[key][i].label = e.target.value))} />
            </Field>
            <Field label="Link" className="min-w-48 flex-[2]" hint={key === "social" ? "https://…" : "/products, #how or https://…"}>
              <Input value={l.href} onChange={(e) => upd((n) => void (n[key][i].href = e.target.value))} />
            </Field>
            <RowTools
              i={i}
              n={d[key].length}
              what={`${what} ${i + 1}`}
              onMove={(dir) => upd((n) => swap(n[key], i, dir))}
              onRemove={() => upd((n) => void n[key].splice(i, 1))}
            />
          </div>
        ))}
        {d[key].length === 0 && <p className="text-sm text-muted-foreground">None. This block is hidden.</p>}
      </div>
    </Panel>
  );

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-1 py-2 backdrop-blur">
        <p className="text-xs text-muted-foreground">Shown in the footer of every storefront page.</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={reset} disabled={pending}>
            Restore defaults
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={pending}>
            {pending && <Loader2 className="mr-1 size-4 animate-spin" />} Save changes
          </Button>
        </div>
      </div>

      <Panel title="Store details">
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="Store name">
            <Input value={d.store.name} maxLength={60} onChange={(e) => upd((n) => void (n.store.name = e.target.value))} />
          </Field>
          <Field label="Tagline">
            <Input value={d.store.tagline} maxLength={120} onChange={(e) => upd((n) => void (n.store.tagline = e.target.value))} />
          </Field>
          <Field label="About (one or two sentences)" className="md:col-span-2">
            <Textarea rows={2} value={d.store.about} maxLength={300} onChange={(e) => upd((n) => void (n.store.about = e.target.value))} />
          </Field>
          <Field label="Contact email">
            <Input type="email" value={d.store.email} maxLength={120} onChange={(e) => upd((n) => void (n.store.email = e.target.value))} />
          </Field>
          <Field label="Phone / mobile" hint="Tap-to-call when it looks like a number">
            <Input value={d.store.phone} maxLength={40} onChange={(e) => upd((n) => void (n.store.phone = e.target.value))} />
          </Field>
          <Field label="Address / location">
            <Input value={d.store.address} maxLength={200} onChange={(e) => upd((n) => void (n.store.address = e.target.value))} />
          </Field>
          <Field label="Business hours">
            <Input value={d.store.hours} maxLength={120} placeholder="Mon–Sat, 9am–6pm" onChange={(e) => upd((n) => void (n.store.hours = e.target.value))} />
          </Field>
        </div>
      </Panel>

      {linkList("links", "Explore links", "Footer navigation", 8, "link", { label: "Link", href: "/" })}
      {linkList("social", "Social media", "Facebook, Instagram, TikTok…", 6, "social link", { label: "Facebook", href: "https://" })}

      <Panel title="Bottom line" description="Appears after “© Store name ·” at the very bottom.">
        <Field label="Text (optional)">
          <Input value={d.note} maxLength={160} onChange={(e) => upd((n) => void (n.note = e.target.value))} />
        </Field>
        <p className="mt-2 text-xs text-muted-foreground">
          The Privacy Policy and Terms and Conditions links are always shown. Edit those texts under Legal pages.
        </p>
      </Panel>
    </div>
  );
}
