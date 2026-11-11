"use client";

/**
 * Admin: choose where the customer's name goes on the product's 3D model. Click the surface to place it, then set the
 * letter height, the widest and tallest the name may be, how far it stands out, the font(s), the name colour(s) and its
 * rotation. A sample name is drawn live with the same code the customer's preview and the print file use. Saves into the
 * text option's `slot`.
 *
 * Sizes cannot overflow the model: after every click or rotation the server measures how much room there is at that
 * spot (name-space.ts) and the width / height inputs are limited to it. Saving checks again.
 */
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Plus, RotateCcw, RotateCw, Trash2 } from "lucide-react";
import { Vector3 } from "three";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shell/ui";
import { Check, Field } from "@/components/admin/editor-bits";
import { StlViewer } from "@/components/three/stl-viewer-lazy";
import type { PickHit } from "@/components/three/stl-viewer";
import { useNameBuild } from "@/components/use-name-build";
import {
  clampToSpace, DEFAULT_SLOT_SIZES, fontChoices, maxHeightFor, maxWidthFor, NAME_FONTS, NAME_FONT_IDS, slotMaxHeight, slotOf, spaceLimits,
  type NameFontId, type NameSlot, type SpaceTable,
} from "@/lib/name-mesh";
import { measureNameSpaceAction, measureWallAction, saveNameSlotAction } from "@/app/(admin)/admin/products/actions";

export type NameSlotOption = { id: string; label: string; constraints: { slot?: unknown } };
/** The product's colour swatches, offered as quick additions to the name colours. */
export type ColorSwatch = { label: string; hex: string };

/** "Up" for the letters on a freshly clicked surface: model Z on walls, model Y on a top/bottom face. */
function defaultUp(normal: [number, number, number]): [number, number, number] {
  return Math.abs(normal[2]) < 0.7 ? [0, 0, 1] : [0, 1, 0];
}

function rotateUp(slot: NameSlot, degrees: number): [number, number, number] {
  const v = new Vector3(...slot.up).applyAxisAngle(new Vector3(...slot.normal).normalize(), (degrees * Math.PI) / 180).normalize();
  return [v.x, v.y, v.z];
}

const round = (n: number) => Math.round(n * 1000) / 1000;

/** Wall the slicer needs left behind an engraving (mm); the same number as MIN_WALL_BEHIND_MM in name-3mf.ts (server only). */
const WALL_BEHIND_MM = 0.8;
/** Colour of an engraved name in the preview: a dark cut, not a filament. */
const ENGRAVED_PREVIEW = "#1f2937";

