"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2, Loader2 } from "lucide-react";
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
import {
  addOptionAction,
  addOptionValueAction,
  deleteOptionAction,
} from "@/app/(admin)/admin/products/actions";

export function SchemaBuilder({
  productId,
  options,
}: {
  productId: string;
  options: ProductOptionInput[];
}) {
  const router = useRouter();
  const uid = useId();
  const [pending, startTransition] = useTransition();

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
      <div className="space-y-4">
        {options.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No customization options yet. Add one below.
          </p>
        )}
        {options.map((opt) => (
          <div key={opt.id} className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-bold">
                  {opt.label}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    ({opt.type}
                    {opt.required ? ", required" : ""}
                    {opt.priceDeltaCents > 0
                      ? `, +${formatPHP(opt.priceDeltaCents)}`
                      : ""}
                    )
                  </span>
                </p>
                {opt.type === "text" && (
                  <p className="text-xs text-muted-foreground">
                    max {opt.constraints.maxLen ?? 50} chars
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive"
                disabled={pending}
                onClick={() => removeOption(opt.id)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>

            {(opt.type === "color" || opt.type === "size") && (
              <ValueEditor
                productId={productId}
                optionId={opt.id}
                type={opt.type}
                values={opt.values}
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
}: {
  productId: string;
  optionId: string;
  type: "color" | "size";
  values: ProductOptionInput["values"];
}) {
  const router = useRouter();
  const vid = useId();
  const [pending, startTransition] = useTransition();
  const [label, setLabel] = useState("");
  const [value, setValue] = useState(type === "color" ? "#0077a5" : "");
  const [priceDelta, setPriceDelta] = useState("0");

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
          <span
            key={v.id}
            className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
          >
            {type === "color" && (
              <span
                className="size-3 rounded-full border"
                style={{ backgroundColor: v.value }}
              />
            )}
            {v.label}
            {v.priceDeltaCents > 0 && ` (+${formatPHP(v.priceDeltaCents)})`}
          </span>
        ))}
      </div>
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
            {type === "color" ? "Hex" : "Code"}
          </Label>
          <Input
            id={`${vid}-value`}
            className="h-8 w-28"
            type={type === "color" ? "color" : "text"}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
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
