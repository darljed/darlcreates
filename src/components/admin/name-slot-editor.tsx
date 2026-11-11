"use client";

/**
 * Admin: choose where the customer's name goes on the product's 3D model. Click the surface to place it, then set the
 * letter height, the widest the name may be, how far it stands out, the font and its rotation. A sample name is drawn
 * live with the same code the customer's preview and the print file use. Saves into the text option's `slot`.
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw, RotateCw } from "lucide-react";
import { Vector3 } from "three";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shell/ui";
import { Field } from "@/components/admin/editor-bits";
import { StlViewer } from "@/components/three/stl-viewer-lazy";
import type { PickHit } from "@/components/three/stl-viewer";
import { useNameBuild } from "@/components/use-name-build";
import { DEFAULT_SLOT_SIZES, NAME_FONTS, NAME_FONT_IDS, slotOf, type NameFontId, type NameSlot } from "@/lib/name-mesh";
import { saveNameSlotAction } from "@/app/(admin)/admin/products/actions";

export type NameSlotOption = { id: string; label: string; constraints: { slot?: unknown } };

/** "Up" for the letters on a freshly clicked surface: model Z on walls, model Y on a top/bottom face. */
function defaultUp(normal: [number, number, number]): [number, number, number] {
  return Math.abs(normal[2]) < 0.7 ? [0, 0, 1] : [0, 1, 0];
}

function rotateUp(slot: NameSlot, degrees: number): [number, number, number] {
  const v = new Vector3(...slot.up).applyAxisAngle(new Vector3(...slot.normal).normalize(), (degrees * Math.PI) / 180).normalize();
  return [v.x, v.y, v.z];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

export function NameSlotEditor({ productId, modelUrl, options }: { productId: string; modelUrl: string; options: NameSlotOption[] }) {
  const router = useRouter();
  const [optionId, setOptionId] = useState(options.find((o) => slotOf(o.constraints))?.id ?? options[0]?.id ?? "");
  const [slots, setSlots] = useState<Record<string, NameSlot | null>>(() => Object.fromEntries(options.map((o) => [o.id, slotOf(o.constraints)])));
  const [sample, setSample] = useState("Ana");
  const [pending, start] = useTransition();
  const slot = slots[optionId] ?? null;
  const setSlot = (s: NameSlot | null) => setSlots((p) => ({ ...p, [optionId]: s }));
  const build = useNameBuild(slot, sample);
  const dirty = useMemo(() => JSON.stringify(slot) !== JSON.stringify(slotOf(options.find((o) => o.id === optionId)?.constraints)), [slot, options, optionId]);

  function onPick(hit: PickHit) {
    const n = new Vector3(...hit.normal).normalize();
    const normal: [number, number, number] = [round(n.x), round(n.y), round(n.z)];
    // keep the admin's rotation while it still lies along the new surface, otherwise stand the letters upright again
    const keepUp = slot && Math.abs(new Vector3(...slot.up).dot(n)) < 0.9;
    setSlot({
      ...(slot ?? DEFAULT_SLOT_SIZES),
      position: [round(hit.position[0]), round(hit.position[1]), round(hit.position[2])],
      normal,
      up: keepUp ? slot.up : defaultUp(normal),
    });
  }

  function save(next: NameSlot | null) {
    start(async () => {
      const res = await saveNameSlotAction({ productId, optionId, slot: next });
      if (res.ok) {
        toast.success(next ? "Name position saved" : "Name removed from the model");
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const num = (key: "height" | "maxWidth" | "depth" | "sink", label: string, step: number, hint: string) => (
    <Field label={label} hint={hint}>
      <Input
        type="number"
        step={step}
        value={slot?.[key] ?? ""}
        disabled={!slot}
        onChange={(e) => slot && setSlot({ ...slot, [key]: Number(e.target.value) })}
      />
    </Field>
  );

  return (
    <Panel
      title="Name on the model"
      description="Customers type a name and see it on the 3D model; the print file is built with it. Click the model where the name should go."
    >
      {options.length > 1 && (
        <Field label="Text option">
          <select className="h-8 w-full rounded-md border bg-background px-2 text-sm" value={optionId} onChange={(e) => setOptionId(e.target.value)}>
            {options.map((o) => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
        </Field>
      )}
      <div className="mt-3 grid gap-4 md:grid-cols-[1fr_260px]">
        <div className="aspect-square overflow-hidden rounded-lg border-2 bg-card md:aspect-[4/3]">
          <StlViewer url={modelUrl} className="size-full" overlay={build?.ok ? build.geometry : null} onPick={onPick} />
        </div>
        <div className="space-y-3">
          <Field label="Sample name" hint="to preview">
            <Input value={sample} maxLength={20} onChange={(e) => setSample(e.target.value)} />
          </Field>
          <Field label="Font">
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
              disabled={!slot}
              value={slot?.font ?? "bold"}
              onChange={(e) => slot && setSlot({ ...slot, font: e.target.value as NameFontId })}
            >
              {NAME_FONT_IDS.map((id) => (
                <option key={id} value={id}>{NAME_FONTS[id].label}</option>
              ))}
            </select>
          </Field>
          <div className="grid grid-cols-2 gap-2">
            {num("height", "Letter height", 0.5, "mm")}
            {num("maxWidth", "Widest name", 1, "mm")}
            {num("depth", "Stands out", 0.1, "mm")}
            {num("sink", "Sunk in", 0.1, "mm")}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium">Rotate</span>
            <Button type="button" size="icon" variant="outline" disabled={!slot} aria-label="Rotate the name 15 degrees left" onClick={() => slot && setSlot({ ...slot, up: rotateUp(slot, 15) })}>
              <RotateCcw className="size-4" />
            </Button>
            <Button type="button" size="icon" variant="outline" disabled={!slot} aria-label="Rotate the name 15 degrees right" onClick={() => slot && setSlot({ ...slot, up: rotateUp(slot, -15) })}>
              <RotateCw className="size-4" />
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={!slot} onClick={() => slot && setSlot({ ...slot, up: rotateUp(slot, 90) })}>
              90°
            </Button>
          </div>
          <p className={`min-h-8 text-xs ${build && !build.ok ? "text-destructive" : "text-muted-foreground"}`} role={build && !build.ok ? "alert" : undefined}>
            {!slot
              ? "No position yet. Click the model."
              : build?.ok
                ? `"${sample}" is ${build.widthMm.toFixed(1)} × ${build.heightMm.toFixed(1)} mm, thinnest stroke ${build.stemMm.toFixed(2)} mm${build.stemMm < 1 ? " (thin: bigger letters print better)" : ""}.`
                : (build?.error ?? "")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={!slot || !dirty || pending} onClick={() => save(slot)}>
              {pending && <Loader2 className="mr-1 size-4 animate-spin" />} Save position
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending || !slotOf(options.find((o) => o.id === optionId)?.constraints)} onClick={() => { setSlot(null); save(null); }}>
              Remove
            </Button>
          </div>
        </div>
      </div>
    </Panel>
  );
}
