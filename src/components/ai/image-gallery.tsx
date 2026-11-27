"use client";
/* eslint-disable @next/next/no-img-element */

/**
 * Admin → AI → Image gallery: one-click AI pictures per product. Pick a product, press a preset chip (or "Generate set"
 * for Cover + Studio + Lifestyle), and the picture lands in the gallery as it is made. Each tile: on/off the product,
 * make-cover, alt text, regenerate, delete (only while off). The product editor's photos are this page's "on product".
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Crown, EyeOff, Loader2, ImageIcon, RefreshCw, Trash2, Type, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

export function ImageGallery({ products, productId, gallery, photoCount, imageModels, defaultImageModel, ready }: {
  products: { id: string; name: string }[];
  productId: string | null;
  gallery: GalleryImage[];
  /** Real photos the generator uses as its base. */
  photoCount: number;
  imageModels: { id: string; vision?: boolean }[];
  defaultImageModel: string;
  ready: { openrouterKey: boolean };
}) {
  const router = useRouter();
  const confirm = useConfirm();
  const [rows, setRows] = useState<GalleryImage[]>(gallery);
  const [model, setModel] = useState(defaultImageModel);
  const [preset, setPreset] = useState<ImagePreset>("studio");
  const [direction, setDirection] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const name = products.find((p) => p.id === productId)?.name ?? null;
  const total = rows.reduce((s, r) => s + r.costUsd, 0);
  const models = imageModels.length ? imageModels : [{ id: defaultImageModel, vision: true }];

  async function generate(p: ImagePreset, dir = direction, m = model) {
    if (!productId || busy) return false;
    setBusy("generate");
    try {
      const r = await generateImageAction({ productId, preset: p, direction: dir, model: m });
      if (!r.ok) { toast.error(r.error); return false; }
      setRows((x) => [r.image, ...x]);
      toast.success(`${IMAGE_PRESET_LABEL[p]} added to the gallery (${usd(r.costUsd)}).`);
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function generateSet() {
    if (!productId || busy) return;
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
      router.refresh();
      toast.success(on ? "On the product." : "Off the product (still here in the gallery).");
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
      toast.success("It is the cover now (first picture in the shop).");
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

  if (!productId) {
    return (
      <Panel title="Pick a product">
        {products.length ? (
          <p className="text-sm text-muted-foreground">
            Choose a product below to see its pictures.{" "}
            <select className={selectClass} defaultValue="" onChange={(e) => e.target.value && router.push(`/admin/ai/images?product=${e.target.value}`)}>
              <option value="">Choose a product…</option>
              {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No products yet — make one in the <Link className="underline" href="/admin/ai">Product studio</Link>.</p>
        )}
      </Panel>
    );
  }

  return (
    <div className="space-y-3">
      <Panel title={name ?? "Generate pictures"}>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Label htmlFor="ig-model" className="text-xs text-muted-foreground">Image model</Label>
          <select id="ig-model" className={selectClass} value={model} onChange={(e) => setModel(e.target.value)}>
            {models.map((m) => <option key={m.id} value={m.id}>{MODEL_NAME(m.id)}{m.vision === false ? " (no photo input)" : ""}</option>)}
          </select>
          {photoCount === 0 && <span className="text-xs text-amber-700">No real photos on this product yet — only prompt-only models can generate until one is added.</span>}
          <span className="ml-auto text-xs text-muted-foreground">{rows.length} picture{rows.length === 1 ? "" : "s"} · generated spend {usd(total)}</span>
        </div>
        {!ready.openrouterKey && <p className="mt-2 text-xs text-amber-700">Add the OpenRouter key in <Link className="underline" href="/admin/ai/settings">AI settings</Link> first.</p>}
        <div className="mt-3 flex flex-wrap gap-2">
          {IMAGE_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              title={IMAGE_PRESET_HINT[p]}
              className={cn("rounded-md border px-3 py-1.5 text-sm font-medium", preset === p ? "border-foreground bg-foreground text-background" : "hover:bg-muted/60")}
            >
              {IMAGE_PRESET_LABEL[p]}
            </button>
          ))}
          <Button className="ml-auto" disabled={Boolean(busy) || !ready.openrouterKey} onClick={() => generate(preset)}>
            {busy === "generate" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wand2 className="size-4" aria-hidden />}
            {busy === "generate" ? "Generating…" : `Generate ${IMAGE_PRESET_LABEL[preset]}`}
          </Button>
          <Button variant="outline" disabled={Boolean(busy) || !ready.openrouterKey} onClick={generateSet} title="Cover + Studio + Lifestyle in one go">
            {busy === "set" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ImageIcon className="size-4" aria-hidden />}
            Generate set
          </Button>
        </div>
        <div className="mt-2">
          <Label htmlFor="ig-direction" className="text-xs text-muted-foreground">Extra direction (optional)</Label>
          <Textarea id="ig-direction" className="mt-1 min-h-16" maxLength={400} placeholder='e.g. "warm morning light, next to pickleball gear"' value={direction} onChange={(e) => setDirection(e.target.value)} />
        </div>
      </Panel>

      <Panel title="Generated pictures">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing generated yet. Start with the Studio preset, or press Generate set for a cover, studio and lifestyle shot in one go.</p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {rows.map((g) => {
              const state = g.onProduct ? (g.onProduct.hidden ? "off" : "on") : null;
              const isCover = g.onProduct && !g.onProduct.hidden && g.onProduct.sort === 0;
              const busyTile = busy === g.id || busy === `alt:${g.id}`;
              return (
                <figure key={g.id} className="group relative flex flex-col gap-1.5 rounded-lg border p-2">
                  <a href={g.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md">
                    <img src={g.url} alt={g.alt || `${IMAGE_PRESET_LABEL[g.preset as ImagePreset] ?? g.preset} of ${name ?? "the product"}`} className="aspect-square w-full bg-muted object-cover" loading="lazy" />
                  </a>
                  <figcaption className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                    <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-foreground">{IMAGE_PRESET_LABEL[g.preset as ImagePreset] ?? g.preset}</span>
                    <span>{MODEL_NAME(g.model)}</span>
                    {g.costUsd > 0 && <span>{usd(g.costUsd)}</span>}
                    {isCover && <span className="rounded bg-foreground px-1.5 py-0.5 font-medium text-background">Cover</span>}
                    {state === "on" && !isCover && <span className="rounded bg-green-700/10 px-1.5 py-0.5 font-medium text-green-800">On product</span>}
                    {state === "off" && <span className="rounded bg-amber-600/10 px-1.5 py-0.5 font-medium text-amber-800">Off</span>}
                  </figcaption>
                  {g.alt && <p className="text-xs text-muted-foreground">{g.alt}</p>}
                  <div className="mt-auto flex flex-wrap gap-1 pt-1">
                    <Button size="sm" variant={state === "on" ? "secondary" : "outline"} disabled={busyTile} onClick={() => toggle(g, state !== "on")} title={state === "on" ? "Hide it from the shop (it stays here)" : "Show it on the product"}>
                      {state === "on" ? <EyeOff className="size-3.5" aria-hidden /> : <ImageIcon className="size-3.5" aria-hidden />}
                      {state === "on" ? "Remove" : "Add"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyTile || !g.onProduct} onClick={() => makeCover(g)} title="Make it the product's cover">
                      <Crown className="size-3.5" aria-hidden />
                      Cover
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyTile} onClick={() => generate(g.preset as ImagePreset, g.direction, g.model)} title="Generate another one like it">
                      <RefreshCw className="size-3.5" aria-hidden />
                    </Button>
                    <Button size="sm" variant="outline" disabled={busyTile} onClick={() => writeAlt(g)} title="Write a short alt text with AI">
                      <Type className="size-3.5" aria-hidden />
                    </Button>
                    {state === null && (
                      <Button size="sm" variant="ghost" disabled={busyTile} onClick={() => remove(g)} title="Delete this picture (only while it is off the product)">
                        <Trash2 className="size-3.5" aria-hidden />
                      </Button>
                    )}
                  </div>
                </figure>
              );
            })}
          </div>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          Every picture is generated from the product&apos;s {photoCount} real photo{photoCount === 1 ? "" : "s"} with the chosen image model. It only appears in the shop once you add it to the product here or in the product editor.
        </p>
      </Panel>
    </div>
  );
}
