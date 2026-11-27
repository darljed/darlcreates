"use client";

/**
 * Product editor → Design presets. Make ready-made colour designs ("Ocean", "Sunset") and choose how customers pick colours:
 * their own, a ready-made design only, or either. A design stores the colour of every part; customers who pick it get
 * exactly those colours, so the order is the same as a hand-picked one (and a pre-printed unit can go in the parcel).
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, EyeOff, Eye, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { defaultPartSelection } from "@/lib/part-colors";
import { DESIGN_MODES, DESIGN_MODE_LABEL, MAX_PRESETS_PER_PRODUCT, type DesignMode } from "@/lib/presets";
import type { ProductOptionInput } from "@/lib/pricing";
import { deletePresetAction, saveDesignModeAction, savePresetAction, setPresetActiveAction } from "@/app/(admin)/admin/products/preset-actions";
import { useConfirm } from "@/components/confirm-provider";

export type PresetCard = {
  id: string;
  name: string;
  active: boolean;
  /** What customers would see right now (colours the shop's colour list hides are missing). */
  swatches: { label: string; hex: string }[];
  missing: string[];
  /** optionId -> valueId against ALL the product's colours, to edit the design. */
  choices: Record<string, string>;
};

type Draft = { id?: string; name: string; choices: Record<string, string> };

export function PresetEditor({ productId, options, presets, mode }: { productId: string; options: ProductOptionInput[]; presets: PresetCard[]; mode: DesignMode }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState<Draft | null>(null);
  const confirm = useConfirm();
  const colourOpts = options.filter((o) => o.type === "color" && o.values.length > 0);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: string, then?: () => void) =>
    start(async () => {
      const r = await fn();
      if (r.ok) { if (done) toast.success(done); then?.(); router.refresh(); } else toast.error(r.error ?? "Failed");
    });

  function startNew() {
    const d = defaultPartSelection(options);
    const choices: Record<string, string> = {};
    for (const o of colourOpts) choices[o.id] = d[o.id]?.valueId ?? o.values[0].id; // start from the model's own colours
    setDraft({ name: "", choices });
  }

  if (colourOpts.length === 0) {
    return <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Designs need colour options. Attach a 3MF and use &ldquo;detect&rdquo; above, or add a colour option with its colours.</p>;
  }

  return (
    <div className="space-y-4 rounded-lg border bg-card p-4">
      <fieldset className="space-y-1.5" disabled={pending}>
        <legend className="text-sm font-semibold">How customers choose colours</legend>
        {DESIGN_MODES.map((m) => (
          <label key={m} className="flex cursor-pointer items-start gap-2 text-sm">
            <input type="radio" name="design-mode" className="mt-1" checked={mode === m} onChange={() => run(() => saveDesignModeAction({ productId, mode: m }), "Saved")} />
            <span>{DESIGN_MODE_LABEL[m]}</span>
          </label>
        ))}
        <p className="text-xs text-muted-foreground">
          With &ldquo;either&rdquo;, a customer who picks a design can still change a colour (it then counts as their own). A design that is hidden, or whose colour is not offered right now, is not shown to customers; if none can be shown, the product falls back to custom colours.
        </p>
      </fieldset>

      <ul className="divide-y rounded-md border">
        {presets.length === 0 && <li className="p-3 text-sm text-muted-foreground">No designs yet.</li>}
        {presets.map((p) => (
          <li key={p.id} className={cn("flex flex-wrap items-center gap-3 p-3", !p.active && "opacity-60")}>
            <span className="flex" aria-hidden>
              {p.swatches.map((s, i) => <span key={i} title={`${s.label}: ${s.hex}`} className="-ml-1 size-6 rounded-full border-2 border-background first:ml-0" style={{ backgroundColor: s.hex }} />)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{p.name}</span>
              {!p.active && <span className="ml-2 text-xs text-muted-foreground">hidden</span>}
              {p.missing.length > 0 && <span className="ml-2 text-xs text-amber-700">not shown: {p.missing.join(", ")} not offered right now</span>}
            </span>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setDraft({ id: p.id, name: p.name, choices: p.choices })}><Pencil className="mr-1.5 size-3.5" />Edit</Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => setPresetActiveAction({ presetId: p.id, active: !p.active }))}>{p.active ? <><EyeOff className="mr-1.5 size-3.5" />Hide</> : <><Eye className="mr-1.5 size-3.5" />Show</>}</Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} aria-label={`Delete ${p.name}`} onClick={async () => { if (await confirm({ title: `Delete the design "${p.name}"?`, description: "Customers can no longer pick it. Orders already placed keep their colours. To take it off sale for a while, hide it instead.", confirmLabel: "Delete design", destructive: true })) run(() => deletePresetAction({ presetId: p.id }), "Deleted"); }}><Trash2 className="size-4" /></Button>
          </li>
        ))}
      </ul>

      {draft ? (
        <div className="space-y-3 rounded-md border bg-muted/30 p-3">
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="preset-name">Design name</Label>
            <Input id="preset-name" maxLength={40} value={draft.name} onChange={(e) => { const name = e.target.value; setDraft((d) => (d ? { ...d, name } : d)); }} placeholder="e.g. Ocean" />
          </div>
          {colourOpts.map((o) => (
            <div key={o.id} className="space-y-1.5">
              <p className="text-xs font-semibold">{o.label}</p>
              <div className="flex flex-wrap gap-1.5">
                {o.values.map((v) => {
                  const on = draft.choices[o.id] === v.id;
                  return (
                    <button key={v.id} type="button" aria-label={v.label} aria-pressed={on} title={v.label} onClick={() => setDraft((d) => (d ? { ...d, choices: { ...d.choices, [o.id]: v.id } } : d))}
                      className={cn("size-8 rounded-full border-2 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-foreground ring-2 ring-ring" : "border-border")} style={{ backgroundColor: v.value }} />
                  );
                })}
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <Button type="button" disabled={pending || !draft.name.trim()} onClick={() => run(() => savePresetAction({ productId, id: draft.id, name: draft.name, choices: draft.choices, active: presets.find((p) => p.id === draft.id)?.active ?? true }), "Design saved", () => setDraft(null))}>
              {pending ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}Save design
            </Button>
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <Button type="button" variant="outline" disabled={pending || presets.length >= MAX_PRESETS_PER_PRODUCT} onClick={startNew}><Plus className="mr-1.5 size-4" />Add a design</Button>
      )}
    </div>
  );
}
