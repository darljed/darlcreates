"use client";

/**
 * Admin: the shop's colour inventory. The owner lists the filament colours in stock (a swatch and a name each). Once saved,
 * these are the only colours offered anywhere: the clicker designer, colour options on products and name colours.
 * Until the first save nothing is filtered (so existing products keep working).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shell/ui";
import { colorName } from "@/lib/color-name";
import { MAX_INVENTORY_COLOURS, type ColourInventory } from "@/lib/colour-inventory-schema";
import { resetColourInventoryAction, saveColourInventoryAction } from "@/app/(admin)/admin/colours/actions";

export function ColourInventoryEditor({ initial, configured }: { initial: ColourInventory; configured: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [rows, setRows] = useState(initial.colours);
  const [isSet, setIsSet] = useState(configured);

  const dup = new Set(rows.map((r) => r.hex).filter((h, i, all) => all.indexOf(h) !== i));
  const patch = (i: number, p: Partial<(typeof rows)[number]>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...p } : x)));

  function add() {
    // start from a colour that is not in the list yet
    const hex = ["#ffffff", "#ef4444", "#22c55e", "#2563eb", "#facc15", "#8b5cf6", "#f97316", "#14b8a6"].find((h) => !rows.some((r) => r.hex === h)) ?? "#808080";
    setRows((r) => [...r, { hex, name: colorName(hex) }]);
  }

  function save() {
    start(async () => {
      const res = await saveColourInventoryAction({ colours: rows });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setIsSet(true);
      toast.success(res.hidden ? `Saved. ${res.hidden} colour choice${res.hidden === 1 ? "" : "s"} on products ${res.hidden === 1 ? "is" : "are"} not in stock and no longer offered.` : "Colours saved");
      router.refresh();
    });
  }

  function reset() {
    if (!window.confirm("Stop limiting colours? Every colour already on your products is offered again.")) return;
    start(async () => {
      const res = await resetColourInventoryAction();
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setIsSet(false);
      toast.success("Colours are no longer limited");
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      {!isSet && (
        <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/30 dark:text-amber-200">
          Colours are not limited yet: customers can pick any colour your products have. Review this list, then save to make it your stock.
        </p>
      )}
      <Panel title="Colours in stock" description={`Between 2 and ${MAX_INVENTORY_COLOURS}. Customers only see these. A colour on a product that is not here is hidden until you add it back.`}>
        <ul className="space-y-2">
          {rows.map((r, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={r.hex}
                onChange={(e) => patch(i, { hex: e.target.value.toLowerCase() })}
                aria-label={`Colour ${i + 1}`}
                className="h-9 w-12 shrink-0 cursor-pointer rounded-md border bg-transparent p-0.5"
              />
              <Input value={r.name} maxLength={40} onChange={(e) => patch(i, { name: e.target.value })} aria-label={`Name of colour ${i + 1}`} className="max-w-56" />
              <code className="hidden text-xs text-muted-foreground sm:inline">{r.hex}</code>
              {dup.has(r.hex) && <span className="text-xs font-medium text-destructive">Already in the list</span>}
              <Button type="button" variant="ghost" size="icon" className="ml-auto" disabled={rows.length <= 2} onClick={() => setRows((x) => x.filter((_, k) => k !== i))} aria-label={`Remove ${r.name || `colour ${i + 1}`}`}>
                <Trash2 className="size-4" />
              </Button>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" disabled={rows.length >= MAX_INVENTORY_COLOURS} onClick={add}>
            <Plus className="mr-1 size-4" /> Add a colour
          </Button>
          <div className="ml-auto flex gap-2">
            {isSet && (
              <Button type="button" variant="ghost" disabled={pending} onClick={reset}>
                Stop limiting colours
              </Button>
            )}
            <Button type="button" disabled={pending || dup.size > 0} onClick={save}>
              {pending && <Loader2 className="mr-2 size-4 animate-spin" />} Save colours
            </Button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
