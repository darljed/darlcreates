"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DEFAULT_SETTINGS, machineHourRate, type Settings } from "@/lib/workshop/pricing";
import { TIER_LABELS } from "@/lib/workshop/presets";
import { peso, selectClass } from "./estimator-helpers";

/**
 * The estimator's settings in a side sheet: printer and electricity (machine hour rate), labour, failure allowance, queue
 * premium, the three tier margins and the price rounding step. The parent keeps them in localStorage.
 */

function NumberRow({ id, text, value, onChange, step = "1", suffix }: { id: string; text: string; value: number; onChange: (n: number) => void; step?: string; suffix?: string }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {text}
      </Label>
      <div className="flex items-center gap-2">
        <Input id={id} type="number" inputMode="decimal" step={step} value={Number.isFinite(value) ? value : 0} onChange={(e) => onChange(Number(e.target.value))} />
        {suffix && <span className="text-xs whitespace-nowrap text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

export function SettingsPanel({ settings, onChange, open, onClose }: { settings: Settings; onChange: (s: Settings) => void; open: boolean; onClose: () => void }) {
  const s = settings;
  const set = (patch: Partial<Settings>) => onChange({ ...s, ...patch });
  const setMargin = (i: number, pct: number) => {
    const margins: [number, number, number] = [s.margins[0], s.margins[1], s.margins[2]];
    margins[i] = pct / 100;
    set({ margins });
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Estimator settings</SheetTitle>
          <SheetDescription>
            Machine time is billed at <strong className="text-foreground">{peso(machineHourRate(s))}/hr</strong> (depreciation + maintenance + electricity{s.queuePremiumPerHr > 0 ? " + queue premium" : ""}). Saved in this browser.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 p-4">
          <div className="grid grid-cols-2 gap-3">
            <NumberRow id="est-elec" text="Electricity rate" value={s.electricityRate} onChange={(n) => set({ electricityRate: n })} step="0.01" suffix="₱/kWh" />
            <NumberRow id="est-watts" text="Printer power draw" value={s.powerWatts} onChange={(n) => set({ powerWatts: n })} suffix="W" />
            <NumberRow id="est-price" text="Printer price" value={s.printerPrice} onChange={(n) => set({ printerPrice: n })} suffix="₱" />
            <NumberRow id="est-life" text="Printer lifetime" value={s.printerLifetimeHours} onChange={(n) => set({ printerLifetimeHours: n })} suffix="hrs" />
            <NumberRow id="est-maint" text="Maintenance" value={s.maintenancePerHr} onChange={(n) => set({ maintenancePerHr: n })} step="0.01" suffix="₱/hr" />
            <NumberRow id="est-labor" text="Labour rate" value={s.laborRate} onChange={(n) => set({ laborRate: n })} suffix="₱/hr" />
            <NumberRow id="est-fail" text="Failure allowance" value={s.failurePct} onChange={(n) => set({ failurePct: n })} step="0.5" suffix="%" />
            <NumberRow id="est-queue" text="Queue premium" value={s.queuePremiumPerHr} onChange={(n) => set({ queuePremiumPerHr: n })} step="0.5" suffix="₱/hr" />
          </div>

          <div>
            <h3 className="mb-1 text-sm font-semibold">Pricing margins</h3>
            <p className="mb-2 text-xs text-muted-foreground">The share of the selling price that is profit (margin, not markup).</p>
            <div className="grid grid-cols-3 gap-3">
              {TIER_LABELS.map((t, i) => (
                <NumberRow key={t} id={`est-margin-${i}`} text={t} value={Math.round(s.margins[i] * 100)} onChange={(n) => setMargin(i, n)} suffix="%" />
              ))}
            </div>
          </div>

          <div className="grid gap-1.5">
            <Label htmlFor="est-rounding" className="text-xs">
              Price rounding
            </Label>
            <select id="est-rounding" className={selectClass} value={String(s.roundingStep)} onChange={(e) => set({ roundingStep: Number(e.target.value) })}>
              <option value="1">Up to the nearest ₱1</option>
              <option value="5">Up to the nearest ₱5</option>
              <option value="10">Up to the nearest ₱10</option>
            </select>
            <span className="text-xs text-muted-foreground">Final tier prices round up to this step.</span>
          </div>
        </div>

        <SheetFooter className="border-t">
          <Button variant="outline" onClick={() => onChange({ ...DEFAULT_SETTINGS, margins: [...DEFAULT_SETTINGS.margins] })}>
            Reset to defaults
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
