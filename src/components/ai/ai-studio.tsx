"use client";
/* eslint-disable @next/next/no-img-element */

/**
 * Admin → Product studio: ONE chat per product with a product partner. It writes the listing (copy, tags, price), makes
 * mockups from the real photos with the image model picked in the message box, and, once the product exists, proposes its
 * ready-made designs and options as cards to approve. The right side is the review panel: the listing and pictures (applied
 * with "Create product" / "Apply to product") and, for an existing product, its designs with a 3D preview.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Box, Check, ExternalLink, ImagePlus, Loader2, Send, Settings, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Panel } from "@/components/shell/ui";
import { StlViewer } from "@/components/three/stl-viewer-lazy";
import { selectClass } from "@/components/workshop/estimator-helpers";
import { Diff } from "@/components/ai/agent-dock";
import { uploadToS3 } from "@/lib/upload-client";
import { cn } from "@/lib/utils";
import { partColorsFor, wholeModelColor } from "@/lib/part-colors";
import { MAX_IMAGES_PER_DRAFT, MAX_PHOTOS_PER_DRAFT, type ProductCopy } from "@/lib/ai/draft-types";
import type { ConfigSelection, ProductOptionInput } from "@/lib/pricing";
import type { ModelInfo } from "@/lib/ai/providers";
import type { ProposalView, Snapshot } from "@/lib/ai/studio";
import type { GalleryImage } from "@/lib/ai/image-studio";
import { ImageGalleryPanel } from "@/components/ai/image-gallery";
import { applyDraftAction, discardDraftAction, removeImageAction, saveDraftAction, studioSendAction, studioSnapshotAction } from "@/app/(admin)/admin/ai/actions";
import { approveProposalAction, rejectProposalAction } from "@/app/(admin)/admin/agent/actions";
import { useConfirm } from "@/components/confirm-provider";

type Ready = { copy: boolean; imagesKey: boolean };
/** The chat's product as it is now (from the server; refreshed after every approval). */
export type StudioProduct = {
  id: string;
  name: string;
  status: string;
  modelUrl: string | null;
  designModeLabel: string;
  options: ProductOptionInput[];
  presets: { id: string; name: string; active: boolean; available: boolean; missing: string[]; swatches: { label: string; hex: string }[]; selection: ConfigSelection }[];
};

const emptyCopy: ProductCopy = { name: "", tagline: "", description: "", highlights: [], tags: [], category: "general", seoTitle: "", metaDescription: "" };
const IDEAS_NEW = ["Write the product listing", "Make a clean hero mockup", "Make a lifestyle mockup on a desk", "What should this sell for?"];
const IDEAS_PRODUCT = ["Suggest 4 ready-made designs that look good together", "Let customers choose a design or their own colours", "Is the price healthy for its cost?", "Improve the listing", "Make a lifestyle mockup"];
const shortModel = (id: string) => id.split("/").pop() ?? id;
const keysOf = (s: Snapshot | null) => (s ? [...s.payload.images.map((i) => i.key), ...s.payload.photoKeys] : []);