export function NameSlotEditor({ productId, modelUrl, options, colors = [], canEngrave = false }: { productId: string; modelUrl: string; options: NameSlotOption[]; colors?: ColorSwatch[]; canEngrave?: boolean }) {
  const router = useRouter();
  const [optionId, setOptionId] = useState(options.find((o) => slotOf(o.constraints))?.id ?? options[0]?.id ?? "");
  const [slots, setSlots] = useState<Record<string, NameSlot | null>>(() => Object.fromEntries(options.map((o) => [o.id, slotOf(o.constraints)])));
  const [sample, setSample] = useState("Ana");
  const [pending, start] = useTransition();
  const slot = slots[optionId] ?? null;
  const setSlot = (s: NameSlot | null) => setSlots((p) => ({ ...p, [optionId]: s }));
  const [previewHex, setPreviewHex] = useState<string | null>(null);
  const build = useNameBuild(slot, sample);

  // --- room at this spot -----------------------------------------------------------------------------------------
  const spotKey = slot ? JSON.stringify([slot.position, slot.normal, slot.up]) : "";
  const [space, setSpace] = useState<{ key: string; table: SpaceTable } | null>(null);
  const [spaceError, setSpaceError] = useState<string | null>(null);
  const request = useRef(0);
  const table = space && space.key === spotKey ? space.table : null;
  const measuring = Boolean(slot) && !table && !spaceError;
  const limits = table ? spaceLimits(table) : null;
  const noRoom = Boolean(limits && limits.maxWidth <= 0);

  useEffect(() => {
    if (!spotKey) return;
    const mine = ++request.current;
    const [position, normal, up] = JSON.parse(spotKey) as [NameSlot["position"], NameSlot["normal"], NameSlot["up"]];
    const timer = setTimeout(async () => {
      const res = await measureNameSpaceAction({ productId, position, normal, up });
      if (mine !== request.current) return; // a newer click or rotation superseded this one
      if (!res.ok) {
        setSpaceError(res.error);
        return;
      }
      setSpaceError(null);
      setSpace({ key: spotKey, table: res.table });
      // bring the current sizes inside the room that was just measured
      setSlots((prev) => {
        const cur = prev[optionId];
        if (!cur || JSON.stringify([cur.position, cur.normal, cur.up]) !== spotKey) return prev;
        const fit = clampToSpace(res.table, { width: cur.maxWidth, height: slotMaxHeight(cur) }, "width");
        if (fit.width <= 0 || (fit.width === cur.maxWidth && fit.height === slotMaxHeight(cur))) return prev;
        toast.info(`Name area reduced to ${fit.width} × ${fit.height} mm to fit here.`);
        return { ...prev, [optionId]: { ...cur, maxWidth: fit.width, maxHeight: fit.height, height: Math.min(cur.height, fit.height) } };
      });
    }, 250);
    return () => clearTimeout(timer);
  }, [spotKey, productId, optionId]);

  // --- engraving: how thick the wall is behind the name ----------------------------------------------------------
  const engraved = slot?.mode === "engraved";
  const wallKey = slot && engraved ? JSON.stringify([slot.position, slot.normal, slot.up, slot.maxWidth, slotMaxHeight(slot)]) : "";
  const [wall, setWall] = useState<{ key: string; mm: number | null } | null>(null);
  const wallMm = wall && wall.key === wallKey ? wall.mm : undefined; // undefined = not measured yet
  useEffect(() => {
    if (!wallKey || !slot) return;
    let live = true;
    const probe = slot;
    const timer = setTimeout(async () => {
      const res = await measureWallAction({ productId, slot: probe });
      if (live && res.ok) setWall({ key: wallKey, mm: res.wallMm });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- wallKey already encodes everything the measurement depends on
  }, [wallKey, productId]);
  const maxDepth = wallMm ? Math.max(0.6, Math.floor((wallMm - WALL_BEHIND_MM) * 10) / 10) : undefined;
  const tooDeep = Boolean(engraved && slot && wallMm && slot.depth + WALL_BEHIND_MM > wallMm + 1e-9);
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

  /** Tick or untick a font customers may choose. The default font always stays; one font alone means no picker. */
  function toggleFont(id: NameFontId, on: boolean) {
    if (!slot || id === slot.font) return;
    const set = new Set(fontChoices(slot));
    if (on) set.add(id);
    else set.delete(id);
    const { fonts: _old, ...rest } = slot;
    void _old;
    setSlot(set.size > 1 ? { ...rest, fonts: NAME_FONT_IDS.filter((f) => set.has(f)) } : rest);
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

  /** Set one size, then pull the others back inside the room at this spot. */
  function setSize(key: "height" | "maxWidth" | "maxHeight" | "depth" | "sink", raw: number) {
    if (!slot || !Number.isFinite(raw)) return;
    if (!table || key === "depth" || key === "sink") {
      setSlot({ ...slot, [key]: raw });
      return;
    }
    if (key === "maxWidth") {
      const fit = clampToSpace(table, { width: raw, height: slotMaxHeight(slot) }, "width");
      setSlot({ ...slot, maxWidth: fit.width, maxHeight: fit.height, height: Math.min(slot.height, fit.height) });
    } else if (key === "maxHeight") {
      const fit = clampToSpace(table, { width: slot.maxWidth, height: raw }, "height");
      setSlot({ ...slot, maxWidth: fit.width, maxHeight: fit.height, height: Math.min(slot.height, fit.height) });
    } else {
      setSlot({ ...slot, height: Math.min(raw, slotMaxHeight(slot)) }); // capital letters cannot be taller than the area
    }
  }

  const maxOf = (key: "height" | "maxWidth" | "maxHeight" | "depth" | "sink"): number | undefined => {
    if (!slot || !table) return undefined;
    if (key === "maxWidth") return maxWidthFor(table, slotMaxHeight(slot));
    if (key === "maxHeight") return maxHeightFor(table, slot.maxWidth);
    if (key === "height") return slotMaxHeight(slot);
    if (key === "depth" && engraved) return maxDepth;
    return undefined;
  };

  const num = (key: "height" | "maxWidth" | "maxHeight" | "depth" | "sink", label: string, step: number, hint: string) => {
    const max = maxOf(key);
    return (
      <Field label={key === "depth" && engraved ? "Cut depth" : label} hint={max !== undefined ? `max ${max} mm here` : hint}>
        <Input
          type="number"
          step={step}
          max={max}
          value={slot ? (key === "maxHeight" ? slotMaxHeight(slot) : slot[key]) : ""}
          disabled={!slot || measuring || noRoom}
          onChange={(e) => setSize(key, Number(e.target.value))}
        />
      </Field>
    );
  };

  // --- name colours the customer can choose ----------------------------------------------------------------------
  const HEX = /^#[0-9a-fA-F]{6}$/;
  const nameColors = slot?.nameColors ?? [];
  function setNameColors(next: NonNullable<NameSlot["nameColors"]>) {
    if (!slot) return;
    const { nameColors: _old, ...rest } = slot;
    void _old;
    setSlot(next.length ? { ...rest, nameColors: next } : rest);
  }
  const previewColor = previewHex ?? slot?.nameColor?.hex;

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
          <StlViewer url={modelUrl} className="size-full" overlay={build?.ok ? build.geometry : null} overlayColor={engraved ? ENGRAVED_PREVIEW : previewColor} onPick={onPick} />
        </div>
        <div className="space-y-3">
          <Field label="Sample name" hint="to preview">
            <Input value={sample} maxLength={20} onChange={(e) => setSample(e.target.value)} />
          </Field>
          <Field label="Style" hint={canEngrave ? undefined : "engraved needs a 3MF slicer project"}>
            <select
              className="h-8 w-full rounded-md border bg-background px-2 text-sm"
              disabled={!slot || (!canEngrave && slot.mode !== "engraved")}
              value={slot?.mode ?? "raised"}
              onChange={(e) => {
                if (!slot) return;
                const { mode: _m, nameColor: _c, nameColors: _cs, ...rest } = slot;
                void _m; void _c; void _cs;
                setSlot(e.target.value === "engraved" ? { ...rest, mode: "engraved", sink: 0 } : { ...rest, ...(slot.sink ? {} : { sink: 0.4 }) });
              }}
            >
              <option value="raised">Raised (letters stand out)</option>
              <option value="engraved">Engraved (letters cut in)</option>
            </select>
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
          <fieldset disabled={!slot} className="space-y-1">
            <legend className="text-xs font-medium">Fonts customers can choose <span className="font-normal text-muted-foreground">(tick two or more to show a picker)</span></legend>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1">
              {NAME_FONT_IDS.map((id) => (
                <Check key={id} label={NAME_FONTS[id].label} checked={slot ? fontChoices(slot).includes(id) : false} onChange={(on) => toggleFont(id, on)} />
              ))}
            </div>
          </fieldset>
          {slot?.nameColor && !engraved && (
            <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="inline-block size-4 rounded-full border" style={{ backgroundColor: slot.nameColor.hex }} aria-hidden />
              Name prints in {slot.nameColor.filament ? `filament ${slot.nameColor.filament} ` : ""}({slot.nameColor.hex}) unless the customer picks another colour.
              <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => { const { nameColor: _c, ...rest } = slot; void _c; setSlot(rest); }}>
                Same as the model
              </Button>
            </p>
          )}
          {!engraved && <fieldset disabled={!slot} className="space-y-1.5">
            <legend className="text-xs font-medium">Name colours customers can choose <span className="font-normal text-muted-foreground">(none = the name follows the product colour)</span></legend>
            {nameColors.map((c, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <input
                  type="color"
                  aria-label={`Colour of ${c.label}`}
                  className="h-8 w-9 shrink-0 cursor-pointer rounded border bg-background p-0.5"
                  value={HEX.test(c.hex) ? c.hex : "#888888"}
                  onChange={(e) => setNameColors(nameColors.map((x, j) => (j === i ? { ...x, hex: e.target.value } : x)))}
                />
                <Input aria-label={`Label of colour ${i + 1}`} className="min-w-0 flex-1" value={c.label} maxLength={30} onChange={(e) => setNameColors(nameColors.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <Input
                  aria-label={`Slicer filament number of ${c.label}`}
                  title="Slicer filament number (optional): the name part is assigned to it in the print file"
                  className="w-14 shrink-0"
                  type="number"
                  min={1}
                  max={32}
                  placeholder="Fil."
                  value={c.filament ?? ""}
                  onChange={(e) => setNameColors(nameColors.map((x, j) => (j === i ? { ...x, filament: e.target.value ? Number(e.target.value) : undefined } : x)))}
                />
                <Button type="button" size="icon" variant="outline" aria-label={`Preview ${c.label}`} title="Show this colour in the preview" onClick={() => setPreviewHex(c.hex)}>
                  <span className="size-4 rounded-full border" style={{ backgroundColor: c.hex }} />
                </Button>
                <Button type="button" size="icon" variant="outline" aria-label={`Remove ${c.label}`} onClick={() => setNameColors(nameColors.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center gap-1.5">
              {nameColors.length < 12 && (
                <Button type="button" size="sm" variant="outline" onClick={() => setNameColors([...nameColors, { label: "Name colour", hex: "#e11d48" }])}>
                  <Plus className="mr-1 size-4" /> Add colour
                </Button>
              )}
              {colors.filter((c) => HEX.test(c.hex) && !nameColors.some((n) => n.hex.toLowerCase() === c.hex.toLowerCase())).slice(0, 8).map((c) => (
                <Button key={c.hex} type="button" size="sm" variant="outline" onClick={() => setNameColors([...nameColors, { label: c.label, hex: c.hex }])} title={`Add ${c.label} from the product colors`}>
                  <span className="mr-1 inline-block size-3 rounded-full border" style={{ backgroundColor: c.hex }} aria-hidden /> {c.label}
                </Button>
              ))}
              {previewHex && (
                <Button type="button" size="sm" variant="ghost" onClick={() => setPreviewHex(null)}>
                  Preview: same as product
                </Button>
              )}
            </div>
          </fieldset>}
          {measuring && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
              <Loader2 className="size-3.5 animate-spin" /> Measuring the room for a name here…
            </p>
          )}
          {noRoom && (
            <p className="text-xs text-destructive" role="alert">
              There is no room for a name here: the surface is too small or not flat. Click a larger flat area.
            </p>
          )}
          {spaceError && <p className="text-xs text-destructive" role="alert">Could not measure the room: {spaceError}. Saving will still check it.</p>}
          {limits && !noRoom && (
            <p className="text-xs text-muted-foreground">
              Room here: up to {limits.maxWidth} mm wide (at the smallest height) or {limits.maxHeight} mm tall (at the smallest width). Sizes are limited to what fits.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            {num("height", "Letter height", 0.5, "mm")}
            {num("maxWidth", "Widest name", 1, "mm")}
            {num("maxHeight", "Tallest name", 0.5, "mm, with tails")}
            {num("depth", "Stands out", 0.1, "mm")}
            {!engraved && num("sink", "Sunk in", 0.1, "mm")}
          </div>
          {engraved && (
            <p className={`text-xs ${tooDeep ? "text-destructive" : "text-muted-foreground"}`} role={tooDeep ? "alert" : undefined}>
              {wallMm === undefined ? "Measuring the wall behind the name…" : wallMm === null ? "Could not measure the wall behind the name." : `The model is ${wallMm} mm thick behind the name${tooDeep ? `, so a cut this deep would break through. Use ${maxDepth} mm or less.` : `, so the cut can be up to ${maxDepth} mm deep.`}`}
            </p>
          )}
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
                ? `"${sample}" is ${build.widthMm.toFixed(1)} × ${build.inkHeightMm.toFixed(1)} mm (capital letters ${build.heightMm.toFixed(1)} mm), stroke ${build.stemMm.toFixed(2)} mm${build.stemMm < 1 ? " (thin: bigger letters print better)" : ""}.`
                : (build?.error ?? "")}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" disabled={!slot || !dirty || pending || measuring || noRoom || tooDeep} onClick={() => save(slot)}>
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
