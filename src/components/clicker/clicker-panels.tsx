"use client";

/**
 * The step panels of the clicker designer: design layers (text and pictures) or the letters of name keys, colours (with the
 * colour limit of the printer), shape and size, how it looks (raised artwork, rim height), the switch and the keyring.
 * Each one only changes the design through `edit`, so undo and redo cover everything.
 */
import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, Copy, Eye, EyeOff, FlipHorizontal2, ImagePlus, Link2, Link2Off, Loader2, Trash2, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { FontPicker } from "@/components/font-picker";
import { PalettePicker } from "@/components/clicker/palette-picker";
import { ShapeThumb } from "@/components/clicker/shape-thumb";
import { formatPHP } from "@/lib/money";
import { NAME_FONT_IDS } from "@/lib/name-mesh";
import type { Layout } from "@/lib/clicker/layout";
import { SHAPES_WITH_CORNER, SHAPES_WITH_POINTS, SHAPE_IDS, SHAPE_LABELS } from "@/lib/clicker/shapes";
import { BORDER_IDS, BORDER_LABELS, BORDER_MM, FIT, RELIEF_IDS, RELIEF_LABELS, RIM_IDS, RIM_LABELS, RIM_MM } from "@/lib/clicker/fit";
import { clickerColours, LIMITS, nameKeys, sizeTierCents, switchCount, switchesApart, switchPattern, type ClickerConfig, type ClickerSpec, type ImageLayer, type Layer, type TextLayer } from "@/lib/clicker/spec";
import { coloursInUse, duplicateLayer, moveLayer, recolour, removeLayer, scaleDesign, setSize, updateLayer } from "@/lib/clicker/state";
import type { Analysis, Pixels } from "@/lib/clicker/trace";
import { cn } from "@/lib/utils";

export type EditFn = (fn: (s: ClickerSpec) => ClickerSpec, key?: string) => void;
type Common = { spec: ClickerSpec; edit: EditFn; config: ClickerConfig };

export type PictureSettings = { colours: number; keep: boolean[]; target: string[]; smoothing: number; detail: number };
/** What the designer remembers about a picture while it is on screen, so its colours can be changed without reloading it. */
export type PictureState = { analysis: Analysis; settings: PictureSettings; pixels: Pixels };

// ---------------------------------------------------------------------------------------------------------------------
// small controls
// ---------------------------------------------------------------------------------------------------------------------

export function Slider({
  label, value, min, max, step = 1, unit = "mm", onChange, hint, id,
}: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void; hint?: string; id: string }) {
  const shown = Math.round(value * 100) / 100;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-xs font-semibold">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">{shown}{unit ? ` ${unit}` : ""}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-6 w-full cursor-pointer accent-primary"
        aria-valuetext={`${shown} ${unit}`}
      />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Toggle({ on, onChange, label, id }: { on: boolean; onChange: (v: boolean) => void; label: string; id: string }) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border-2 border-border px-3 py-2 text-sm font-semibold has-[:checked]:border-primary has-[:checked]:bg-primary/5">
      {label}
      <input id={id} type="checkbox" role="switch" checked={on} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-primary" />
    </label>
  );
}

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="space-y-2.5">
    <h3 className="text-sm font-bold">{title}</h3>
    {children}
  </section>
);

// ---------------------------------------------------------------------------------------------------------------------
// Shape and size
// ---------------------------------------------------------------------------------------------------------------------

