"use client";

/**
 * Admin: the shipping rate table. Edits the whole ShippingConfig (weight tiers x zones, per-kg rule, parcel settings, province
 * zones) and saves it in one go. Amounts are typed in pesos and stored as centavos. A "Try it" box quotes with the same pure
 * function the checkout uses, so the owner can check the table before relying on it.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Panel } from "@/components/shell/ui";
import { formatPHP } from "@/lib/money";
import type { PsgcIndex } from "@/lib/psgc";
import {
  DEFAULT_SHIPPING_CONFIG, defaultZone, kg, quoteShipping, shippingConfigSchema, ZONE_IDS, ZONE_LABELS, zoneOf,
  type ShippingConfig, type ZoneId,
} from "@/lib/shipping";
import { resetShippingConfigAction, saveShippingConfigAction } from "@/app/(admin)/admin/shipping/actions";

const ZONE_SHORT: Record<ZoneId, string> = { "metro-manila": "Metro Manila", luzon: "Luzon", visayas: "Visayas", mindanao: "Mindanao", island: "Island provinces" };
const selectClass = "h-8 rounded-md border bg-background px-2 text-xs";
const numClass = "h-8 text-xs tabular-nums";

const toPesoText = (cents: number) => String(cents / 100);
/** Typed text to a whole number (or NaN when blank/invalid), so validation can tell. */
const num = (s: string) => (s.trim() === "" ? NaN : Number(s));
const toCents = (s: string) => Math.round(num(s) * 100);

type Draft = {
  tiers: string[];
  rates: Record<ZoneId, string[]>;
  over: Record<ZoneId, string>;
  packagingGrams: string;
  defaultItemGrams: string;
  freeOver: string;
  verifiedOn: string;
  note: string;
  provinceZones: Record<string, ZoneId>;
};

function toDraft(c: ShippingConfig): Draft {
  return {
    tiers: c.tiers.map(String),
    rates: Object.fromEntries(ZONE_IDS.map((z) => [z, c.rates[z].map(toPesoText)])) as Draft["rates"],
    over: Object.fromEntries(ZONE_IDS.map((z) => [z, toPesoText(c.overKgCents[z])])) as Draft["over"],
    packagingGrams: String(c.packagingGrams),
    defaultItemGrams: String(c.defaultItemGrams),
    freeOver: toPesoText(c.freeOverCents),
    verifiedOn: c.verifiedOn,
    note: c.note,
    provinceZones: { ...c.provinceZones },
  };
}

/** Draft text to a config plus the first problem found (the zod schema is the final word, the action checks it again). */
function build(d: Draft): { config: ShippingConfig | null; error: string | null } {
  const all = [...d.tiers, ...ZONE_IDS.flatMap((z) => d.rates[z]), ...ZONE_IDS.map((z) => d.over[z]), d.packagingGrams, d.defaultItemGrams, d.freeOver];
  if (all.some((s) => Number.isNaN(num(s)))) return { config: null, error: "Fill in every weight and price (use 0 for none)." };
  const candidate = {
    tiers: d.tiers.map(num),
    rates: Object.fromEntries(ZONE_IDS.map((z) => [z, d.rates[z].map(toCents)])),
    overKgCents: Object.fromEntries(ZONE_IDS.map((z) => [z, toCents(d.over[z])])),
    packagingGrams: num(d.packagingGrams),
    defaultItemGrams: num(d.defaultItemGrams),
    freeOverCents: toCents(d.freeOver),
    provinceZones: d.provinceZones,
    verifiedOn: d.verifiedOn,
    note: d.note,
  };
  const r = shippingConfigSchema.safeParse(candidate);
  return r.success ? { config: r.data, error: null } : { config: null, error: r.error.issues[0]?.message ?? "Check the numbers." };
}