export function AiStudio({ current, productId, product, products, ready, imageModels, defaultImageModel, chatModel, gallery, realPhotoCount: realPhotos }: {
  current: Snapshot | null;
  /** The product this chat is for (an existing product with no chat yet has `current` null). */
  productId: string | null;
  product: StudioProduct | null;
  products: { id: string; name: string }[];
  ready: Ready;
  imageModels: ModelInfo[];
  defaultImageModel: string;
  /** The model that runs the chat ("OpenRouter / google/…"), or null when none is chosen. */
  chatModel: string | null;
  /** The right-hand "AI images" tab: this product's generated pictures and how many real photos the generator uses. */
  gallery: GalleryImage[];
  realPhotoCount: number;
}) {
  const router = useRouter();
  const [snap, setSnap] = useState<Snapshot | null>(current);
  const [copy, setCopy] = useState<ProductCopy>(current?.payload.copy ?? emptyCopy);
  const [price, setPrice] = useState(current?.payload.price ?? "");
  const [chosen, setChosen] = useState<Set<string>>(() => new Set(keysOf(current).filter((k) => !current?.payload.attached.includes(k))));
  const [imageModel, setImageModel] = useState(defaultImageModel);
  const [text, setText] = useState("");
  const [photoFiles, setPhotoFiles] = useState<File[]>([]);
  const [modelFile, setModelFile] = useState<File | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cardBusy, setCardBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** What the right-hand review column shows: the listing and pictures, or the product's generated pictures. */
  const [rightTab, setRightTab] = useState<"proposal" | "images">("proposal");
  const photoInput = useRef<HTMLInputElement>(null);
  const modelInput = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const confirm = useConfirm();

  const payload = snap?.payload ?? null;
  const urls = snap?.urls ?? {};
  const linked = payload?.productId ?? productId;
  const hasCopy = copy.name.length > 0;
  const attached = new Set(payload?.attached ?? []);
  const aiKeys = (payload?.images ?? []).map((i) => i.key);
  const allKeys = keysOf(snap);
  const photoCount = (payload?.photoKeys.length ?? 0) + photoFiles.length;
  const dirty = Boolean(snap && hasCopy && JSON.stringify(copy) !== JSON.stringify(payload?.copy)) || Boolean(snap && price !== payload?.price);
  const newPictures = allKeys.filter((k) => chosen.has(k) && !attached.has(k));

  /** Take the draft the server sent back. A listing the assistant just wrote replaces the editor; new pictures are ticked. */
  function apply(next: Snapshot) {
    if (JSON.stringify(next.payload.copy) !== JSON.stringify(snap?.payload.copy)) setCopy(next.payload.copy ?? emptyCopy);
    if (next.payload.price !== snap?.payload.price) setPrice(next.payload.price);
    const before = new Set(keysOf(snap));
    setChosen((c) => { const n = new Set([...c].filter((k) => keysOf(next).includes(k) && !next.payload.attached.includes(k))); for (const k of keysOf(next)) if (!before.has(k) && !next.payload.attached.includes(k)) n.add(k); return n; });
    setSnap(next);
    if (!snap && !productId && !next.payload.productId) window.history.replaceState(null, "", `/admin/ai?draft=${next.id}`);
  }

  async function saveEdits(): Promise<boolean> {
    if (!snap || !hasCopy || !dirty) return true;
    const r = await saveDraftAction({ draftId: snap.id, copy, price });
    if (!r.ok) { toast.error(r.error); return false; }
    setSnap({ ...snap, payload: { ...snap.payload, copy, price } });
    return true;
  }

  async function send(override?: string) {
    const t = (override ?? text).trim();
    if (busy || (!t && !photoFiles.length && !modelFile)) return;
    setBusy("send");
    try {
      if (!(await saveEdits())) return;
      const photoKeys: string[] = [];
      for (const f of photoFiles) photoKeys.push(await uploadToS3("photo", f));
      const modelKey = modelFile ? await uploadToS3("model", modelFile) : null;
      const turnsBefore = snap?.payload.chat.length ?? 0;
      const r = await studioSendAction({ draftId: snap?.id ?? null, productId: snap ? null : productId, text: t, photoKeys, modelKey, imageModel });
      if (r.snapshot) apply(r.snapshot);
      // the message counts as sent once it is in the saved chat, even if the answer then failed
      if (r.ok || (r.snapshot && r.snapshot.payload.chat.length > turnsBefore)) { setText(""); setPhotoFiles([]); setModelFile(null); }
      if (!r.ok) toast.error(r.error);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Something went wrong");
    } finally { setBusy(null); }
  }

  async function decide(p: ProposalView, approve: boolean) {
    if (!snap) return;
    setCardBusy(p.id);
    try {
      const r = approve ? await approveProposalAction({ id: p.id }) : await rejectProposalAction({ id: p.id });
      if (!r.ok) toast.error(r.error);
      else if (approve) toast.success("Applied");
    } catch {
      toast.error("The connection failed. Reload the page and check whether it was applied before trying again.");
    } finally {
      const next = await studioSnapshotAction({ draftId: snap.id }).catch(() => null);
      if (next) setSnap(next);
      setCardBusy(null);
      router.refresh(); // the product panel on the right
    }
  }
  const waiting = Object.values(snap?.proposals ?? {}).filter((p) => p.status === "draft");
  async function approveAll() { for (const p of waiting) await decide(p, true); } // one by one: each is re-checked against what the previous one changed

  async function run<T>(label: string, fn: () => Promise<T>, then?: (r: T) => void) {
    setBusy(label);
    try { const r = await fn(); then?.(r); } finally { setBusy(null); }
  }
  const toggle = (k: string) => setChosen((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setList = (key: "highlights" | "tags") => (v: string) => setCopy((c) => ({ ...c, [key]: v.split(key === "tags" ? "," : "\n").map((x) => x.trim()).filter(Boolean) }));
  const removeImg = async (key: string) => {
    if (!snap) return;
    const mockup = aiKeys.includes(key);
    if (!(await confirm({ title: mockup ? "Delete this mockup?" : "Delete this photo?", description: mockup ? "It is removed from the chat and from storage." : "It is removed from the chat and from storage. Mockups already made from it stay.", confirmLabel: "Delete", destructive: true }))) return;
    void run(`rm-${key}`, () => removeImageAction({ draftId: snap.id, key }), (r) => { if (r.snapshot) apply(r.snapshot); if (!r.ok) toast.error(r.error); });
  };
  const save = () => run("save", saveEdits, (ok) => { if (ok && snap) toast.success("Saved"); });
  const applyIt = async () => {
    if (!snap) return;
    if (!(await saveEdits())) return;
    await run("apply", () => applyDraftAction({ draftId: snap.id, photoKeys: newPictures }), (r) => {
      if (!r.ok) return toast.error(r.error);
      if (r.snapshot) apply(r.snapshot);
      if (r.warnings.length) toast.warning(`Done, but: ${r.warnings.join("; ")}.`, { duration: 15000 });
      else toast.success(r.created ? "Product created as an unpublished draft. Keep chatting to set up its designs." : "Applied to the product.");
      if (r.created) router.replace(`/admin/ai?product=${r.productId}`);
      else router.refresh();
    });
  };
  const discard = async () => { if (snap && (await confirm(linked ? { title: "Close this chat?", description: "The product keeps everything already applied. Mockups not added to it are deleted.", confirmLabel: "Close chat", destructive: true } : { title: "Discard this chat?", description: "The chat and its uploaded photos, 3D file and mockups are deleted.", confirmLabel: "Discard chat", destructive: true }))) run("discard", () => discardDraftAction({ draftId: snap.id }), (r) => { if (r.ok) router.push("/admin/ai"); else toast.error(r.error); }); };

  const turns = payload?.chat ?? [];
  // keep the newest message (or the "Working on it" line) in view; only the chat box scrolls, not the page
  useEffect(() => {
    const el = log.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [turns.length, busy, cardBusy]);
  const imageInfo = imageModels.find((m) => m.id === imageModel);
  const shown = product?.presets.find((d) => d.id === preview && d.available) ?? null;
  const partColors = useMemo(() => (product ? partColorsFor(product.options, shown?.selection ?? {}) : {}), [product, shown]);
  const wholeColor = product ? (wholeModelColor(product.options, shown?.selection ?? {}) ?? "#9ca3af") : "#9ca3af";

  const card = (p: ProposalView) => (
    <div key={p.id} className="space-y-2 rounded-md border bg-muted/30 p-2.5 text-foreground">
      <p className="text-sm font-semibold">{p.summary}</p>
      <Diff p={p} />
      {p.status === "draft" && (
        <div className="flex gap-2">
          <Button size="sm" disabled={cardBusy !== null} onClick={() => decide(p, true)}>{cardBusy === p.id ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : <Check className="mr-1 size-3.5" />}Approve</Button>
          <Button size="sm" variant="outline" disabled={cardBusy !== null} onClick={() => decide(p, false)}><X className="mr-1 size-3.5" />Reject</Button>
        </div>
      )}
      {p.status === "applying" && <p className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Working…</p>}
      {p.status === "applied" && <p className="flex items-center gap-1 text-xs font-medium text-green-700"><Check className="size-3.5" />Applied</p>}
      {p.status === "rejected" && <p className="text-xs text-muted-foreground">Rejected. Nothing changed.</p>}
      {p.status === "expired" && <p className="text-xs text-muted-foreground">Expired (older than a day). Ask again.</p>}
      {p.status === "failed" && <p className="text-xs text-destructive">{p.error ?? "Failed."}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="studio-product">Product</Label>
          <select id="studio-product" className={selectClass + " w-80"} value={linked ?? ""} disabled={busy !== null} onChange={(e) => router.push(e.target.value ? `/admin/ai?product=${e.target.value}` : "/admin/ai")}>
            <option value="">+ A new product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        {linked && <Link href={`/admin/products/${linked}`} className="inline-flex items-center gap-1 pb-2 text-sm underline">Open in the product editor <ExternalLink className="size-3.5" /></Link>}
        <div className="ml-auto flex flex-wrap items-center gap-2 pb-1 text-xs text-muted-foreground">
          {payload && payload.costUsd > 0 && <span>AI spend on this chat: ${payload.costUsd.toFixed(2)}</span>}
          <span>Chat model: <span className="font-mono text-foreground">{chatModel ?? "none chosen"}</span></span>
          <Button asChild size="sm" variant="outline"><Link href="/admin/ai/settings"><Settings className="mr-1.5 size-3.5" />Change model</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        {/* ---- chat ---- */}
        <div className="space-y-2 lg:col-span-3">
          <Panel title={product ? `Chat about ${product.name}` : "Chat about a new product"} description={product ? "Listing, pictures, price, ready-made designs and options. Changes to the product wait for your approval." : "Attach photos of the real print and the 3MF or STL. It writes the listing and makes mockups; designs and options follow once the product is created."}>
            <div className="space-y-3">
              {!ready.copy && <p className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-900">No writing model chosen yet. <Link className="underline" href="/admin/ai/settings">Open AI settings</Link> first.</p>}

              <div ref={log} className="max-h-[60vh] min-h-64 space-y-3 overflow-y-auto rounded-md border bg-muted/20 p-3" aria-live="polite">
                {turns.length === 0 && !busy && (
                  <div className="space-y-2 text-sm text-muted-foreground">
                    <p>{product ? "Ask anything about this product, for example:" : "Start by attaching your photos and 3D file, or just ask. For example:"}</p>
                    <div className="flex flex-wrap gap-2">{(product ? IDEAS_PRODUCT : IDEAS_NEW).map((i) => <button key={i} type="button" className="rounded-full border bg-background px-3 py-1 text-xs text-foreground hover:bg-muted" onClick={() => { setText(i); box.current?.focus(); }}>{i}</button>)}</div>
                  </div>
                )}
                {turns.map((t, i) => (
                  <div key={i} className={t.role === "user" ? "flex justify-end" : "flex justify-start"}>
                    <div className={`max-w-[88%] space-y-2 rounded-lg px-3 py-2 text-sm ${t.role === "user" ? "bg-primary text-primary-foreground" : "border bg-background"}`}>
                      {t.text && <p className="whitespace-pre-wrap">{t.text}</p>}
                      {t.model && <p className="inline-flex items-center gap-1 rounded bg-black/10 px-1.5 py-0.5 font-mono text-xs"><Box className="size-3" />{payload?.facts && t.model === payload.modelKey ? payload.facts.fileName : t.model.split("/").pop()}</p>}
                      {t.photos.length > 0 && <div className="flex flex-wrap gap-1.5">{t.photos.map((k) => urls[k] && <img key={k} src={urls[k]} alt="Attached photo" className="size-16 rounded object-cover" />)}</div>}
                      {t.images.some((k) => aiKeys.includes(k)) && (
                        <div className="grid grid-cols-2 gap-2">
                          {t.images.filter((k) => aiKeys.includes(k)).map((k) => {
                            const m = payload?.images.find((x) => x.key === k);
                            return (
                              <figure key={k} className="space-y-1">
                                <a href={urls[k]} target="_blank" rel="noreferrer"><img src={urls[k]} alt={`Mockup by ${m?.model || "AI"}`} className="aspect-square w-full rounded object-cover" /></a>
                                <figcaption className="flex items-center justify-between gap-1 text-xs text-muted-foreground">
                                  <span className="truncate" title={m?.model}>{m?.model ? shortModel(m.model) : "AI"}</span>
                                  {attached.has(k) ? <span className="text-green-700">on product</span> : <label className="flex items-center gap-1 text-foreground"><input type="checkbox" checked={chosen.has(k)} onChange={() => toggle(k)} />use</label>}
                                </figcaption>
                              </figure>
                            );
                          })}
                        </div>
                      )}
                      {t.proposals.map((id) => snap?.proposals[id]).filter((p): p is ProposalView => Boolean(p)).map(card)}
                    </div>
                  </div>
                ))}
                {busy === "send" && <div className="flex justify-start"><div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" />Working on it… mockups can take up to a minute.</div></div>}
              </div>
              {waiting.length > 1 && <Button size="sm" variant="outline" disabled={cardBusy !== null} onClick={approveAll}><Check className="mr-1.5 size-4" />Approve all {waiting.length} changes</Button>}

              {(photoFiles.length > 0 || modelFile) && (
                <div className="flex flex-wrap gap-2 text-xs">
                  {photoFiles.map((f, i) => <span key={i} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"><ImagePlus className="size-3" />{f.name}<button type="button" aria-label={`Remove ${f.name}`} onClick={() => setPhotoFiles((l) => l.filter((_, j) => j !== i))}><X className="size-3" /></button></span>)}
                  {modelFile && <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5"><Box className="size-3" />{modelFile.name}<button type="button" aria-label="Remove the 3D file" onClick={() => setModelFile(null)}><X className="size-3" /></button></span>}
                </div>
              )}
              <div className="space-y-2 rounded-md border p-2">
                <Textarea ref={box} rows={2} maxLength={4000} value={text} disabled={busy !== null} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} placeholder="Ask for the listing, a mockup, designs, a price check… (Enter sends, Shift+Enter adds a line)" aria-label="Message" className="border-0 shadow-none focus-visible:ring-0" />
                <div className="flex flex-wrap items-center gap-2">
                  <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" multiple className="hidden" onChange={(e) => { const picked = Array.from(e.target.files ?? []); /* read now: the updater below runs later, after the input is cleared */ setPhotoFiles((l) => [...l, ...picked].slice(0, Math.max(0, MAX_PHOTOS_PER_DRAFT - (payload?.photoKeys.length ?? 0)))); e.target.value = ""; }} />
                  <input ref={modelInput} type="file" accept=".stl,.3mf" className="hidden" onChange={(e) => { setModelFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
                  <Button type="button" variant="outline" size="icon" aria-label="Attach photos" title={`Attach photos of the real print (${photoCount}/${MAX_PHOTOS_PER_DRAFT})`} disabled={busy !== null || photoCount >= MAX_PHOTOS_PER_DRAFT} onClick={() => photoInput.current?.click()}><ImagePlus className="size-4" /></Button>
                  {!linked && <Button type="button" variant="outline" size="icon" aria-label="Attach a 3D file" title="Attach a 3MF or STL" disabled={busy !== null} onClick={() => modelInput.current?.click()}><Box className="size-4" /></Button>}
                  <select aria-label="Image model for mockups" title="The image model for the mockups in this message. Switch it and ask again to compare models." className={selectClass + " h-9 w-auto max-w-64 flex-1"} value={imageModel} disabled={busy !== null} onChange={(e) => setImageModel(e.target.value)}>
                    {!imageModels.some((m) => m.id === imageModel) && <option value={imageModel}>{imageModel}{imageModel === defaultImageModel ? " (default)" : ""}</option>}
                    {imageModels.filter((m) => m.vision).map((m) => <option key={m.id} value={m.id}>{m.name}{m.id === defaultImageModel ? " (default)" : ""}{m.note ? ` · ${m.note}` : ""}</option>)}
                  </select>
                  <Button type="button" className="ml-auto" onClick={() => send()} disabled={busy !== null || !ready.copy || (!text.trim() && !photoFiles.length && !modelFile)}>{busy === "send" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Send className="mr-2 size-4" />}Send</Button>
                </div>
                {imageInfo && !imageInfo.vision && <p className="text-xs text-destructive">This image model cannot take your photo, so it cannot redraw your product.</p>}
                {!ready.imagesKey && <p className="text-xs text-destructive">Mockups need an OpenRouter key in <Link className="underline" href="/admin/ai/settings">AI settings</Link>.</p>}
              </div>
              <p className="text-xs text-muted-foreground">Mockups are redrawn from your real photos with the image model in the message box; each one is labelled with its model, so you can switch and compare. {linked ? "The 3D file is changed in the product editor." : "The assistant cannot see inside a 3D file; it knows its size and colours."}</p>
            </div>
          </Panel>
        </div>

        {/* ---- review ---- */}
        <div className="space-y-4 lg:col-span-2">
          {linked && (
            <div className="flex w-fit gap-1 rounded-lg border bg-muted/40 p-1" role="tablist" aria-label="The studio's right side">
              <button type="button" role="tab" aria-selected={rightTab === "proposal"} onClick={() => setRightTab("proposal")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", rightTab === "proposal" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>Listing &amp; pictures</button>
              <button type="button" role="tab" aria-selected={rightTab === "images"} onClick={() => setRightTab("images")} className={cn("rounded-md px-3 py-1.5 text-sm font-medium", rightTab === "images" ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground")}>AI images{gallery.length ? ` (${gallery.length})` : ""}</button>
            </div>
          )}
          {linked && rightTab === "images" ? (
            <ImageGalleryPanel productId={linked} gallery={gallery} photoCount={realPhotos} imageModels={imageModels} defaultImageModel={defaultImageModel} ready={{ openrouterKey: ready.imagesKey }} />
          ) : (
            <>
          {product && (
            <Panel title="Ready-made designs" description={`Customers: ${product.designModeLabel}`}>
              <div className="space-y-3">
                <div className="aspect-square w-full overflow-hidden rounded-md border bg-muted/30">
                  {product.modelUrl ? <StlViewer url={product.modelUrl} color={wholeColor} partColors={partColors} /> : <p className="p-4 text-sm text-muted-foreground">No 3D file yet. Attach one in the product editor.</p>}
                </div>
                <p className="text-xs text-muted-foreground">{shown ? `Showing "${shown.name}".` : "The model's own colours. Pick a design to see it."}</p>
                {product.presets.length === 0 ? <p className="text-sm text-muted-foreground">None yet. Ask the assistant to suggest some.</p> : (
                  <ul className="space-y-1.5">
                    {product.presets.map((d) => (
                      <li key={d.id}>
                        <button type="button" disabled={!d.available} onClick={() => setPreview(preview === d.id ? null : d.id)} aria-pressed={preview === d.id} className={cn("flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm disabled:cursor-not-allowed", preview === d.id ? "border-primary bg-primary/10" : "hover:bg-muted", !d.active && "opacity-60")}>
                          <span className="flex" aria-hidden>{d.swatches.map((s, i) => <span key={i} title={`${s.label}: ${s.hex}`} className="-ml-1 size-5 rounded-full border-2 border-background first:ml-0" style={{ backgroundColor: s.hex }} />)}</span>
                          <span className="min-w-0 flex-1 truncate font-medium">{d.name}</span>
                          {!d.active ? <span className="text-xs text-muted-foreground">hidden</span> : !d.available && <span className="text-xs text-amber-700">not shown: {d.missing.join(", ")}</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {product.options.length > 0 && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-xs font-semibold text-muted-foreground">Options customers choose ({product.options.length})</summary>
                    <ul className="mt-2 space-y-2">
                      {product.options.map((o) => (
                        <li key={o.id}>
                          <p className="font-medium">{o.label} <span className="text-xs font-normal text-muted-foreground">{o.type}{o.required ? " · required" : ""}{o.priceDeltaCents ? ` · +₱${o.priceDeltaCents / 100}` : ""}</span></p>
                          {o.type === "color" ? <div className="mt-1 flex flex-wrap gap-1">{o.values.map((v) => <span key={v.id} title={v.label} className="size-5 rounded-full border" style={{ backgroundColor: v.value }} />)}</div>
                            : o.values.length > 0 && <p className="text-xs text-muted-foreground">{o.values.map((v) => `${v.label}${v.priceDeltaCents ? ` +₱${v.priceDeltaCents / 100}` : ""}`).join(" · ")}</p>}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            </Panel>
          )}

          <Panel title={product ? "Listing changes" : "Listing proposal"} description={product ? "A new listing the assistant proposed for this product. Edit anything, then apply it below." : "Edit anything. Nothing is created until you press Create product."}>
            {!hasCopy ? <p className="text-sm text-muted-foreground">{product ? "No listing change proposed. Ask the assistant to improve the listing." : "No listing yet. Ask the assistant to write one."}</p> : (
              <div className="grid gap-3">
                <div className="space-y-1"><Label htmlFor="n">Name</Label><Input id="n" maxLength={80} value={copy.name} onChange={(e) => setCopy({ ...copy, name: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor="t">Tagline</Label><Input id="t" maxLength={140} value={copy.tagline} onChange={(e) => setCopy({ ...copy, tagline: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor="d">Description</Label><Textarea id="d" rows={6} maxLength={1500} value={copy.description} onChange={(e) => setCopy({ ...copy, description: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor="h">Highlights (one per line)</Label><Textarea id="h" rows={4} defaultValue={copy.highlights.join("\n")} key={`h-${JSON.stringify(payload?.copy?.highlights)}`} onChange={(e) => setList("highlights")(e.target.value)} /></div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1"><Label htmlFor="c">Category</Label><Input id="c" maxLength={40} value={copy.category} onChange={(e) => setCopy({ ...copy, category: e.target.value })} /></div>
                  <div className="space-y-1"><Label htmlFor="tg">Tags (comma separated)</Label><Input id="tg" defaultValue={copy.tags.join(", ")} key={`tg-${JSON.stringify(payload?.copy?.tags)}`} onChange={(e) => setList("tags")(e.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="st">SEO title</Label><Input id="st" maxLength={70} value={copy.seoTitle} onChange={(e) => setCopy({ ...copy, seoTitle: e.target.value })} /></div>
                  <div className="space-y-1"><Label htmlFor="md">Meta description</Label><Input id="md" maxLength={170} value={copy.metaDescription} onChange={(e) => setCopy({ ...copy, metaDescription: e.target.value })} /></div>
                </div>
              </div>
            )}
          </Panel>

          <Panel title="Pictures" description={`Your real photos and the AI mockups. Tick what goes on the product. Keep at least one real photo. Up to ${MAX_IMAGES_PER_DRAFT} mockups per chat.`}>
            {allKeys.length === 0 ? <p className="text-sm text-muted-foreground">Nothing yet. Attach photos in the chat.</p> : (
              <div className="space-y-2">
                <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {allKeys.map((k) => {
                    const m = payload?.images.find((i) => i.key === k);
                    const on = attached.has(k);
                    return (
                      <li key={k} className="space-y-1 rounded-md border p-1.5">
                        <a href={urls[k]} target="_blank" rel="noreferrer"><img src={urls[k]} alt={m ? "AI mockup" : "Real photo"} className="aspect-square w-full rounded object-cover" /></a>
                        <div className="flex items-center justify-between gap-1 text-xs">
                          {on ? <span className="truncate text-green-700">on product</span> : <label className="flex min-w-0 items-center gap-1"><input type="checkbox" checked={chosen.has(k)} onChange={() => toggle(k)} /><span className="truncate" title={m?.model}>{m ? shortModel(m.model) || "AI" : "Real"}</span></label>}
                          {!on && <button type="button" aria-label={m ? "Delete mockup" : "Delete photo"} title={m ? "Delete this mockup" : "Delete this photo"} className="text-muted-foreground hover:text-destructive" disabled={busy !== null} onClick={() => removeImg(k)}>{busy === `rm-${k}` ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}</button>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {!linked && !allKeys.some((k) => chosen.has(k) && !aiKeys.includes(k)) && <p className="text-xs text-amber-700">No real photo is ticked. Keep at least one so buyers see the actual print.</p>}
              </div>
            )}
          </Panel>

          <Panel title={linked ? "Apply to the product" : "Create the product"} description={linked ? "Updates the listing (if one is proposed) and adds the ticked pictures. Designs and options are approved on their cards in the chat." : "Creates the product unpublished, with the 3D file (its colour parts are detected) and the ticked pictures. The chat then continues with designs and options."}>
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1"><Label htmlFor="p">Price (₱)</Label><Input id="p" inputMode="decimal" className="w-32" value={price} onChange={(e) => setPrice(e.target.value)} placeholder={linked ? "unchanged" : "e.g. 249"} /></div>
              <Button variant="outline" onClick={save} disabled={busy !== null || !hasCopy || !dirty}>Save edits</Button>
              <Button onClick={applyIt} disabled={busy !== null || !snap || (linked ? !hasCopy && newPictures.length === 0 : !hasCopy || !price.trim())}>
                {busy === "apply" ? <Loader2 className="mr-2 size-4 animate-spin" /> : <Check className="mr-2 size-4" />}{linked ? "Apply to product" : "Create product"}
              </Button>
              {snap && <Button variant="ghost" onClick={discard} disabled={busy !== null}><Trash2 className="mr-2 size-4" />{linked ? "Close chat" : "Discard chat"}</Button>}
            </div>
            {!linked && payload && !payload.modelKey && <p className="mt-2 text-xs text-amber-700">No 3D file is attached yet. The product will be created without one (and without designs).</p>}
          </Panel>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
