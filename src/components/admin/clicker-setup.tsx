"use client";

/**
 * Admin: turn a product into a "design your own clicker" product and set what customers may do: the size range, the
 * price steps by size, the colours on offer (and how many one print can hold), how many switches a key may hold, name
 * keys, and the fit for your printer. Saves into the product's one text option
 * (see saveClickerConfigAction). The shop shows the designer in place of the option form.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shell/ui";
import { Check, Field } from "@/components/admin/editor-bits";
import { formatPHP } from "@/lib/money";
import { DEFAULT_CLICKER_CONFIG, LIMITS, type ClickerConfig } from "@/lib/clicker/spec";
import { saveClickerConfigAction } from "@/app/(admin)/admin/products/actions";

/** Pesos typed as text, kept as text while editing so "1." and "" are allowed. */
const pesos = (cents: number) => String(cents / 100);
const toCents = (s: string) => Math.max(0, Math.round((Number(s) || 0) * 100));

export function ClickerSetup({ productId, initial, canSwitchOn }: { productId: string; initial: ClickerConfig | null; canSwitchOn: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(Boolean(initial));
  const base = initial ?? DEFAULT_CLICKER_CONFIG;
  const [c, setC] = useState<ClickerConfig>(base);
  const set = (patch: Partial<ClickerConfig>) => setC((p) => ({ ...p, ...patch }));
  const num = (v: string) => Number(v) || 0;

  const save = (config: ClickerConfig | null) =>
    start(async () => {
      const res = await saveClickerConfigAction({ productId, config });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(config ? "Clicker designer saved" : "Back to a normal product");
      setOn(Boolean(config));
      router.refresh();
    });

  if (!on) {
    return (
      <Panel title="Clicker designer" description="Let customers design their own clicker: text or a picture, a shape, colours and a keyring.">
        <Button type="button" disabled={!canSwitchOn || pending} onClick={() => save(c)}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />} Make this a clicker product
        </Button>
        {!canSwitchOn && <p className="mt-2 text-xs text-muted-foreground">Remove this product&apos;s customization options first. The designer replaces them.</p>}
      </Panel>
    );
  }

  return (
    <Panel title="Clicker designer" description="Settings for the designer on this product's page. The product price above is the starting price.">
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Smallest key (mm)" hint={`${LIMITS.minSizeMm}+`}>
            <Input type="number" min={LIMITS.minSizeMm} max={LIMITS.maxSizeMm} value={c.minSize} onChange={(e) => set({ minSize: num(e.target.value) })} />
          </Field>
          <Field label="Largest key (mm)" hint={`up to ${LIMITS.maxSizeMm}`}>
            <Input type="number" min={LIMITS.minSizeMm} max={LIMITS.maxSizeMm} value={c.maxSize} onChange={(e) => set({ maxSize: num(e.target.value) })} />
          </Field>
          <Field label="Most layers" hint="texts and pictures">
            <Input type="number" min={1} max={LIMITS.maxLayers} value={c.maxLayers} onChange={(e) => set({ maxLayers: Math.round(num(e.target.value)) })} />
          </Field>
          <Field label="Most clickers" hint="per order">
            <Input type="number" min={1} max={30} value={c.maxClickers} onChange={(e) => set({ maxClickers: Math.round(num(e.target.value)) })} />
          </Field>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold">Price by size (added to the product price)</h3>
          {c.sizeTiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Field label="Up to (mm, longest side)">
                <Input type="number" className="w-32" min={LIMITS.minSizeMm} max={LIMITS.maxSizeMm} value={t.upToMm} onChange={(e) => set({ sizeTiers: c.sizeTiers.map((x, j) => (j === i ? { ...x, upToMm: num(e.target.value) } : x)) })} />
              </Field>
              <Field label="Adds (₱)">
                <Input type="number" className="w-32" min={0} step="0.01" defaultValue={pesos(t.addCents)} onChange={(e) => set({ sizeTiers: c.sizeTiers.map((x, j) => (j === i ? { ...x, addCents: toCents(e.target.value) } : x)) })} />
              </Field>
              <span className="pb-2 text-xs text-muted-foreground">{formatPHP(t.addCents)}</span>
              <Button type="button" size="icon" variant="outline" disabled={c.sizeTiers.length < 2} aria-label={`Remove size step ${i + 1}`} onClick={() => set({ sizeTiers: c.sizeTiers.filter((_, j) => j !== i) })}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          {c.sizeTiers.length < 8 && (
            <Button type="button" size="sm" variant="outline" onClick={() => set({ sizeTiers: [...c.sizeTiers, { upToMm: Math.min(LIMITS.maxSizeMm, (c.sizeTiers.at(-1)?.upToMm ?? 40) + 10), addCents: 0 }] })}>
              <Plus className="mr-1 size-4" /> Add a size step
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Each colour after the 2nd (₱)">
            <Input type="number" min={0} step="0.01" defaultValue={pesos(c.extraColourCents)} onChange={(e) => set({ extraColourCents: toCents(e.target.value) })} />
          </Field>
          <Field label="Keyring hole (₱)">
            <Input type="number" min={0} step="0.01" defaultValue={pesos(c.keyringCents)} onChange={(e) => set({ keyringCents: toCents(e.target.value) })} />
          </Field>
          <Field label="Picture (₱)" hint="when one is used">
            <Input type="number" min={0} step="0.01" defaultValue={pesos(c.imageCents)} onChange={(e) => set({ imageCents: toCents(e.target.value) })} />
          </Field>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold">Colours on offer (filaments you have)</h3>
          <div className="flex flex-wrap gap-2">
            {c.palette.map((hex, i) => (
              <div key={i} className="flex items-center gap-1 rounded-lg border-2 border-border p-1">
                <input
                  type="color"
                  aria-label={`Colour ${i + 1}`}
                  value={hex}
                  onChange={(e) => set({ palette: c.palette.map((x, j) => (j === i ? e.target.value : x)) })}
                  className="size-8 cursor-pointer rounded border-0 bg-transparent p-0"
                />
                <Button type="button" size="icon" variant="ghost" className="size-7" disabled={c.palette.length <= 2} aria-label={`Remove colour ${hex}`} onClick={() => set({ palette: c.palette.filter((_, j) => j !== i) })}>
                  <Trash2 className="size-3.5 text-destructive" />
                </Button>
              </div>
            ))}
            {c.palette.length < 24 && (
              <Button type="button" size="sm" variant="outline" className="h-10" onClick={() => set({ palette: [...c.palette, "#6366f1"] })}>
                <Plus className="mr-1 size-4" /> Colour
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">The first colour is the starting body colour. Pictures are matched to the nearest of these.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Most switches under one key" hint="1 to 6">
            <Input type="number" min={1} max={6} value={c.maxSwitches} onChange={(e) => set({ maxSwitches: Math.round(num(e.target.value)) })} />
          </Field>
          <Field label="Each extra switch (₱)" hint="Cherry MX, fitted">
            <Input type="number" min={0} step="0.01" defaultValue={pesos(c.extraSwitchCents)} onChange={(e) => set({ extraSwitchCents: toCents(e.target.value) })} />
          </Field>
          <Field label="Most colours per print" hint="your printer (X2D: 4)">
            <Input type="number" min={2} max={8} value={c.maxColours} onChange={(e) => set({ maxColours: Math.round(num(e.target.value)) })} />
          </Field>
          <Field label="Most keys (name keys)" hint="1 to 12">
            <Input type="number" min={1} max={12} value={c.maxKeys} onChange={(e) => set({ maxKeys: Math.round(num(e.target.value)) })} />
          </Field>
          <Field label="Each key after the 1st (₱)">
            <Input type="number" min={0} step="0.01" defaultValue={pesos(c.keyCents)} onChange={(e) => set({ keyCents: toCents(e.target.value) })} />
          </Field>
          <div className="self-end pb-2"><Check label="Name keys on offer" checked={c.allowName} onChange={(v) => set({ allowName: v })} /></div>
        </div>

        <div className="space-y-2 rounded-lg border-2 border-border p-3">
          <h3 className="text-xs font-bold">Printer fit</h3>
          <p className="text-[11px] text-muted-foreground">
            Every printer and filament fits a little differently. <a className="font-semibold text-primary underline" href="/admin/clicker-fit-test">Download the fit test</a>, print it,
            press a switch into each base and push each key onto a switch stem. Enter the number of the one that fits best. Plus loosens, minus tightens (mm). Start at 0.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Switch pocket" hint="base">
              <Input type="number" step="0.05" min={-0.5} max={0.5} value={c.tune.pocket} onChange={(e) => set({ tune: { ...c.tune, pocket: num(e.target.value) } })} />
            </Field>
            <Field label="Stem socket" hint="key">
              <Input type="number" step="0.05" min={-0.5} max={0.5} value={c.tune.stem} onChange={(e) => set({ tune: { ...c.tune, stem: num(e.target.value) } })} />
            </Field>
            <Field label="Gap round the key" hint="key to wall">
              <Input type="number" step="0.05" min={-0.5} max={0.5} value={c.tune.gap} onChange={(e) => set({ tune: { ...c.tune, gap: num(e.target.value) } })} />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap gap-5">
          <Check label="Customers can add text" checked={c.allowText} onChange={(v) => set({ allowText: v })} />
          <Check label="Customers can add pictures" checked={c.allowImages} onChange={(v) => set({ allowImages: v })} />
        </div>

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => save(c)}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />} Save clicker settings
          </Button>
          <Button type="button" variant="outline" disabled={pending} onClick={() => save(null)}>
            Make it a normal product again
          </Button>
        </div>
      </div>
    </Panel>
  );
}
