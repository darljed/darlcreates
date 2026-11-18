"use client";

/**
 * Admin: turn a product into a "design your own name keychain" product and set what customers may do and what it costs:
 * the styles, fonts and icons on offer, the limits (letter height, letters, lines, length), the colours, and every price
 * (by length, extra line, icon, bag tag, extra colour, thick). Saves into the product's one text option
 * (see saveKeychainConfigAction). The shop shows the designer in place of the option form.
 */
import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shell/ui";
import { Check, Field } from "@/components/admin/editor-bits";
import { formatPHP } from "@/lib/money";
import { NAME_FONTS, NAME_FONT_IDS } from "@/lib/name-mesh";
import { ICON_GROUPS, ICON_IDS, ICON_LABELS, iconPath } from "@/lib/keychain/icons";
import { DEFAULT_KEYCHAIN_CONFIG, LIMITS, STYLE_IDS, STYLE_LABELS, type KeychainConfig } from "@/lib/keychain/spec";
import { saveKeychainConfigAction } from "@/app/(admin)/admin/products/actions";
import type { ColourInventory } from "@/lib/colour-inventory-schema";

/** Pesos typed as text, kept as text while editing so "1." and "" are allowed. */
const pesos = (cents: number) => String(cents / 100);
const toCents = (s: string) => Math.max(0, Math.round((Number(s) || 0) * 100));
const toggle = <T,>(list: readonly T[], item: T, on: boolean): T[] => (on ? [...list.filter((x) => x !== item), item] : list.filter((x) => x !== item));