export function ShippingEditor({ initial, index }: { initial: ShippingConfig; index: PsgcIndex }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [d, setD] = useState<Draft>(() => toDraft(initial));
  const [resetOpen, setResetOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const [tryCode, setTryCode] = useState(index.provinces.find((p) => p.kind === "n")?.code ?? index.provinces[0]?.code ?? "");
  const [tryGrams, setTryGrams] = useState("300");
  const [tryTotal, setTryTotal] = useState("0");

  const { config, error } = useMemo(() => build(d), [d]);
  const patch = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  function setTier(i: number, v: string) {
    setD((x) => ({ ...x, tiers: x.tiers.map((t, k) => (k === i ? v : t)) }));
  }
  function setRate(z: ZoneId, i: number, v: string) {
    setD((x) => ({ ...x, rates: { ...x.rates, [z]: x.rates[z].map((r, k) => (k === i ? v : r)) } }));
  }
  function addTier() {
    setD((x) => {
      const last = num(x.tiers[x.tiers.length - 1]);
      const next = String((Number.isNaN(last) ? 0 : last) + 500);
      return { ...x, tiers: [...x.tiers, next], rates: Object.fromEntries(ZONE_IDS.map((z) => [z, [...x.rates[z], x.rates[z][x.rates[z].length - 1] ?? "0"]])) as Draft["rates"] };
    });
  }
  function removeTier(i: number) {
    setD((x) => ({ ...x, tiers: x.tiers.filter((_, k) => k !== i), rates: Object.fromEntries(ZONE_IDS.map((z) => [z, x.rates[z].filter((_, k) => k !== i)])) as Draft["rates"] }));
  }
  function setProvinceZone(code: string, zone: ZoneId, def: ZoneId) {
    setD((x) => {
      const next = { ...x.provinceZones };
      if (zone === def) delete next[code];
      else next[code] = zone;
      return { ...x, provinceZones: next };
    });
  }

  function save() {
    if (!config) return;
    start(async () => {
      const res = await saveShippingConfigAction(config);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Shipping rates saved");
      router.refresh();
    });
  }
  function reset() {
    start(async () => {
      const res = await resetShippingConfigAction();
      setResetOpen(false);
      if (!res.ok) return void toast.error(res.error);
      setD(toDraft(DEFAULT_SHIPPING_CONFIG));
      toast.success("Starting rates restored");
      router.refresh();
    });
  }

  const q = filter.trim().toLowerCase();
  const regions = index.regions
    .map((r) => ({ region: r, provinces: index.provinces.filter((p) => p.regionCode === r.code && (!q || p.name.toLowerCase().includes(q) || r.name.toLowerCase().includes(q))) }))
    .filter((g) => g.provinces.length > 0);
  const overrides = Object.keys(d.provinceZones).length;

  const tryProvince = index.provinces.find((p) => p.code === tryCode);
  const tryQuote = config && tryProvince && Number.isFinite(num(tryGrams)) && num(tryGrams) > 0
    ? quoteShipping(config, tryProvince, [{ qty: 1, weightGrams: Math.round(num(tryGrams)) }], Math.round(num(tryTotal) * 100) || 0)
    : null;

  return (
    <div className="space-y-4">
      <p className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
        The starting rates are the J&amp;T Express public walk-in rates from Luzon (January 2025). Check every price against your own courier rate card before relying on it, then set the date below.
      </p>

      <Panel title="Rate table" description="What a parcel costs by weight and where it goes. A parcel pays the first row it fits in (items plus packaging).">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1.5 pr-2 font-semibold">Up to (g)</th>
                {ZONE_IDS.map((z) => (
                  <th key={z} scope="col" className="px-1 py-1.5 font-semibold">{ZONE_SHORT[z]} (₱)</th>
                ))}
                <th scope="col" className="w-8"><span className="sr-only">Remove</span></th>
              </tr>
            </thead>
            <tbody>
              {d.tiers.map((t, i) => (
                <tr key={i} className="border-t">
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-1.5">
                      <Input type="number" min={50} step={50} value={t} onChange={(e) => setTier(i, e.target.value)} aria-label={`Tier ${i + 1} up to grams`} className={`${numClass} w-24`} />
                      <span className="whitespace-nowrap text-muted-foreground">{Number.isFinite(num(t)) ? kg(num(t)) : ""}</span>
                    </div>
                  </td>
                  {ZONE_IDS.map((z) => (
                    <td key={z} className="px-1 py-1.5">
                      <Input type="number" min={0} step="0.5" value={d.rates[z][i]} onChange={(e) => setRate(z, i, e.target.value)} aria-label={`${ZONE_LABELS[z]}, tier ${i + 1}, pesos`} className={`${numClass} w-24`} />
                    </td>
                  ))}
                  <td className="py-1.5 text-right">
                    <Button type="button" variant="ghost" size="icon" className="size-7" disabled={d.tiers.length <= 1} onClick={() => removeTier(i)} aria-label={`Remove tier ${i + 1}`}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30">
                <td className="py-1.5 pr-2 font-medium">Each extra kg beyond the last tier (₱)</td>
                {ZONE_IDS.map((z) => (
                  <td key={z} className="px-1 py-1.5">
                    <Input type="number" min={0} step="0.5" value={d.over[z]} onChange={(e) => patch({ over: { ...d.over, [z]: e.target.value } })} aria-label={`${ZONE_LABELS[z]}, each extra kg, pesos`} className={`${numClass} w-24`} />
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <Button type="button" variant="outline" size="sm" disabled={d.tiers.length >= 10} onClick={addTier}>
            <Plus className="mr-1 size-4" /> Add a weight tier
          </Button>
        </div>
      </Panel>

      <Panel title="Parcel settings">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="ship-pack" className="text-xs">Packaging weight (g)</Label>
            <Input id="ship-pack" type="number" min={0} max={5000} value={d.packagingGrams} onChange={(e) => patch({ packagingGrams: e.target.value })} className={numClass} />
            <p className="text-xs text-muted-foreground">Box, filler and tape added to every parcel.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ship-default" className="text-xs">Weight of an item with no weight set (g)</Label>
            <Input id="ship-default" type="number" min={1} max={50000} value={d.defaultItemGrams} onChange={(e) => patch({ defaultItemGrams: e.target.value })} className={numClass} />
            <p className="text-xs text-muted-foreground">Set a product&apos;s own weight in its edit page.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ship-free" className="text-xs">Free shipping over (₱)</Label>
            <Input id="ship-free" type="number" min={0} step="1" value={d.freeOver} onChange={(e) => patch({ freeOver: e.target.value })} className={numClass} />
            <p className="text-xs text-muted-foreground">0 = no free shipping.</p>
          </div>
          <div className="space-y-1">
            <Label htmlFor="ship-verified" className="text-xs">Rates last checked on</Label>
            <Input id="ship-verified" type="date" value={d.verifiedOn} onChange={(e) => patch({ verifiedOn: e.target.value })} className="h-8 text-xs" />
            <p className="text-xs text-muted-foreground">Shown on the public rates page. Leave empty to hide.</p>
          </div>
        </div>
        <div className="mt-3 space-y-1">
          <Label htmlFor="ship-note" className="text-xs">Note on the rates page</Label>
          <textarea id="ship-note" rows={2} maxLength={400} value={d.note} onChange={(e) => patch({ note: e.target.value })} className="w-full rounded-md border bg-background px-2 py-1.5 text-xs" />
          <p className="text-xs text-muted-foreground">{d.note.length}/400. Shown publicly, for example the courier and how long delivery takes.</p>
        </div>
      </Panel>

      <Panel
        title="Province zones"
        description={`Every province-level unit and its zone. ${overrides ? `${overrides} changed from the default.` : "All are on the default."}`}
      >
        <div className="mb-2 max-w-xs space-y-1">
          <Label htmlFor="ship-filter" className="text-xs">Find a province or region</Label>
          <Input id="ship-filter" value={filter} onChange={(e) => setFilter(e.target.value)} className="h-8 text-xs" />
        </div>
        <div className="max-h-96 overflow-y-auto border">
          {regions.length === 0 && <p className="p-3 text-xs text-muted-foreground">Nothing matches.</p>}
          {regions.map(({ region, provinces }) => (
            <div key={region.code}>
              <h3 className="sticky top-0 bg-muted/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground backdrop-blur">{region.name}</h3>
              <ul>
                {provinces.map((p) => {
                  const def = defaultZone(p);
                  const current = zoneOf({ ...DEFAULT_SHIPPING_CONFIG, provinceZones: d.provinceZones }, p);
                  const changed = current !== def;
                  return (
                    <li key={p.code} className="flex items-center gap-2 border-t px-3 py-1 text-xs">
                      <label htmlFor={`zone-${p.code}`} className="min-w-0 flex-1 truncate">{p.name}</label>
                      {changed && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">Changed (default: {ZONE_SHORT[def]})</span>}
                      <select id={`zone-${p.code}`} value={current} onChange={(e) => setProvinceZone(p.code, e.target.value as ZoneId, def)} className={selectClass}>
                        {ZONE_IDS.map((z) => (
                          <option key={z} value={z}>{ZONE_SHORT[z]}{z === def ? " (default)" : ""}</option>
                        ))}
                      </select>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Try it" description="Check the table. Nothing is saved here.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label htmlFor="try-prov" className="text-xs">Province</Label>
            <select id="try-prov" value={tryCode} onChange={(e) => setTryCode(e.target.value)} className={`${selectClass} w-56`}>
              {index.provinces.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="try-grams" className="text-xs">Items weight (g)</Label>
            <Input id="try-grams" type="number" min={1} value={tryGrams} onChange={(e) => setTryGrams(e.target.value)} className={`${numClass} w-28`} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="try-total" className="text-xs">Order total (₱)</Label>
            <Input id="try-total" type="number" min={0} value={tryTotal} onChange={(e) => setTryTotal(e.target.value)} className={`${numClass} w-28`} />
          </div>
        </div>
        <p className="mt-3 text-sm" aria-live="polite">
          {tryQuote ? (
            <>
              <strong>{tryQuote.free ? "Free" : formatPHP(tryQuote.feeCents)}</strong>
              <span className="text-xs text-muted-foreground"> · {tryQuote.zoneLabel} · parcel {kg(tryQuote.grams)} ({tryQuote.tierLabel}){tryQuote.free ? ` · table fee ${formatPHP(tryQuote.baseCents)}` : ""}</span>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">Fix the table to see a quote.</span>
          )}
        </p>
      </Panel>

      {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button type="button" variant="ghost" disabled={pending} onClick={() => setResetOpen(true)}>Reset to starting rates</Button>
        <Button type="button" disabled={pending || !config} onClick={save}>
          {pending && <Loader2 className="mr-2 size-4 animate-spin" />} Save shipping rates
        </Button>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset to starting rates?</DialogTitle>
            <DialogDescription>Your saved rates, zones, settings and note are replaced by the J&amp;T starting rates. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" disabled={pending} onClick={reset}>Reset</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