export function ShapePanel({ spec, edit, config, lock, setLock, layout, onShape }: Common & { lock: boolean; setLock: (v: boolean) => void; layout: Layout; onShape: (id: (typeof SHAPE_IDS)[number]) => void }) {
  const outline = spec.shape === "outline";
  const tiers = [...new Set([config.minSize, ...config.sizeTiers.map((t) => t.upToMm), config.maxSize].filter((v) => v >= config.minSize && v <= config.maxSize))].sort((a, b) => a - b);
  const actual = Math.max(layout.capSize[0], layout.capSize[1]);
  // a key that follows its artwork is sized by scaling the whole design to the longest side asked for
  const rescale = (target: number) => {
    const t = Math.min(config.maxSize, Math.max(Math.min(LIMITS.minSizeMm, actual), target));
    edit((s) => scaleDesign(s, t / actual), "scale");
  };
  return (
    <div className="space-y-5">
      <Section title="Shape">
        <div className="grid grid-cols-4 gap-2" role="group" aria-label="Shape">
          {SHAPE_IDS.map((id) => (
            <button
              key={id}
              type="button"
              aria-pressed={spec.shape === id}
              onClick={() => onShape(id)}
              className={cn(
                "flex flex-col items-center gap-1 rounded-lg border-2 p-2 text-center text-[11px] font-semibold leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                id === "outline" && "col-span-2",
                spec.shape === id ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:border-primary",
              )}
            >
              <ShapeThumb id={id} className="size-8" />
              {SHAPE_LABELS[id]}
            </button>
          ))}
        </div>
        {outline && <p className="text-[11px] text-muted-foreground">The key follows the shape of your text and pictures, with a coloured border round it. The other shapes are a plate with your design inside. Changing the shape centres your design and shrinks it if it would not fit.</p>}
        {SHAPES_WITH_CORNER.includes(spec.shape) && <Slider id="corner" label="Corner roundness" value={spec.corner} min={0} max={Math.min(spec.width, spec.height) / 2} step={0.5} onChange={(v) => edit((s) => ({ ...s, corner: v }), "corner")} />}
        {SHAPES_WITH_POINTS.includes(spec.shape) && <Slider id="points" label={spec.shape === "star" ? "Points" : "Petals"} value={spec.points} min={3} max={12} unit="" onChange={(v) => edit((s) => ({ ...s, points: Math.round(v) }), "points")} />}
      </Section>

      {outline && (
        <Section title="Border">
          <p className="text-[11px] text-muted-foreground">The border is the key colour, round the artwork. Pick the key colour in the Colours step.</p>
          <div className="grid grid-cols-4 gap-2" role="group" aria-label="Border width">
            {BORDER_IDS.map((b) => (
              <button
                key={b}
                type="button"
                aria-pressed={Math.abs(spec.border - BORDER_MM[b]) < 0.05}
                onClick={() => edit((s) => ({ ...s, border: BORDER_MM[b] }))}
                className={cn("rounded-lg border-2 px-1 py-2 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", Math.abs(spec.border - BORDER_MM[b]) < 0.05 ? "border-primary bg-primary/10 text-primary" : "border-border hover:border-primary")}
              >
                <span className="block text-xs font-bold">{BORDER_LABELS[b]}</span>
                <span className="block text-[11px] text-muted-foreground">{BORDER_MM[b]} mm</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      <Section title={outline ? "Size" : "Size of the key"}>
        {outline ? (
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Size presets">
              {tiers.map((mm) => {
                const add = sizeTierCents(mm, config.sizeTiers);
                const on = Math.abs(actual - mm) < 0.6;
                return (
                  <button key={mm} type="button" aria-pressed={on} onClick={() => rescale(mm)} className={cn("rounded-full border-2 px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}>
                    {mm} mm{add ? ` · +${formatPHP(add)}` : ""}
                  </button>
                );
              })}
            </div>
            <div className="flex items-end gap-2">
              <Button type="button" size="icon" variant="outline" aria-label="Smaller" onClick={() => rescale(actual - 5)}>−</Button>
              <div className="flex-1">
                <Label htmlFor="longest" className="text-xs font-semibold">Longest side (mm)</Label>
                <Input
                  key={Math.round(actual * 10)}
                  id="longest"
                  type="number"
                  inputMode="decimal"
                  min={LIMITS.minSizeMm}
                  max={config.maxSize}
                  step={1}
                  defaultValue={Math.round(actual * 10) / 10}
                  onBlur={(e) => e.target.value && Math.abs(Number(e.target.value) - actual) > 0.3 && rescale(Number(e.target.value))}
                  onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              </div>
              <Button type="button" size="icon" variant="outline" aria-label="Bigger" onClick={() => rescale(actual + 5)}>+</Button>
            </div>
            <p className="text-[11px] text-muted-foreground">Changing this makes the whole design bigger or smaller, and the key follows. Up to {config.maxSize} mm. Bigger clickers cost a little more.</p>
          </>
        ) : (
          <>
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Size presets">
              {tiers.map((mm) => {
                const add = sizeTierCents(mm, config.sizeTiers);
                const on = Math.max(spec.width, spec.height) === mm;
                return (
                  <button
                    key={mm}
                    type="button"
                    aria-pressed={on}
                    onClick={() => edit((s) => setSize(setSize(s, { width: mm }, config, false), { height: mm }, config, false))}
                    className={cn("rounded-full border-2 px-3 py-1 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-primary")}
                  >
                    {mm} mm{add ? ` · +${formatPHP(add)}` : ""}
                  </button>
                );
              })}
            </div>
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div>
                <Label htmlFor="width" className="text-xs font-semibold">Width (mm)</Label>
                <Input id="width" type="number" inputMode="decimal" min={config.minSize} max={config.maxSize} step={0.5} value={spec.width} onChange={(e) => e.target.value && edit((s) => setSize(s, { width: Number(e.target.value) }, config, lock), "size")} />
              </div>
              <Button type="button" size="icon" variant={lock ? "default" : "outline"} aria-pressed={lock} aria-label={lock ? "Keep the proportions (on)" : "Keep the proportions (off)"} title="Keep the proportions" onClick={() => setLock(!lock)}>
                {lock ? <Link2 className="size-4" /> : <Link2Off className="size-4" />}
              </Button>
              <div>
                <Label htmlFor="height" className="text-xs font-semibold">Height (mm)</Label>
                <Input id="height" type="number" inputMode="decimal" min={config.minSize} max={config.maxSize} step={0.5} value={spec.height} onChange={(e) => e.target.value && edit((s) => setSize(s, { height: Number(e.target.value) }, config, lock), "size")} />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">This is the size of the key you press, from {config.minSize} to {config.maxSize} mm. The base is 5 mm bigger all round. Bigger clickers cost a little more.</p>
          </>
        )}
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs" role="status">
          Key {layout.capSize[0].toFixed(1)} × {layout.capSize[1].toFixed(1)} mm · base {layout.baseSize[0].toFixed(1)} × {layout.baseSize[1].toFixed(1)} mm · {layout.totalHeight.toFixed(1)} mm tall
          {layout.grownFrom ? <span className="mt-0.5 block text-amber-700">Made bigger than you asked so the switch fits inside this shape.</span> : null}
        </p>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Design layers
// ---------------------------------------------------------------------------------------------------------------------

function LayerRow({ layer, selected, onSelect, spec, edit, config }: Common & { layer: Layer; selected: boolean; onSelect: () => void }) {
  const label = layer.kind === "text" ? layer.text.split("\n")[0] || "Text" : layer.name || "Picture";
  const i = spec.layers.findIndex((l) => l.id === layer.id);
  return (
    <li className={cn("flex items-center gap-1 rounded-lg border-2 px-2 py-1.5", selected ? "border-primary bg-primary/5" : "border-border")}>
      <button type="button" onClick={onSelect} aria-pressed={selected} className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        {layer.kind === "text" ? <Type className="size-4 shrink-0" aria-hidden /> : <ImagePlus className="size-4 shrink-0" aria-hidden />}
        <span className={cn("truncate", !layer.visible && "text-muted-foreground line-through")}>{label}</span>
      </button>
      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={layer.visible ? `Hide ${label}` : `Show ${label}`} onClick={() => edit((s) => updateLayer(s, layer.id, { visible: !layer.visible }))}>
        {layer.visible ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Bring ${label} forward`} disabled={i >= spec.layers.length - 1} onClick={() => edit((s) => moveLayer(s, layer.id, "up"))}>
        <ArrowUp className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Send ${label} back`} disabled={i <= 0} onClick={() => edit((s) => moveLayer(s, layer.id, "down"))}>
        <ArrowDown className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-7" aria-label={`Duplicate ${label}`} disabled={spec.layers.length >= config.maxLayers} onClick={() => edit((s) => duplicateLayer(s, layer.id, config))}>
        <Copy className="size-4" />
      </Button>
      <Button type="button" size="icon" variant="ghost" className="size-7 text-destructive" aria-label={`Delete ${label}`} onClick={() => edit((s) => removeLayer(s, layer.id))}>
        <Trash2 className="size-4" />
      </Button>
    </li>
  );
}

function TextEditor({ layer, edit, config }: { layer: TextLayer; edit: EditFn; config: ClickerConfig }) {
  const patch = (p: Partial<TextLayer>, key?: string) => edit((s) => updateLayer(s, layer.id, p), key);
  return (
    <div className="space-y-3">
      <div>
        <Label htmlFor={`text-${layer.id}`} className="text-xs font-semibold">Text</Label>
        <textarea
          id={`text-${layer.id}`}
          value={layer.text}
          maxLength={40}
          rows={2}
          placeholder="Type here. Press Enter for a new line."
          onChange={(e) => patch({ text: e.target.value }, `text-${layer.id}`)}
          className="mt-1 w-full resize-none rounded-lg border-2 border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <FontPicker fonts={NAME_FONT_IDS} value={layer.font} sample={layer.text.split("\n")[0]} label="Font" onChange={(font) => patch({ font })} />
      <Slider id={`size-${layer.id}`} label="Letter height" value={layer.size} min={2} max={40} step={0.5} onChange={(v) => patch({ size: v }, `size-${layer.id}`)} />
      <Slider id={`sp-${layer.id}`} label="Space between letters" value={layer.spacing} min={-1} max={6} step={0.1} onChange={(v) => patch({ spacing: v }, `sp-${layer.id}`)} />
      {layer.text.includes("\n") && <Slider id={`lg-${layer.id}`} label="Space between lines" value={layer.lineGap} min={-2} max={10} step={0.2} onChange={(v) => patch({ lineGap: v }, `lg-${layer.id}`)} />}
      <div className="space-y-1">
        <p className="text-xs font-semibold">Colour</p>
        <PalettePicker palette={config.palette} value={layer.color} label="Text colour" onChange={(color) => patch({ color })} />
      </div>
    </div>
  );
}

function PictureEditor({ layer, spec, edit, config, picture, retrace, busy }: Common & { layer: ImageLayer; picture?: PictureState; retrace: (id: string, p: Partial<PictureSettings>) => void; busy: boolean }) {
  const patch = (p: Partial<ImageLayer>, key?: string) => edit((s) => updateLayer(s, layer.id, p), key);
  return (
    <div className="space-y-3">
      <Slider id={`size-${layer.id}`} label="Picture size (longest side)" value={layer.size} min={2} max={Math.max(spec.width, spec.height)} step={0.5} onChange={(v) => patch({ size: v }, `size-${layer.id}`)} />
      {picture ? (
        <div className="space-y-3 rounded-lg border-2 border-border p-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold">Colours in your picture</p>
            {busy && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-label="Working" />}
          </div>
          <Slider id={`ncol-${layer.id}`} label="Number of colours to look for" value={picture.settings.colours} min={2} max={Math.max(2, config.maxColours - 1)} unit="" hint={`The printer holds ${config.maxColours} colours at once, and the base and the key each use one.`} onChange={(v) => retrace(layer.id, { colours: Math.round(v) })} />
          <ul className="space-y-2">
            {picture.analysis.palette.map((p, i) => (
              <li key={i} className="space-y-1.5 rounded-md bg-muted/40 p-2">
                <div className="flex items-center gap-2 text-xs">
                  <span className="size-5 shrink-0 rounded border" style={{ backgroundColor: p.hex }} aria-hidden />
                  <label className="flex flex-1 cursor-pointer items-center gap-2 font-semibold">
                    <input
                      type="checkbox"
                      checked={picture.settings.keep[i]}
                      onChange={(e) => retrace(layer.id, { keep: picture.settings.keep.map((k, j) => (j === i ? e.target.checked : k)) })}
                      className="size-4 accent-primary"
                    />
                    {p.background ? "Background" : `Colour ${i + 1}`}{" "}
                    <span className="font-normal text-muted-foreground">{Math.round(p.fraction * 100)}%</span>
                  </label>
                  <span className="text-muted-foreground">{picture.settings.keep[i] ? "prints as" : "left out"}</span>
                </div>
                {picture.settings.keep[i] && (
                  <PalettePicker size="sm" palette={config.palette} value={picture.settings.target[i]} label={`Print colour ${i + 1} as`} onChange={(hex) => retrace(layer.id, { target: picture.settings.target.map((t, j) => (j === i ? hex : t)) })} />
                )}
              </li>
            ))}
          </ul>
          <Slider id={`det-${layer.id}`} label="Detail" value={picture.settings.detail} min={0} max={1} step={0.05} unit="" hint="Less detail makes cleaner, simpler shapes." onChange={(v) => retrace(layer.id, { detail: v })} />
          <Slider id={`smo-${layer.id}`} label="Smoothing" value={picture.settings.smoothing} min={0} max={2} step={1} unit="" onChange={(v) => retrace(layer.id, { smoothing: Math.round(v) })} />
        </div>
      ) : (
        <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">This picture was saved earlier. Change its colours in the Colours step, or add the picture again to change what is picked up from it.</p>
      )}
    </div>
  );
}

export function DesignPanel({
  spec, edit, config, selected, setSelected, onAddText, onAddFile, pictures, retrace, busy, error,
}: Common & {
  selected: string | null;
  setSelected: (id: string | null) => void;
  onAddText: () => void;
  onAddFile: (f: File) => void;
  pictures: Map<string, PictureState>;
  retrace: (id: string, p: Partial<PictureSettings>) => void;
  busy: boolean;
  error: string | null;
}) {
  const file = useRef<HTMLInputElement>(null);
  const layer = spec.layers.find((l) => l.id === selected) ?? null;
  const full = spec.layers.length >= config.maxLayers;
  return (
    <div className="space-y-4">
      <Section title="Design">
        <div className="flex flex-wrap gap-2">
          {config.allowText && (
            <Button type="button" variant="outline" size="sm" disabled={full} onClick={onAddText}>
              <Type className="mr-1.5 size-4" /> Add text
            </Button>
          )}
          {config.allowImages && (
            <>
              <Button type="button" variant="outline" size="sm" disabled={full || busy} onClick={() => file.current?.click()}>
                {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : <ImagePlus className="mr-1.5 size-4" />} Add picture
              </Button>
              <input
                ref={file}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml,.svg"
                className="sr-only"
                aria-label="Choose a picture or SVG"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAddFile(f);
                  e.target.value = "";
                }}
              />
            </>
          )}
        </div>
        {full && <p className="text-xs text-muted-foreground">That is the most layers ({config.maxLayers}). Delete one to add another.</p>}
        {error && <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{error}</p>}
        {spec.layers.length === 0 ? (
          <p className="rounded-lg border-2 border-dashed p-4 text-center text-sm text-muted-foreground">Nothing on the key yet. Add some text or a picture.</p>
        ) : (
          <ul className="space-y-1.5" aria-label="Layers, the last one is on top">
            {[...spec.layers].reverse().map((l) => (
              <LayerRow key={l.id} layer={l} selected={l.id === selected} onSelect={() => setSelected(l.id === selected ? null : l.id)} spec={spec} edit={edit} config={config} />
            ))}
          </ul>
        )}
      </Section>

      {layer && (
        <Section title={layer.kind === "text" ? "Text" : "Picture"}>
          {layer.kind === "text" ? <TextEditor layer={layer} edit={edit} config={config} /> : <PictureEditor layer={layer} spec={spec} edit={edit} config={config} picture={pictures.get(layer.id)} retrace={retrace} busy={busy} />}
          <div className="space-y-3 border-t pt-3">
            <p className="text-xs font-semibold">Place it</p>
            <p className="text-[11px] text-muted-foreground">Or switch on “Move” above the clicker and drag it.</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor={`x-${layer.id}`} className="text-xs">Across (mm)</Label>
                <Input id={`x-${layer.id}`} type="number" inputMode="decimal" step={0.5} value={Math.round(layer.x * 10) / 10} onChange={(e) => e.target.value !== "" && edit((s) => updateLayer(s, layer.id, { x: Number(e.target.value) }), `x-${layer.id}`)} />
              </div>
              <div>
                <Label htmlFor={`y-${layer.id}`} className="text-xs">Up (mm)</Label>
                <Input id={`y-${layer.id}`} type="number" inputMode="decimal" step={0.5} value={Math.round(layer.y * 10) / 10} onChange={(e) => e.target.value !== "" && edit((s) => updateLayer(s, layer.id, { y: Number(e.target.value) }), `y-${layer.id}`)} />
              </div>
            </div>
            <Slider id={`rot-${layer.id}`} label="Turn" value={layer.rotation} min={-180} max={180} step={1} unit="°" onChange={(v) => edit((s) => updateLayer(s, layer.id, { rotation: v }), `rot-${layer.id}`)} />
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => edit((s) => updateLayer(s, layer.id, { x: 0, y: 0 }))}>Centre</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => edit((s) => updateLayer(s, layer.id, { rotation: 0 }))}>Straighten</Button>
              <Button type="button" size="sm" variant={layer.mirror ? "default" : "outline"} aria-pressed={layer.mirror} onClick={() => edit((s) => updateLayer(s, layer.id, { mirror: !layer.mirror }))}>
                <FlipHorizontal2 className="mr-1.5 size-4" /> Flip
              </Button>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Colours (and the printer's colour limit)
// ---------------------------------------------------------------------------------------------------------------------

/** "3 of 4 colours used": all the colours of a clicker share the printer's filament slots. */
export function ColourMeter({ spec, config }: { spec: ClickerSpec; config: ClickerConfig }) {
  const n = clickerColours(spec).length;
  const over = n > config.maxColours;
  return (
    <div role="status" className={cn("rounded-lg border-2 px-3 py-2", over ? "border-destructive/50 bg-destructive/5" : "border-border bg-muted/30")}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-bold">{n} of {config.maxColours} colours used</p>
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: config.maxColours }, (_, i) => (
            <span key={i} className="size-3 rounded-full border" style={{ backgroundColor: clickerColours(spec)[i] ?? "transparent" }} />
          ))}
        </div>
      </div>
      <p className={cn("mt-1 text-[11px]", over ? "text-destructive" : "text-muted-foreground")}>
        {over
          ? `Too many. The printer holds ${config.maxColours} colours at once, and the base and the key each use one. Use fewer colours, or give the base and the key the same colour.`
          : `The printer holds ${config.maxColours} colours at once. The base and the key each use one, and the rest is for the artwork.`}
      </p>
    </div>
  );
}

export function ColoursPanel({ spec, edit, config }: Common) {
  const used = coloursInUse(spec);
  const design = used.filter((u) => u.layers.length && spec.kind === "clicker");
  const nameOf = (id: string) => {
    const l = spec.layers.find((x) => x.id === id);
    return l ? (l.kind === "text" ? `“${l.text.split("\n")[0].slice(0, 14)}”` : l.name || "Picture") : "";
  };
  return (
    <div className="space-y-5">
      <ColourMeter spec={spec} config={config} />
      <Section title="Base">
        <p className="text-[11px] text-muted-foreground">The part that holds the switch. Click it on the 3D view to select it.</p>
        <PalettePicker palette={config.palette} value={spec.baseColor} label="Base colour" onChange={(c) => edit((s) => ({ ...s, baseColor: c }))} />
      </Section>
      {spec.kind === "clicker" ? (
        <Section title="Key">
          <p className="text-[11px] text-muted-foreground">The part you press, behind the artwork.</p>
          <PalettePicker palette={config.palette} value={spec.capColor} label="Key colour" onChange={(c) => edit((s) => ({ ...s, capColor: c }))} />
        </Section>
      ) : (
        spec.name && (
          <>
            <Section title={spec.name.keyColors.length > 1 ? "Keys (they alternate)" : "Keys"}>
              {spec.name.keyColors.map((c, i) => (
                <PalettePicker key={i} palette={config.palette} value={c} label={`Key colour ${i + 1}`} onChange={(hex) => edit((s) => ({ ...s, name: s.name && { ...s.name, keyColors: s.name.keyColors.map((k, j) => (j === i ? hex : k)) } }))} />
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => edit((s) => (s.name ? { ...s, name: { ...s.name, keyColors: s.name.keyColors.length > 1 ? s.name.keyColors.slice(0, 1) : [s.name.keyColors[0], config.palette.find((p) => p.toLowerCase() !== s.name!.keyColors[0].toLowerCase()) ?? config.palette[0]] } } : s))}
              >
                {spec.name.keyColors.length > 1 ? "Use one key colour" : "Alternate two key colours"}
              </Button>
            </Section>
            <Section title="Letters">
              <PalettePicker palette={config.palette} value={spec.name.letterColor} label="Letter colour" onChange={(c) => edit((s) => ({ ...s, name: s.name && { ...s.name, letterColor: c } }))} />
            </Section>
          </>
        )
      )}
      {design.length > 0 && (
        <Section title="Artwork colours">
          <ul className="space-y-3">
            {design.map((u) => (
              <li key={u.hex} className="space-y-1.5">
                <p className="text-xs text-muted-foreground">{[...new Set(u.layers)].map(nameOf).join(", ")}</p>
                <PalettePicker palette={config.palette} value={u.hex} label={`Colour of ${[...new Set(u.layers)].map(nameOf).join(", ")}`} onChange={(c) => edit((s) => recolour(s, u.hex, c, "design"))} />
              </li>
            ))}
          </ul>
        </Section>
      )}
      <p className="text-[11px] text-muted-foreground">The first two colours are included in the price. {config.extraColourCents > 0 ? `Each extra colour adds ${formatPHP(config.extraColourCents)}.` : "Extra colours are free."}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Look: artwork height and the rim
// ---------------------------------------------------------------------------------------------------------------------

export function LookPanel({ spec, edit }: Common) {
  return (
    <div className="space-y-5">
      <Section title="Artwork">
        <div className="grid gap-2" role="group" aria-label="Artwork height">
          {RELIEF_IDS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={spec.relief === r}
              onClick={() => edit((s) => ({ ...s, relief: r }))}
              className={cn("rounded-lg border-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", spec.relief === r ? "border-primary bg-primary/5" : "border-border hover:border-primary")}
            >
              <span className="block text-sm font-bold">{RELIEF_LABELS[r]}</span>
              <span className="block text-xs text-muted-foreground">{r === "flat" ? "Level with the key. Smooth to the touch." : "Stands out above the key, so you can feel it."}</span>
            </button>
          ))}
        </div>
      </Section>
      <Section title="Wall round the key">
        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Wall height">
          {RIM_IDS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={spec.rim === r}
              onClick={() => edit((s) => ({ ...s, rim: r }))}
              className={cn("rounded-lg border-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", spec.rim === r ? "border-primary bg-primary/5" : "border-border hover:border-primary")}
            >
              <span className="block text-sm font-bold">{RIM_LABELS[r]}</span>
              <span className="block text-xs text-muted-foreground">{Math.round(RIM_MM[r] * 10) / 10} mm</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">Flush makes the wall as tall as the key, so it sits level.</p>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Switch
// ---------------------------------------------------------------------------------------------------------------------

/** A top view of the key with a square for each switch. Drag a square (or use the arrow keys) to place it. */
function SwitchMap({ spec, edit, layout }: { spec: ClickerSpec; edit: EditFn; layout: Layout }) {
  const svg = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const b = layout.capBounds;
  const reach = Math.max(Math.abs(b.minX), Math.abs(b.maxX), Math.abs(b.minY), Math.abs(b.maxY), ...spec.switches.flatMap((p) => [Math.abs(p.x) + 8, Math.abs(p.y) + 8]));
  const half = Math.ceil((reach + 4) / 10) * 10; // steps of 10 mm so the picture does not jump while you drag
  const half2 = Math.max(half, 20);
  const path = layout.capOutline.map((r) => [r.outer, ...r.holes].map((ring) => "M" + ring.map(([x, y]) => `${x.toFixed(2)} ${(-y).toFixed(2)}`).join("L") + "Z").join("")).join("");
  const K = FIT.keepoutMm;

  const move = (i: number, x: number, y: number) => {
    const nx = Math.round(Math.max(-100, Math.min(100, x)) * 2) / 2, ny = Math.round(Math.max(-100, Math.min(100, y)) * 2) / 2;
    const next = spec.switches.map((p, j) => (j === i ? { x: nx, y: ny } : p));
    if (!switchesApart(next)) return; // too close to another switch: the square stays where it was
    edit((s) => ({ ...s, switches: next }), `sw-${i}`);
  };
  const at = (e: React.PointerEvent) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return null;
    const pt = el.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(m.inverse());
    return { x: p.x, y: -p.y };
  };

  return (
    <svg
      ref={svg}
      viewBox={`${-half2} ${-half2} ${half2 * 2} ${half2 * 2}`}
      className="aspect-square w-full max-w-sm touch-none rounded-lg border-2 border-border bg-muted/30"
      role="group"
      aria-label="Where the switches go, seen from above"
      onPointerMove={(e) => { if (drag === null) return; const p = at(e); if (p) move(drag, p.x, p.y); }}
      onPointerUp={() => setDrag(null)}
      onPointerLeave={() => setDrag(null)}
    >
      <path d={path} fill="currentColor" className="text-foreground/10" fillRule="evenodd" stroke="currentColor" strokeWidth={0.3} />
      <line x1={-half2} y1={0} x2={half2} y2={0} stroke="currentColor" strokeOpacity={0.12} strokeWidth={0.2} />
      <line x1={0} y1={-half2} x2={0} y2={half2} stroke="currentColor" strokeOpacity={0.12} strokeWidth={0.2} />
      {spec.switches.map((p, i) => (
        <g
          key={i}
          transform={`translate(${p.x} ${-p.y})`}
          tabIndex={0}
          role="button"
          aria-label={`Switch ${i + 1}. Drag it, or use the arrow keys.`}
          className="cursor-grab outline-none focus-visible:[&>rect]:stroke-[0.8]"
          onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); setDrag(i); }}
          onKeyDown={(e) => {
            const step = e.shiftKey ? 2 : 0.5;
            const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
            if (d) { e.preventDefault(); move(i, p.x + d[0], p.y + d[1]); }
          }}
        >
          <rect x={-K / 2} y={-K / 2} width={K} height={K} rx={1} fill="#0ea5e9" fillOpacity={0.15} stroke="#0ea5e9" strokeDasharray="1.2 0.8" strokeWidth={0.4} />
          <rect x={-7} y={-7} width={14} height={14} rx={0.5} fill="#0ea5e9" fillOpacity={0.35} />
          <text textAnchor="middle" dominantBaseline="central" fontSize={5} fontWeight={700} fill="#0c4a6e">{i + 1}</text>
        </g>
      ))}
    </svg>
  );
}

export function SwitchPanel({ spec, edit, config, layout }: Common & { layout: Layout }) {
  const keys = switchCount(spec);
  if (spec.kind === "name") {
    return <p className="text-xs text-muted-foreground">Every key has its own Cherry MX switch under it ({keys} {keys === 1 ? "switch" : "switches"}). They are placed for you.</p>;
  }
  const n = spec.switches.length;
  const set = (count: number, arrangement: "row" | "grid") => edit((s) => ({ ...s, switches: switchPattern(count, arrangement) }));
  const grid = n >= 3 && spec.switches.some((p) => p.y !== 0);
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Each click comes from a Cherry MX switch under the key. More switches make a bigger key that presses on all of them, or give you more clicks in one place.</p>
      <Section title="How many switches">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Number of switches">
          {Array.from({ length: config.maxSwitches }, (_, i) => i + 1).map((c) => (
            <Button key={c} type="button" size="sm" variant={n === c ? "default" : "outline"} aria-pressed={n === c} className="min-w-10" onClick={() => set(c, grid ? "grid" : "row")}>
              {c}
            </Button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">{n === 1 ? "One switch is included." : `${formatPHP((n - 1) * config.extraSwitchCents)} for the extra ${n - 1 === 1 ? "switch" : "switches"} (${formatPHP(config.extraSwitchCents)} each).`}</p>
      </Section>
      {n > 1 && (
        <Section title="Place them">
          <div className="flex flex-wrap gap-2" role="group" aria-label="Arrange">
            <Button type="button" size="sm" variant={!grid ? "default" : "outline"} aria-pressed={!grid} onClick={() => set(n, "row")}>In a row</Button>
            {n >= 3 && <Button type="button" size="sm" variant={grid ? "default" : "outline"} aria-pressed={grid} onClick={() => set(n, "grid")}>In a grid</Button>}
          </div>
        </Section>
      )}
      <Section title={n > 1 ? "Fine-tune" : "Where it goes"}>
        <SwitchMap spec={spec} edit={edit} layout={layout} />
        <p className="text-[11px] text-muted-foreground">
          Drag a square to move that switch, or select it and use the arrow keys (hold Shift for bigger steps). Switches must be at least {FIT.switchPitchMm} mm apart so they fit in the print. The key grows to hold them.
        </p>
        {layout.errors.filter((e) => /switch/i.test(e)).map((e) => <p key={e} role="alert" className="text-xs text-destructive">{e}</p>)}
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Name keys: the letters
// ---------------------------------------------------------------------------------------------------------------------

export function LettersPanel({ spec, edit, config, layout }: Common & { layout: Layout }) {
  const n = spec.name;
  if (!n) return null;
  const set = (p: Partial<NonNullable<ClickerSpec["name"]>>, key?: string) => edit((s) => (s.name ? { ...s, name: { ...s.name, ...p } } : s), key);
  const keys = nameKeys(n);
  return (
    <div className="space-y-4">
      <Section title="Letters">
        <div>
          <Label htmlFor="name-text" className="text-xs font-semibold">One key for each letter</Label>
          <Input id="name-text" value={n.text} maxLength={config.maxKeys} autoComplete="off" onChange={(e) => set({ text: e.target.value.replace(/\s+/g, "").slice(0, config.maxKeys) }, "name-text")} />
          <p className="mt-1 text-[11px] text-muted-foreground">Up to {config.maxKeys} keys. {keys.length} now. {config.keyCents > 0 ? `Each key after the first adds ${formatPHP(config.keyCents)}.` : ""}</p>
        </div>
        <FontPicker fonts={NAME_FONT_IDS} value={n.font} sample={n.text.slice(0, 6) || "ABC"} label="Font" onChange={(font) => set({ font })} />
        <Slider id="letter-size" label="Letter size" value={n.letterSize} min={4} max={14} step={0.5} onChange={(v) => set({ letterSize: v }, "letter-size")} />
      </Section>
      <Section title="Layout">
        <Slider id="per-row" label="Keys in a row" value={Math.min(n.perRow, Math.max(1, keys.length))} min={1} max={Math.max(1, Math.min(config.maxKeys, keys.length || 1))} unit="" onChange={(v) => set({ perRow: Math.round(v) }, "per-row")} hint="Fewer keys per row makes a shorter, taller clicker." />
        <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs" role="status">
          Base {layout.baseSize[0].toFixed(1)} × {layout.baseSize[1].toFixed(1)} mm · {layout.totalHeight.toFixed(1)} mm tall
        </p>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------
// Keyring
// ---------------------------------------------------------------------------------------------------------------------

export function KeyringPanel({ spec, edit, config, layout }: Common & { layout: Layout }) {
  const k = spec.keyring;
  const set = (p: Partial<ClickerSpec["keyring"]>, key?: string) => edit((s) => ({ ...s, keyring: { ...s.keyring, ...p } }), key);
  return (
    <div className="space-y-5">
      <Section title="Keyring tab">
        <Toggle id="keyring" label="Add a tab with a hole for a keyring" on={k.on} onChange={(on) => set({ on })} />
        {config.keyringCents > 0 && k.on && <p className="text-xs text-muted-foreground">Adds {formatPHP(config.keyringCents)}.</p>}
        {k.on && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Where the tab goes">
              {[["Top", 90], ["Right", 0], ["Bottom", -90], ["Left", 180], ["Top right", 45], ["Top left", 135]].map(([name, angle]) => (
                <Button key={name} type="button" size="sm" variant={Math.round(k.angle) === angle ? "default" : "outline"} aria-pressed={Math.round(k.angle) === angle} onClick={() => set({ angle: angle as number })}>
                  {name}
                </Button>
              ))}
            </div>
            <Slider id="kangle" label="Where it sits round the base" value={((k.angle + 540) % 360) - 180} min={-180} max={180} unit="°" onChange={(v) => set({ angle: v }, "kangle")} hint="Or switch on “Move” above the clicker and drag the ring." />
            <Slider id="khole" label="Hole size" value={k.hole} min={2} max={9} step={0.5} onChange={(v) => set({ hole: v }, "khole")} hint="4 to 5 mm fits most keyrings and cords." />
            <Slider id="kwall" label="Strength of the loop" value={k.wall} min={LIMITS.minKeyringWallMm} max={5} step={0.1} onChange={(v) => set({ wall: v }, "kwall")} hint="The material round the hole." />
            {layout.warnings.filter((w) => /keyring/i.test(w)).map((w) => <p key={w} role="status" className="text-xs text-amber-700">{w}</p>)}
          </div>
        )}
      </Section>
    </div>
  );
}