export function KeychainSetup({ productId, initial, canSwitchOn, locked, inventory }: { productId: string; initial: KeychainConfig | null; canSwitchOn: boolean; /** a service: cannot go back to a normal product */ locked: boolean; inventory: ColourInventory | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useState(Boolean(initial));
  const [c, setC] = useState<KeychainConfig>(initial ?? DEFAULT_KEYCHAIN_CONFIG);
  const set = (patch: Partial<KeychainConfig>) => setC((p) => ({ ...p, ...patch }));
  const num = (v: string) => Number(v) || 0;

  const save = (config: KeychainConfig | null) =>
    start(async () => {
      const res = await saveKeychainConfigAction({ productId, config });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      toast.success(config ? "Keychain designer saved" : "Back to a normal product");
      setOn(Boolean(config));
      router.refresh();
    });

  if (!on) {
    return (
      <Panel title="Name keychain designer" description="Let customers design their own name keychain: a name in a font, an icon, colours and thickness, with automatic pricing.">
        <Button type="button" disabled={!canSwitchOn || pending} onClick={() => save(c)}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />} Make this a keychain product
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">It becomes a standalone service: out of the product grid, reached from &ldquo;Name keychain&rdquo; (/keychain), and it can no longer be deleted.</p>
        {!canSwitchOn && <p className="mt-2 text-xs text-muted-foreground">Remove this product&apos;s customization options first. The designer replaces them.</p>}
      </Panel>
    );
  }

  return (
    <Panel title="Name keychain designer" description="Settings for the designer on this product's page. The product price above is the starting price; everything below is added to it automatically.">
      <div className="space-y-5">
        <div className="space-y-2">
          <h3 className="text-xs font-bold">Styles on offer</h3>
          <div className="flex flex-wrap gap-5">
            {STYLE_IDS.map((id) => (
              <Check key={id} label={STYLE_LABELS[id]} checked={c.styles.includes(id)} onChange={(v) => set({ styles: toggle(c.styles, id, v).sort((a, b) => STYLE_IDS.indexOf(a) - STYLE_IDS.indexOf(b)) })} />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold">Fonts on offer</h3>
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {NAME_FONT_IDS.map((id) => (
              <Check key={id} label={NAME_FONTS[id].label} checked={c.fonts.includes(id)} onChange={(v) => set({ fonts: toggle(c.fonts, id, v).sort((a, b) => NAME_FONT_IDS.indexOf(a) - NAME_FONT_IDS.indexOf(b)) })} />
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold">Icons on offer (name + icon style)</h3>
          {ICON_GROUPS.map((g) => (
            <div key={g.label} className="space-y-1">
              <p className="text-[11px] font-semibold text-muted-foreground">{g.label}</p>
              <div className="flex flex-wrap gap-2">
                {g.ids.map((id) => {
                  const sel = c.icons.includes(id);
                  return (
                    <button key={id} type="button" aria-pressed={sel} title={ICON_LABELS[id]} aria-label={ICON_LABELS[id]} onClick={() => set({ icons: toggle(c.icons, id, !sel).sort((a, b) => ICON_IDS.indexOf(a) - ICON_IDS.indexOf(b)) })} className={`size-11 rounded-lg border-2 p-1.5 ${sel ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground opacity-60"}`}>
                      <svg viewBox="0 0 100 100" className="size-full" aria-hidden><path d={iconPath(id)} fill="currentColor" fillRule="evenodd" /></svg>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="text-[11px] text-muted-foreground">Icons are drawn in code (src/lib/keychain/icons.ts). Ask a developer to add more presets.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Smallest letters (mm)" hint={`${LIMITS.minSizeMm}+`}>
            <Input type="number" min={LIMITS.minSizeMm} max={LIMITS.maxSizeMm} value={c.minSize} onChange={(e) => set({ minSize: num(e.target.value) })} />
          </Field>
          <Field label="Largest letters (mm)" hint={`up to ${LIMITS.maxSizeMm}`}>
            <Input type="number" min={LIMITS.minSizeMm} max={LIMITS.maxSizeMm} value={c.maxSize} onChange={(e) => set({ maxSize: num(e.target.value) })} />
          </Field>
          <Field label="Most letters" hint={`up to ${LIMITS.maxChars}`}>
            <Input type="number" min={1} max={LIMITS.maxChars} value={c.maxChars} onChange={(e) => set({ maxChars: Math.round(num(e.target.value)) })} />
          </Field>
          <Field label="Most lines" hint={`up to ${LIMITS.maxLines}`}>
            <Input type="number" min={1} max={LIMITS.maxLines} value={c.maxLines} onChange={(e) => set({ maxLines: Math.round(num(e.target.value)) })} />
          </Field>
          <Field label="Longest keychain (mm)" hint="30 to 200">
            <Input type="number" min={30} max={LIMITS.maxLengthMm} value={c.maxLengthMm} onChange={(e) => set({ maxLengthMm: num(e.target.value) })} />
          </Field>
          <Field label="Most keychains" hint="per order">
            <Input type="number" min={1} max={30} value={c.maxKeychains} onChange={(e) => set({ maxKeychains: Math.round(num(e.target.value)) })} />
          </Field>
          <Field label="Most colours per print" hint="your printer (X2D: 4)">
            <Input type="number" min={2} max={8} value={c.maxColours} onChange={(e) => set({ maxColours: Math.round(num(e.target.value)) })} />
          </Field>
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-bold">Price by length (added to the product price)</h3>
          {c.sizeTiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-end gap-2">
              <Field label="Up to (mm, longest side)">
                <Input type="number" className="w-32" min={30} max={LIMITS.maxLengthMm} value={t.upToMm} onChange={(e) => set({ sizeTiers: c.sizeTiers.map((x, j) => (j === i ? { ...x, upToMm: num(e.target.value) } : x)) })} />
              </Field>
              <Field label="Adds (₱)">
                <Input type="number" className="w-32" min={0} step="0.01" defaultValue={pesos(t.addCents)} onChange={(e) => set({ sizeTiers: c.sizeTiers.map((x, j) => (j === i ? { ...x, addCents: toCents(e.target.value) } : x)) })} />
              </Field>
              <span className="pb-2 text-xs text-muted-foreground">{formatPHP(t.addCents)}</span>
              <Button type="button" size="icon" variant="outline" disabled={c.sizeTiers.length < 2} aria-label={`Remove length step ${i + 1}`} onClick={() => set({ sizeTiers: c.sizeTiers.filter((_, j) => j !== i) })}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
            </div>
          ))}
          {c.sizeTiers.length < 8 && (
            <Button type="button" size="sm" variant="outline" onClick={() => set({ sizeTiers: [...c.sizeTiers, { upToMm: Math.min(LIMITS.maxLengthMm, (c.sizeTiers.at(-1)?.upToMm ?? 60) + 20), addCents: 0 }] })}>
              <Plus className="mr-1 size-4" /> Add a length step
            </Button>
          )}
          <p className="text-[11px] text-muted-foreground">The last step must reach the longest keychain you allow.</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Each line after the 1st (₱)">
            <Input type="number" min={0} step="0.01" defaultValue={pesos(c.lineCents)} onChange={(e) => set({ lineCents: toCents(e.target.value) })} />
          </Field>
          <Field label="Name + icon style (₱)">
            <Input type="number" min={0} step="0.01" defaultValue={pesos(c.iconCents)} onChange={(e) => set({ iconCents: toCents(e.target.value) })} />
          </Field>
          <Field label="Bag tag style (₱)">
            <Input type="number" min={0} step="0.01" defaultValue={pesos(c.tagCents)} onChange={(e) => set({ tagCents: toCents(e.target.value) })} />
          </Field>
          <Field label="Each colour after the 2nd (₱)">
            <Input type="number" min={0} step="0.01" defaultValue={pesos(c.extraColourCents)} onChange={(e) => set({ extraColourCents: toCents(e.target.value) })} />
          </Field>
          <Field label="Thick keychain adds (₱)">
            <Input type="number" min={0} step="0.01" defaultValue={pesos(c.thickCents)} onChange={(e) => set({ thickCents: toCents(e.target.value) })} />
          </Field>
          <Field label="Thick means more than (mm)" hint="plate + letters">
            <Input type="number" min={2} max={8} step="0.1" value={c.thickOverMm} onChange={(e) => set({ thickOverMm: num(e.target.value) })} />
          </Field>
        </div>

        {inventory ? (
          <div className="space-y-2">
            <h3 className="text-xs font-bold">Colours on offer</h3>
            <div className="flex flex-wrap gap-2">
              {inventory.colours.map((col) => (
                <span key={col.hex} className="inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs">
                  <span className="size-3.5 rounded-full border" style={{ backgroundColor: col.hex }} /> {col.name}
                </span>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              These are the colours you have in stock, the same for every product. Change them under <Link href="/admin/colours" className="underline">Colours</Link>.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            <h3 className="text-xs font-bold">Colours on offer (filaments you have)</h3>
            <div className="flex flex-wrap gap-2">
              {c.palette.map((hex, i) => (
                <div key={i} className="flex items-center gap-1 rounded-lg border-2 border-border p-1">
                  <input type="color" aria-label={`Colour ${i + 1}`} value={hex} onChange={(e) => set({ palette: c.palette.map((x, j) => (j === i ? e.target.value : x)) })} className="size-8 cursor-pointer rounded border-0 bg-transparent p-0" />
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
            <p className="text-xs text-muted-foreground">
              Tip: list your colours once under <Link href="/admin/colours" className="underline">Colours</Link> and they are used on every product.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => save(c)}>
            {pending && <Loader2 className="mr-2 size-4 animate-spin" />} Save keychain settings
          </Button>
          {!locked && (
            <Button type="button" variant="outline" disabled={pending} onClick={() => save(null)}>
              Make it a normal product again
            </Button>
          )}
        </div>
      </div>
    </Panel>
  );
}
