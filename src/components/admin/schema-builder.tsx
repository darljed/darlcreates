"use client";

/**
 * Customization builder: add, edit or delete options (color, size, text, image) and their values with price changes.
 * Options found automatically from the 3D model (and every colour of the shop's list) are edited the same way.
 */

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Pencil, Check, X, Wand2, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatPHP } from "@/lib/money";
import type { ProductOptionInput } from "@/lib/pricing";
import { DEFAULT_INVENTORY, inStock, type ColourInventory } from "@/lib/colour-inventory-schema";
import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { centavosToPesos } from "@/lib/money";
import {
  addAllColoursAction,
  addOptionAction,
  addOptionValueAction,
  deleteOptionAction,
  deleteOptionValuesAction,
  redetectCustomizationsAction,
  updateOptionAction,
  updateOptionValueAction,
} from "@/app/(admin)/admin/products/actions";

export function SchemaBuilder({
  productId,
  options,
  inventory,
  canDetect,
}: {
  productId: string;
  options: ProductOptionInput[];
  inventory: ColourInventory | null;
  /** the product has a 3MF model that auto-detect can read */
  canDetect: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();
  const [confirmDetect, setConfirmDetect] = useState(false);
  const [detectError, setDetectError] = useState<string | null>(null);

  function detect() {
    startTransition(async () => {
      const res = await redetectCustomizationsAction({ productId });
      if (!res.ok) {
        setDetectError(res.error);
        return;
      }
      setConfirmDetect(false);
      const c = res.auto?.colours;
      toast.success(c?.added.length ? `Found ${c.parts.length || 1} colour option${(c.parts.length || 1) === 1 ? "" : "s"}, ${c.added.length} colours each. Edit or delete what you do not want.` : "Nothing to detect in this model.");
      for (const n of res.auto?.notes ?? []) toast.message(n);
      router.refresh();
    });
  }

  // New-option form
  const [type, setType] = useState<"color" | "text" | "size" | "image">("color");
  const [label, setLabel] = useState("");
  const [required, setRequired] = useState(true);
  const [priceDelta, setPriceDelta] = useState("0");
  const [maxLen, setMaxLen] = useState("12");

  function addOption() {
    if (!label.trim()) {
      toast.error("Option label required");
      return;
    }
    startTransition(async () => {
      const res = await addOptionAction({
        productId,
        type,
        label,
        required,
        priceDelta,
        maxLen: type === "text" ? Number(maxLen) : undefined,
        pattern: type === "text" ? "^[A-Za-z0-9 ]*$" : undefined,
      });
      if (res.ok) {
        toast.success("Option added");
        setLabel("");
        router.refresh();
      } else toast.error(res.error ?? "Failed");
    });
  }

  function removeOption(optionId: string) {
    startTransition(async () => {
      const res = await deleteOptionAction({ optionId, productId });
      if (res.ok) {
        toast.success("Option removed");
        router.refresh();
      } else toast.error(res.error ?? "Failed");
    });
  }

  return (
    <div className="space-y-6">
      {canDetect && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed p-3">
          <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => { setDetectError(null); setConfirmDetect(true); }}>
            <Wand2 className="mr-1 size-4" /> Auto-detect from 3D model
          </Button>
          <p className="text-xs text-muted-foreground">Finds the parts that can be coloured and offers every colour of your Colours list on each. Everything it adds can be renamed or deleted below.</p>
        </div>
      )}
      <ConfirmDialog
        open={confirmDetect}
        onOpenChange={setConfirmDetect}
        title="Auto-detect customizations?"
        description="This reads the 3D model again and replaces this product's colour options (including any edits you made to them). Text and size options stay."
        confirmLabel="Detect"
        busy={pending}
        error={detectError}
        onConfirm={detect}
      />
      <div className="space-y-4">
        {options.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No customization options yet. Add one below.
          </p>
        )}
        {options.map((opt) => (
          <div key={opt.id} className="rounded-lg border bg-card p-4">
            <OptionHeader opt={opt} pending={pending} onRemove={() => removeOption(opt.id)} />

            {(opt.type === "color" || opt.type === "size") && (
              <ValueEditor
                productId={productId}
                optionId={opt.id}
                type={opt.type}
                values={opt.values}
                inventory={inventory}
              />
            )}
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-dashed border-border p-4">
        <h3 className="mb-3 font-bold">Add option</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-type`}>Type</Label>
            <Select value={type} onValueChange={(t) => setType(t as typeof type)}>
              <SelectTrigger id={`${uid}-type`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="color">Color (swatches)</SelectItem>
                <SelectItem value="size">Size (choices)</SelectItem>
                <SelectItem value="text">Text input</SelectItem>
                <SelectItem value="image">Image upload</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-label`}>Label</Label>
            <Input
              id={`${uid}-label`}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Color"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${uid}-delta`}>Price delta (₱)</Label>
            <Input
              id={`${uid}-delta`}
              inputMode="decimal"
              value={priceDelta}
              onChange={(e) => setPriceDelta(e.target.value)}
            />
          </div>
          {type === "text" && (
            <div className="space-y-1.5">
              <Label htmlFor={`${uid}-maxlen`}>Max length</Label>
              <Input
                id={`${uid}-maxlen`}
                inputMode="numeric"
                value={maxLen}
                onChange={(e) => setMaxLen(e.target.value)}
              />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
            />
            Required
          </label>
        </div>
        <Button
          onClick={addOption}
          disabled={pending}
          className="mt-3 bg-primary text-primary-foreground"
        >
          {pending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Plus className="mr-1 size-4" />
          )}
          Add option
        </Button>
      </div>
    </div>
  );
}

function ValueEditor({
  productId,
  optionId,
  type,
  values,
  inventory,
}: {
  productId: string;
  optionId: string;
  type: "color" | "size";
  values: ProductOptionInput["values"];
  inventory: ColourInventory | null;
}) {
  const router = useRouter();
  const vid = useId();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [value, setValue] = useState(type === "color" ? (inventory?.colours[0]?.hex ?? "#0077a5") : "");
  const [priceDelta, setPriceDelta] = useState("0");
  const missing = type === "color" ? (inventory ?? DEFAULT_INVENTORY).colours.filter((c) => !values.some((v) => v.value.toLowerCase() === c.hex.toLowerCase())).length : 0;

  function addAll() {
    startTransition(async () => {
      const res = await addAllColoursAction({ optionId });
      if (res.ok) {
        toast.success(res.id === "0" ? "Every colour is already here" : `${res.id} colours added`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  function add() {
    if (!label.trim() || !value.trim()) {
      toast.error("Label and value required");
      return;
    }
    startTransition(async () => {
      const res = await addOptionValueAction({
        optionId,
        productId,
        label,
        value,
        priceDelta,
      });
      if (res.ok) {
        setLabel("");
        router.refresh();
      } else toast.error(res.error ?? "Failed");
    });
  }

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex flex-wrap gap-2">
        {values.map((v) => (
          <ValueChip key={v.id} v={v} type={type} inventory={inventory} />
        ))}
      </div>
      {type === "color" && (
        <Button type="button" size="sm" variant="outline" className="mt-2" disabled={pending} onClick={addAll}>
          <Palette className="mr-1 size-4" /> {missing > 0 ? `Add all colours (${missing} more)` : "All colours added"}
        </Button>
      )}
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${vid}-label`} className="text-xs">Label</Label>
          <Input
            id={`${vid}-label`}
            className="h-8 w-28"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={type === "color" ? "Hot Pink" : "Large"}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${vid}-value`} className="text-xs">
            {type === "color" ? (inventory ? "Colour" : "Hex") : "Code"}
          </Label>
          {type === "color" && inventory ? (
            <select
              id={`${vid}-value`}
              className="h-8 w-36 rounded-md border bg-background px-2 text-sm"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (!label.trim()) setLabel(inventory.colours.find((c) => c.hex === e.target.value)?.name ?? "");
              }}
            >
              {inventory.colours.map((c) => (
                <option key={c.hex} value={c.hex}>
                  {c.name}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id={`${vid}-value`}
              className="h-8 w-28"
              type={type === "color" ? "color" : "text"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${vid}-delta`} className="text-xs">+₱</Label>
          <Input
            id={`${vid}-delta`}
            className="h-8 w-20"
            inputMode="decimal"
            value={priceDelta}
            onChange={(e) => setPriceDelta(e.target.value)}
          />
        </div>
        <Button size="sm" variant="outline" onClick={add} disabled={pending}>
          <Plus className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** The header of an option: its label, required flag and price, with a pencil to edit them in place. */
function OptionHeader({ opt, pending, onRemove }: { opt: ProductOptionInput; pending: boolean; onRemove: () => void }) {
  const router = useRouter();
  const id = useId();
  const [saving, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(opt.label);
  const [required, setRequired] = useState(opt.required);
  const [price, setPrice] = useState(String(centavosToPesos(opt.priceDeltaCents)));
  const [maxLen, setMaxLen] = useState(String(opt.constraints.maxLen ?? 50));

  function save() {
    start(async () => {
      const res = await updateOptionAction({ optionId: opt.id, label, required, priceDelta: price, maxLen: opt.type === "text" ? Number(maxLen) : undefined });
      if (res.ok) {
        toast.success("Option saved");
        setEditing(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${id}-l`} className="text-xs">Label</Label>
          <Input id={`${id}-l`} className="h-8 w-44" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} autoFocus />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-p`} className="text-xs">+₱</Label>
          <Input id={`${id}-p`} className="h-8 w-20" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        {opt.type === "text" && (
          <div className="space-y-1">
            <Label htmlFor={`${id}-m`} className="text-xs">Max length</Label>
            <Input id={`${id}-m`} className="h-8 w-20" inputMode="numeric" value={maxLen} onChange={(e) => setMaxLen(e.target.value)} />
          </div>
        )}
        <label className="flex items-center gap-1.5 pb-1.5 text-xs">
          <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} /> Required
        </label>
        <Button type="button" size="icon" variant="outline" className="size-8" aria-label="Save option" disabled={saving || !label.trim()} onClick={save}>
          {saving ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
        </Button>
        <Button type="button" size="icon" variant="ghost" className="size-8" aria-label="Cancel" disabled={saving} onClick={() => setEditing(false)}>
          <X className="size-4" />
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-start justify-between">
      <div>
        <p className="font-bold">
          {opt.label}{" "}
          <span className="text-xs font-normal text-muted-foreground">
            ({opt.type}
            {opt.required ? ", required" : ""}
            {opt.priceDeltaCents > 0 ? `, +${formatPHP(opt.priceDeltaCents)}` : ""})
          </span>
        </p>
        {opt.type === "text" && <p className="text-xs text-muted-foreground">max {opt.constraints.maxLen ?? 50} chars</p>}
      </div>
      <div className="flex">
        <Button variant="ghost" size="sm" disabled={pending} aria-label={`Edit ${opt.label}`} onClick={() => setEditing(true)}>
          <Pencil className="size-4" />
        </Button>
        <Button variant="ghost" size="sm" className="text-destructive" disabled={pending} aria-label={`Delete ${opt.label}`} onClick={onRemove}>
          <Trash2 className="size-4" />
        </Button>
      </div>
    </div>
  );
}

/** One choice (a colour swatch or a size): rename it, change its price, or delete it. */
function ValueChip({ v, type, inventory }: { v: ProductOptionInput["values"][number]; type: "color" | "size"; inventory: ColourInventory | null }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(v.label);
  const [price, setPrice] = useState(String(centavosToPesos(v.priceDeltaCents)));

  function save() {
    start(async () => {
      const res = await updateOptionValueAction({ valueId: v.id, label, priceDelta: price });
      if (res.ok) {
        setEditing(false);
        router.refresh();
      } else toast.error(res.error);
    });
  }
  function remove() {
    start(async () => {
      const res = await deleteOptionValuesAction({ valueIds: [v.id] });
      if (res.ok) router.refresh();
      else toast.error(res.error);
    });
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
        {type === "color" && <span className="size-3 rounded-full border" style={{ backgroundColor: v.value }} />}
        <Input aria-label="Choice label" className="h-6 w-28 px-1 text-xs" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} autoFocus />
        <Input aria-label="Extra price (₱)" className="h-6 w-14 px-1 text-xs" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
        <button type="button" aria-label="Save choice" className="text-primary disabled:opacity-50" disabled={pending || !label.trim()} onClick={save}><Check className="size-3.5" /></button>
        <button type="button" aria-label="Cancel" className="text-muted-foreground" disabled={pending} onClick={() => setEditing(false)}><X className="size-3.5" /></button>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs">
      {type === "color" && <span className="size-3 rounded-full border" style={{ backgroundColor: v.value }} />}
      {v.label}
      {v.priceDeltaCents > 0 && ` (+${formatPHP(v.priceDeltaCents)})`}
      {type === "color" && !inStock(inventory, v.value) && <span className="rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900" title="This colour is not in your Colours list, so customers do not see it.">hidden</span>}
      <button type="button" aria-label={`Edit ${v.label}`} className="text-muted-foreground hover:text-foreground" disabled={pending} onClick={() => setEditing(true)}><Pencil className="size-3" /></button>
      <button type="button" aria-label={`Delete ${v.label}`} className="text-muted-foreground hover:text-destructive" disabled={pending} onClick={remove}><X className="size-3.5" /></button>
    </span>
  );
}
