"use client";

/**
 * Admin → AI studio. Upload a model and photos of the real print, let the AI draft the copy and marketing images, edit
 * everything, then approve: only then is a (draft, unpublished) product created.
 */

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Box, Check, ImagePlus, Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/shell/ui";
import { uploadToS3 } from "@/lib/upload-client";
import { MAX_IMAGES_PER_DRAFT, SCENES, SCENE_LABEL, type DraftPayload, type ProductCopy, type Scene } from "@/lib/ai/draft-types";
import { createProductFromDraftAction, discardDraftAction, generateCopyAction, generateImageAction, removeImageAction, saveDraftAction, startDraftAction } from "@/app/(admin)/admin/ai/actions";

type Current = { id: string; status: string; payload: DraftPayload; urls: Record<string, string> };
type Ready = { copy: boolean; imagesKey: boolean };

export function AiStudio({ current, ready }: { current: Current | null; ready: Ready }) {
  return current ? <Draft current={current} ready={ready} /> : <Upload ready={ready} />;
}

// ---- step 1: upload -----------------------------------------------------------------------------------------------

function Upload({ ready }: { ready: Ready }) {
  const router = useRouter();
  const model = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  async function start() {
    if (!modelFile) return;
    setBusy(true);
    try {
      const modelKey = await uploadToS3("model", modelFile);
      const photoKeys: string[] = [];
      for (const f of photoFiles) photoKeys.push(await uploadToS3("photo", f));
      const r = await startDraftAction({ modelKey, photoKeys, notes });
      if (!r.ok) throw new Error(r.error);
      router.push(`/admin/ai?draft=${r.id}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
      setBusy(false);
    }
  }

  return (
    <Panel title="New product from a model" description="Step 1: the files. The photos of the real print are what the AI uses to make the marketing images.">
      <div className="space-y-4">
        {!ready.copy && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">No writing model chosen yet. <Link className="underline" href="/admin/ai/settings">Open AI settings</Link> first.</p>}
        <div className="space-y-1">
          <Label>3D model (3MF or STL)</Label>
          <div className="flex items-center gap-3">
            <input ref={model} type="file" accept=".stl,.3mf" className="hidden" onChange={(e) => setModelFile(e.target.files?.[0] ?? null)} />
            <Button type="button" variant="outline" onClick={() => model.current?.click()}><Box className="mr-2 size-4" />{modelFile ? "Change file" : "Choose file"}</Button>
            <span className="font-mono text-xs">{modelFile?.name ?? "none"}</span>
          </div>
        </div>
        <div className="space-y-1">
          <Label>Photos of the real print (up to 6; 1 to 3 is plenty)</Label>
          <div className="flex items-center gap-3">
            <input ref={photos} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => setPhotoFiles(Array.from(e.target.files ?? []).slice(0, 6))} />
            <Button type="button" variant="outline" onClick={() => photos.current?.click()}><ImagePlus className="mr-2 size-4" />Choose photos</Button>
            <span className="text-xs">{photoFiles.length ? `${photoFiles.length} selected` : "none (the copy still works, but images need photos)"}</span>
          </div>
          {!ready.imagesKey && <p className="text-xs text-destructive">Images need an OpenRouter key in AI settings.</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="notes">Notes for the writer (optional)</Label>
          <Textarea id="notes" rows={3} maxLength={1500} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Material, who it is for, what it is used for, anything true that should be in the listing. Only facts you give here are used." />
        </div>
        <Button onClick={start} disabled={!modelFile || busy}>{busy ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}{busy ? "Uploading…" : "Upload and continue"}</Button>
      </div>
    </Panel>
  );
}

// ---- step 2 to 4: copy, images, approve ---------------------------------------------------------------------------

const emptyCopy: ProductCopy = { name: "", tagline: "", description: "", highlights: [], tags: [], category: "general", seoTitle: "", metaDescription: "" };

function Draft({ current, ready }: { current: Current; ready: Ready }) {
  const router = useRouter();
  const { id, payload, urls } = current;
  const [copy, setCopy] = useState<ProductCopy>(payload.copy ?? emptyCopy);
  const [price, setPrice] = useState(payload.price);
  const [direction, setDirection] = useState("");
  const [extra, setExtra] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const aiKeys = payload.images.map((i) => i.key);
  const allKeys = [...aiKeys, ...payload.photoKeys];
  const [chosen, setChosen] = useState<Set<string>>(new Set(allKeys));
  const hasCopy = Boolean(payload.copy) || copy.name.length > 0;
  const f = payload.facts;

  const toggle = (k: string) => setChosen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setList = (key: "highlights" | "tags") => (v: string) => setCopy((c) => ({ ...c, [key]: v.split(key === "tags" ? "," : "\n").map((x) => x.trim()).filter(Boolean) }));

  async function run<T>(label: string, fn: () => Promise<{ ok: true } & T | { ok: false; error: string }>, then?: (r: { ok: true } & T) => void) {
    setBusy(label);
    try {
      const r = await fn();
      if (r.ok) then?.(r); else toast.error(r.error);
    } finally { setBusy(null); }
  }

  const genCopy = () => run("copy", () => generateCopyAction({ draftId: id, direction: direction || undefined }), (r) => { const c = (r as unknown as { copy: ProductCopy }).copy; setCopy(c); toast.success("Copy drafted. Edit anything you like."); router.refresh(); });
  const genImage = (scene: Scene) => run(`img-${scene}`, () => generateImageAction({ draftId: id, scene, extra }), (r) => { const key = (r as unknown as { key: string }).key; setChosen((s) => new Set(s).add(key)); toast.success("Image made"); router.refresh(); });
  const save = () => run("save", () => saveDraftAction({ draftId: id, copy, price }), () => toast.success("Saved"));
  const removeImg = (key: string) => run(`rm-${key}`, () => removeImageAction({ draftId: id, key }), () => { setChosen((s) => { const n = new Set(s); n.delete(key); return n; }); router.refresh(); });
  const approve = async () => {
    const saved = await saveDraftAction({ draftId: id, copy, price });
    if (!saved.ok) return toast.error(saved.error);
    await run("create", () => createProductFromDraftAction({ draftId: id, photoKeys: allKeys.filter((k) => chosen.has(k)) }), (r) => {
      const { productId: pid, warnings } = r as unknown as { productId: string; warnings: string[] };
      if (warnings.length) toast.warning(`Product created, but: ${warnings.join("; ")}. Fix it in the product editor.`, { duration: 15000 });
      else toast.success("Product created as a draft.");
      router.push(`/admin/products/${pid}`);
    });
  };
  const discard = () => { if (confirm("Discard this draft and delete its uploaded files?")) run("discard", () => discardDraftAction({ draftId: id }), () => router.push("/admin/ai")); };

  const input = "w-full";
  return (
    <div className="space-y-4">
      <Panel title="1. The file" description="Read from the upload. The copy only uses these facts and your notes.">
        <p className="text-sm"><span className="font-mono text-xs">{f.fileName}</span> · {f.format.toUpperCase()}{f.sizeMm ? ` · ${f.sizeMm.join(" × ")} mm` : " · size could not be read"}{f.filaments.length ? ` · ${f.filaments.length} filament colour(s)` : ""}{payload.costUsd > 0 ? ` · AI spend on this draft: $${payload.costUsd.toFixed(2)}` : ""}</p>
        {payload.notes && <p className="mt-1 text-xs text-muted-foreground">Notes: {payload.notes}</p>}
      </Panel>

      <Panel title="2. Marketing copy" actions={<Button size="sm" onClick={genCopy} disabled={busy !== null || !ready.copy}>{busy === "copy" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}{hasCopy ? "Rewrite" : "Write copy"}</Button>}>
        <div className="space-y-3">
          {!ready.copy && <p className="text-sm text-destructive">Choose a writing model in <Link className="underline" href="/admin/ai/settings">AI settings</Link>.</p>}
          <div className="space-y-1"><Label htmlFor="dir">Direction for the writer (optional)</Label><Input id="dir" className={input} value={direction} maxLength={400} onChange={(e) => setDirection(e.target.value)} placeholder="e.g. shorter, more playful, aimed at students" /></div>
          {hasCopy && (
            <div className="grid gap-3">
              <div className="space-y-1"><Label htmlFor="n">Name</Label><Input id="n" className={input} maxLength={80} value={copy.name} onChange={(e) => setCopy({ ...copy, name: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="t">Tagline</Label><Input id="t" className={input} maxLength={140} value={copy.tagline} onChange={(e) => setCopy({ ...copy, tagline: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="d">Description</Label><Textarea id="d" rows={6} maxLength={1500} value={copy.description} onChange={(e) => setCopy({ ...copy, description: e.target.value })} /></div>
              <div className="space-y-1"><Label htmlFor="h">Highlights (one per line)</Label><Textarea id="h" rows={4} value={copy.highlights.join("\n")} onChange={(e) => setList("highlights")(e.target.value)} /></div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1"><Label htmlFor="c">Category</Label><Input id="c" className={input} maxLength={40} value={copy.category} onChange={(e) => setCopy({ ...copy, category: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor="tg">Tags (comma separated)</Label><Input id="tg" className={input} value={copy.tags.join(", ")} onChange={(e) => setList("tags")(e.target.value)} /></div>
                <div className="space-y-1"><Label htmlFor="st">SEO title</Label><Input id="st" className={input} maxLength={70} value={copy.seoTitle} onChange={(e) => setCopy({ ...copy, seoTitle: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor="md">Meta description</Label><Input id="md" className={input} maxLength={170} value={copy.metaDescription} onChange={(e) => setCopy({ ...copy, metaDescription: e.target.value })} /></div>
              </div>
            </div>
          )}
        </div>
      </Panel>

      <Panel title="3. Pictures" description={`AI images are made from your real photos and are labelled AI. Keep at least one real photo in the listing. Up to ${MAX_IMAGES_PER_DRAFT} AI images per draft (about $0.06 each).`}>
        <div className="space-y-3">
          <div className="space-y-1"><Label htmlFor="ex">Extra direction for the next image (optional)</Label><Input id="ex" className={input} maxLength={300} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="e.g. on a student's desk, warm light" /></div>
          <div className="flex flex-wrap gap-2">
            {SCENES.map((s) => (
              <Button key={s} size="sm" variant="outline" disabled={busy !== null || !ready.imagesKey || !payload.photoKeys.length || aiKeys.length >= MAX_IMAGES_PER_DRAFT} onClick={() => genImage(s)}>
                {busy === `img-${s}` ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Sparkles className="mr-2 size-4" />}{SCENE_LABEL[s]}
              </Button>
            ))}
          </div>
          {!payload.photoKeys.length && <p className="text-xs text-destructive">No real photos were uploaded, so images cannot be made.</p>}
          {!ready.imagesKey && <p className="text-xs text-destructive">Add an OpenRouter key in AI settings to make images.</p>}
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {allKeys.map((k) => {
              const ai = aiKeys.includes(k);
              return (
                <li key={k} className="space-y-1 rounded-md border p-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={urls[k]} alt={ai ? "AI image" : "Real photo"} className="aspect-square w-full rounded object-cover" />
                  <div className="flex items-center justify-between gap-1 text-xs">
                    <label className="flex items-center gap-1"><input type="checkbox" checked={chosen.has(k)} onChange={() => toggle(k)} />{ai ? "AI" : "Real"}</label>
                    {ai && <button type="button" aria-label="Remove image" className="text-muted-foreground hover:text-destructive" disabled={busy !== null} onClick={() => removeImg(k)}><Trash2 className="size-3.5" /></button>}
                  </div>
                </li>
              );
            })}
          </ul>
          {!allKeys.some((k) => chosen.has(k) && !aiKeys.includes(k)) && allKeys.length > 0 && <p className="text-xs text-amber-700">No real photo is ticked. Keep at least one so buyers see the actual print.</p>}
        </div>
      </Panel>

      <Panel title="4. Approve" description="Creates the product as an unpublished draft with the 3D model and the ticked pictures. You can still edit it, then publish.">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1"><Label htmlFor="p">Price (₱)</Label><Input id="p" inputMode="decimal" className="w-36" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 249" /></div>
          <Button variant="outline" onClick={save} disabled={busy !== null || !hasCopy}>Save draft</Button>
          <Button onClick={approve} disabled={busy !== null || !hasCopy || !price.trim()}>{busy === "create" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}Approve and create product</Button>
          <Button variant="ghost" onClick={discard} disabled={busy !== null}><Trash2 className="mr-2 size-4" />Discard</Button>
        </div>
      </Panel>
    </div>
  );
}
