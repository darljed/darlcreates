"use client";
/* eslint-disable @next/next/no-img-element */

/**
 * Product studio → "AI images" tab: one-click pictures from presets. Chips pick the preset (Cover overlays the
 * product's name; the others keep the real product unchanged), the direction line adds the owner's own words, and every
 * picture lands in the gallery with its preset, model, cost and on/off-the-product state. The tiles' toggle decides
 * what customers see; nothing reaches the shop until a picture is on the product.
 */

import { useState } from "react";
import { toast } from "sonner";
import { Crown, EyeOff, Loader2, ImageIcon, RefreshCw, Trash2, Type, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/shell/ui";
import { selectClass } from "@/components/workshop/estimator-helpers";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/confirm-provider";
import { GENERATE_SET, IMAGE_PRESETS, IMAGE_PRESET_HINT, IMAGE_PRESET_LABEL, type ImagePreset } from "@/lib/ai/image-presets";
import type { GalleryImage } from "@/lib/ai/image-studio";
import { generateImageAction, generateSetAction, imageAltAction, imageCoverAction, imageDeleteAction, imageOnProductAction } from "@/app/(admin)/admin/ai/image-actions";

const MODEL_NAME = (id: string) => id.split("/").pop() ?? id;
/** AI spend is USD; tiny per-image costs need decimals. */
const usd = (v: number) => (v >= 0.01 ? `$${v.toFixed(2)}` : `$${v.toFixed(4)}`);

export function ImageGalleryPanel({ productId, gallery, photoCount, imageModels, defaultImageModel, ready }: {
  productId: string;
  gallery: GalleryImage[];
  /** Real photos the generator uses as its base. */
  photoCount: number;
  imageModels: { id: string; name?: string; vision?: boolean }[];
  defaultImageModel: string;
  ready: { openrouterKey: boolean };
}) {
  const confirm = useConfirm();
  const [rows, setRows] = useState<GalleryImage[]>(gallery);
  const [model, setModel] = useState(defaultImageModel);
  const [preset, setPreset] = useState<ImagePreset>("studio");
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const total = rows.reduce((s, r) => s + r.costUsd, 0);
  const models = imageModels.length ? imageModels : [{ id: defaultImageModel, vision: true }];

  async function generate(p: ImagePreset, dir = direction, m = model) {
    if (busy) return false;
    setBusy("generate");
    try {
      const r = await generateImageAction({ productId, preset: p, direction: dir, model: m });
      if (!r.ok) { toast.error(r.error); return false; }
      setRows((x) => [r.image, ...x]);
      toast.success(`${IMAGE_PRESET_LABEL[p]} added (${usd(r.costUsd)}).`);
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function generateSet() {
    if (busy) return;
    setBusy("set");
    try {
      const r = await generateSetAction({ productId, model });
      if (!r.ok) { toast.error(r.error); return; }
      setRows((x) => [...r.images, ...x]);
      toast.success(r.failures.length ? `${r.images.length} of ${GENERATE_SET.length} made (${usd(r.costUsd)}). ${r.failures.join(" ")}` : `Cover, Studio and Lifestyle made (${usd(r.costUsd)}).`);
    } finally {
      setBusy(null);
    }
  }

  async function toggle(g: GalleryImage, on: boolean) {
    setBusy(g.id);
    try {
      const r = await imageOnProductAction({ imageId: g.id, on });
      if (!r.ok) { toast.error(r.error); return; }
      setRows((x) => x.map((t) => (t.id === g.id ? r.image : t)));
      toast.success(on ? "On the product." : "Off the product (kept here).");
    } finally {
      setBusy(null);
    }
  }

  async function makeCover(g: GalleryImage) {
    setBusy(g.id);
    try {
      const r = await imageCoverAction({ imageId: g.id });
      if (!r.ok) { toast.error(r.error); return; }
      setRows((x) => x.map((t) => (t.id === g.id ? r.image : t)));
      toast.success("It is the cover now (the shop thumbnail).");
    } finally {
      setBusy(null);
    }
  }

  async function writeAlt(g: GalleryImage) {
    setBusy(`alt:${g.id}`);
    try {
      const r = await imageAltAction({ imageId: g.id });
      if (!r.ok) { toast.error(r.error); return; }
      setRows((x) => x.map((t) => (t.id === g.id ? { ...t, alt: r.alt } : t)));
      toast.success("Alt text saved.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(g: GalleryImage) {
    if (!(await confirm({ title: "Delete this picture?", description: "It leaves the gallery and the file goes away. Only while it is off the product.", confirmLabel: "Delete", destructive: true }))) return;
    setBusy(g.id);
    try {
      const r = await imageDeleteAction({ imageId: g.id });
      if (!r.ok) { toast.error(r.error); return; }
      setRows((x) => x.filter((t) => t.id !== g.id));
      toast.success("Deleted.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel title="AI images" description={`Made from this product's ${photoCount} real photo${photoCount === 1 ? "" : "s"}. A picture reaches the shop only when it is on the product; the cover is the shop thumbnail.`}>
      {/* the generator: presets on one row, direction + controls on the next */}
      <div className="flex flex-wrap gap-1.5">
        {IMAGE_PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPreset(p)}
            aria-pressed={preset === p}
            className={cn("rounded-md border px-2.5 py-1 text-sm font-medium", preset === p ? "border-foreground bg-foreground text-background" : "hover:bg-muted")}
          >
            {IMAGE_PRESET_LABEL[p]}
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-muted-foreground" title="Spend recorded on this product's generated pictures">{rows.length} · {usd(total)}</span>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground">{IMAGE_PRESET_HINT[preset]}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Input
          className="h-9 min-w-40 flex-1"
          maxLength={400}
          placeholder={preset === "custom" ? "Describe the shot for the AI…" : "Extra direction (optional) — e.g. warm morning light"}
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void generate(preset); }}
          aria-label="Extra direction for the AI"
        />
        <select
          aria-label="Image model"
          title="The image model that draws the pictures"
          className={cn(selectClass, "h-9 w-44 shrink-0")}
          value={model}
          onChange={(e) => setModel(e.target.value)}
        >
          {!models.some((m) => m.id === model) && <option value={model}>{MODEL_NAME(model)} (current)</option>}
          {models.map((m) => <option key={m.id} value={m.id}>{m.name || MODEL_NAME(m.id)}{m.vision === false ? " — no photo input" : ""}{m.id === defaultImageModel ? " · default" : ""}</option>)}
        </select>
        <Button className="shrink-0" disabled={Boolean(busy) || !ready.openrouterKey} onClick={() => generate(preset)}>
          {busy === "generate" ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <Wand2 className="mr-2 size-4" aria-hidden />}
          {busy === "generate" ? "Generating…" : `Generate ${IMAGE_PRESET_LABEL[preset]}`}
        </Button>
        <Button variant="outline" className="shrink-0" disabled={Boolean(busy) || !ready.openrouterKey} onClick={generateSet} title="Cover + Studio + Lifestyle in one go">
          {busy === "set" ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : <ImageIcon className="mr-2 size-4" aria-hidden />}
          Generate set
        </Button>
      </div>
      {!ready.openrouterKey && <p className="mt-2 text-xs text-amber-700">Add the OpenRouter key in AI settings first.</p>}
      {photoCount === 0 && <p className="mt-2 text-xs text-amber-700">No real photos on this product yet. Add one (attach it in the chat or the product editor) — these models redraw the real product, so they need one.</p>}

      {/* the gallery */}
      <div className="mt-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing generated yet. Start with the Studio preset, or press Generate set for a cover, studio and lifestyle shot in one go.</p>
        ) : (
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map((g) => {
              const state = g.onProduct ? (g.onProduct.hidden ? "off" : "on") : null;
              const isCover = state === "on" && g.onProduct!.sort === 0;
              const busyTile = busy === g.id || busy === `alt:${g.id}`;
              const label = IMAGE_PRESET_LABEL[g.preset as ImagePreset] ?? g.preset;
              return (
                <li key={g.id} className="space-y-1 rounded-md border p-1.5">
                  <a href={g.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded">
                    <img src={g.url} alt={g.alt || `${label} of the product`} className="aspect-square w-full bg-muted object-cover" loading="lazy" />
                  </a>
                  <div className="flex items-center justify-between gap-1 text-xs">
                    <span className="truncate font-medium" title={`${label} · ${MODEL_NAME(g.model)}${g.costUsd ? ` · ${usd(g.costUsd)}` : ""}`}>
                      {label}
                      {isCover ? <span className="ml-1 rounded bg-foreground px-1 py-px text-[10px] font-semibold text-background">cover</span>
                        : state === "on" ? <span className="ml-1 rounded bg-green-700/10 px-1 py-px text-[10px] font-semibold text-green-800">on</span>
                        : state === "off" ? <span className="ml-1 rounded bg-amber-600/10 px-1 py-px text-[10px] font-semibold text-amber-800">off</span>
                        : null}
                    </span>
                    <span className="flex items-center gap-1">
                      <button type="button" aria-label={state === "on" ? "Remove from the product" : "Add to the product"} title={state === "on" ? "Take it off the shop (kept here)" : "Put it on the product"} disabled={busyTile} onClick={() => toggle(g, state !== "on")} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
                        {state === "on" ? <EyeOff className="size-3.5" /> : <ImageIcon className="size-3.5" />}
                      </button>
                      <button type="button" aria-label="Make the cover" title={state !== "on" ? "Put it on the product first" : "The cover is the shop's first picture"} disabled={busyTile || state !== "on"} onClick={() => makeCover(g)} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
                        <Crown className="size-3.5" />
                      </button>
                      <button type="button" aria-label="Generate another like this" title={`Generate another ${label.toLowerCase()} shot (same model)`} disabled={busyTile} onClick={() => generate(g.preset as ImagePreset, g.direction, g.model)} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
                        <RefreshCw className="size-3.5" />
                      </button>
                      <button type="button" aria-label="Write alt text" title="One alt sentence from the AI" disabled={busyTile} onClick={() => writeAlt(g)} className="text-muted-foreground hover:text-foreground disabled:opacity-40">
                        {busy === `alt:${g.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <Type className="size-3.5" />}
                      </button>
                      {state === null && (
                        <button type="button" aria-label="Delete this picture" title="Delete it (only while it is off the product)" disabled={busyTile} onClick={() => remove(g)} className="text-muted-foreground hover:text-destructive disabled:opacity-40">
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </div>
                  {g.alt && <p className="truncate text-xs text-muted-foreground" title={g.alt}>{g.alt}</p>}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Panel>
  );
}
