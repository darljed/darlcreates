"use client";

/**
 * Admin editor for the six logo slots: upload, live preview of tab / navbar / shared link, reset to built-in
 * logos.
 */

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, ImagePlus, Loader2, RotateCcw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Panel } from "@/components/shell/ui";
import { uploadToS3 } from "@/lib/upload-client";
import { fileUrl } from "@/lib/storage-url";
import {
  LOGO_SLOTS,
  LOGO_SPECS,
  checkLogo,
  logoWarning,
  type Branding,
  type ImageType,
  type LogoAsset,
  type LogoSlot,
} from "@/lib/branding-schema";
import { resetBrandingAction, saveBrandingAction } from "@/app/(admin)/admin/content/actions";

type State = Record<LogoSlot, LogoAsset | null>;

const GROUPS: { title: string; description: string; slots: LogoSlot[] }[] = [
  { title: "Logos", description: "Shown across the website.", slots: ["horizontal", "horizontalDark", "icon"] },
  { title: "Browser and sharing", description: "Small images that appear outside your website.", slots: ["favicon", "appleIcon", "og"] },
];

const TYPE_FROM_MIME: Record<string, ImageType> = { "image/png": "png", "image/jpeg": "jpeg", "image/webp": "webp" };

/** Natural size of a picked file, measured in the browser for instant feedback (the server re-measures). */
function measure(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      reject(new Error("That file couldn't be read as an image."));
      URL.revokeObjectURL(url);
    };
    img.src = url;
  });
}

function srcOf(slot: LogoSlot, a: LogoAsset | null): string | null {
  if (a) return fileUrl(a.key);
  return LOGO_SPECS[slot].fallback.src || null;
}

export function BrandingEditor({ initial, storeName, tagline }: { initial: Branding; storeName: string; tagline: string }) {
  const router = useRouter();
  const saved: State = initial.logos; // the page reloads after a save, so this never needs to change
  const [d, setD] = useState<State>(initial.logos);
  const [busy, setBusy] = useState<LogoSlot | null>(null);
  const [errors, setErrors] = useState<Partial<Record<LogoSlot, string>>>({});
  const [warnings, setWarnings] = useState<Partial<Record<LogoSlot, string>>>({});
  const [pending, start] = useTransition();
  const [confirmReset, setConfirmReset] = useState(false);
  const inputs = useRef<Partial<Record<LogoSlot, HTMLInputElement | null>>>({});

  const dirty = LOGO_SLOTS.some((s) => (d[s]?.key ?? null) !== (saved[s]?.key ?? null));

  async function onPick(slot: LogoSlot, file: File) {
    setErrors((p) => ({ ...p, [slot]: undefined }));
    setWarnings((p) => ({ ...p, [slot]: undefined }));
    const type = TYPE_FROM_MIME[file.type];
    if (!type) return void setErrors((p) => ({ ...p, [slot]: "Use a PNG, JPEG or WebP file." }));
    setBusy(slot);
    try {
      const dims = await measure(file);
      const problem = checkLogo(slot, { ...dims, bytes: file.size, type });
      if (problem) return void setErrors((p) => ({ ...p, [slot]: problem }));
      const key = await uploadToS3("site", file);
      setD((p) => ({ ...p, [slot]: { key, ...dims } }));
      const warn = logoWarning(slot, dims);
      if (warn) setWarnings((p) => ({ ...p, [slot]: warn }));
    } catch (e) {
      setErrors((p) => ({ ...p, [slot]: e instanceof Error ? e.message : "Upload failed" }));
    } finally {
      setBusy(null);
    }
  }

  function save() {
    start(async () => {
      const res = await saveBrandingAction({ logos: d });
      if (res.ok) {
        toast.success("Logos saved");
        router.refresh();
        window.location.reload(); // the header/footer logo and tab icon are rendered by the server
      } else toast.error(res.error);
    });
  }

  function reset() {
    start(async () => {
      const res = await resetBrandingAction();
      if (res.ok) window.location.reload();
      else toast.error(res.error);
    });
  }

  const logo = srcOf("horizontal", d.horizontal);
  const favicon = srcOf("favicon", d.favicon);
  const og = srcOf("og", d.og);

  return (
    <div className="space-y-3">
      <div className="sticky top-0 z-10 -mx-1 flex flex-wrap items-center justify-between gap-2 border-b bg-background/95 px-1 py-2 backdrop-blur">
        <p className="text-xs">
          {dirty ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-amber-700">
              <span className="size-2 rounded-full bg-amber-500" aria-hidden /> Unsaved changes
            </span>
          ) : (
            <span className="text-muted-foreground">Uploads go live when you save.</span>
          )}
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setConfirmReset(true)} disabled={pending}>
            <RotateCcw className="mr-1 size-4" /> Use built-in logos
          </Button>
          <Button type="button" variant="outline" size="sm" disabled={!dirty || pending} onClick={() => { setD(saved); setErrors({}); setWarnings({}); }}>
            <Undo2 className="mr-1 size-4" /> Discard
          </Button>
          <Button type="button" size="sm" disabled={!dirty || pending || busy !== null} onClick={save}>
            {pending && <Loader2 className="mr-1 size-4 animate-spin" />} Save logos
          </Button>
        </div>
      </div>

      {/* in-context preview */}
      <Panel title="Preview" description="How your uploads look in place (before you save).">
        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-3">
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Browser tab</p>
              <div className="flex items-center gap-2 rounded-t-md border border-b-0 bg-muted px-3 py-1.5 text-xs" style={{ maxWidth: 260 }}>
                {favicon && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={favicon} alt="" width={16} height={16} className="size-4 object-contain" />
                )}
                <span className="truncate">{storeName}{tagline ? ` — ${tagline}` : ""}</span>
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Navigation bar</p>
              <div className="flex h-16 items-center justify-between rounded-md border bg-background px-6">
                {logo && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={logo} alt={storeName} className="h-9 w-auto" />
                )}
                <span className="flex gap-4 text-sm text-muted-foreground"><span>Shop</span><span>My Orders</span></span>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Shared link</p>
            <div className="overflow-hidden rounded-md border bg-card">
              <div className="flex aspect-[1.91/1] items-center justify-center bg-gradient-to-br from-primary/15 to-accent/30">
                {og ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={og} alt="" className="size-full object-cover" />
                ) : (
                  <span className="px-4 text-center text-xs text-muted-foreground">No sharing image yet. Links will show only your name.</span>
                )}
              </div>
              <div className="border-t p-2.5">
                <p className="text-[11px] uppercase text-muted-foreground">yourwebsite.com</p>
                <p className="truncate text-sm font-semibold">{storeName}</p>
              </div>
            </div>
          </div>
        </div>
      </Panel>

      {GROUPS.map((g) => (
        <Panel key={g.title} title={g.title} description={g.description}>
          <div className="grid gap-4 lg:grid-cols-2">
            {g.slots.map((slot) => {
              const spec = LOGO_SPECS[slot];
              const a = d[slot];
              const src = srcOf(slot, a);
              const changed = (a?.key ?? null) !== (saved[slot]?.key ?? null);
              const isBusy = busy === slot;
              return (
                <section key={slot} aria-label={spec.label} className="flex flex-col rounded-lg border">
                  <div
                    className={`flex h-36 items-center justify-center rounded-t-lg border-b p-4 ${
                      spec.previewOn === "dark" ? "bg-slate-900" : "bg-[conic-gradient(#f1f1f1_25%,#fff_0_50%,#f1f1f1_0_75%,#fff_0)] bg-[length:16px_16px]"
                    }`}
                  >
                    {src ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={src} alt={`${spec.label} preview`} className="max-h-full max-w-full object-contain" />
                    ) : (
                      <span className="text-xs text-muted-foreground">Not set</span>
                    )}
                  </div>
                  <div className="flex flex-1 flex-col gap-2 p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold">{spec.label}</h3>
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${a ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                        {a ? `${a.width} × ${a.height}${changed ? " · not saved" : ""}` : slot === "og" ? "None" : "Built-in"}
                      </span>
                    </div>
                    <dl className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-0.5 text-muted-foreground">
                      <dt className="font-medium text-foreground">Used in</dt>
                      <dd>{spec.usedIn.join(" · ")}</dd>
                      <dt className="font-medium text-foreground">Size</dt>
                      <dd>{spec.recommended}</dd>
                      <dt className="font-medium text-foreground">File type</dt>
                      <dd>{spec.formats}, up to {spec.maxBytes >= 1048576 ? `${spec.maxBytes / 1048576} MB` : `${spec.maxBytes / 1024} KB`}</dd>
                    </dl>
                    <p className="text-muted-foreground">{spec.note}</p>

                    {errors[slot] && (
                      <p role="alert" className="flex items-start gap-1.5 rounded-md bg-destructive/10 p-2 text-destructive">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {errors[slot]}
                      </p>
                    )}
                    {warnings[slot] && !errors[slot] && (
                      <p role="status" className="flex items-start gap-1.5 rounded-md bg-amber-50 p-2 text-amber-800">
                        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {warnings[slot]}
                      </p>
                    )}

                    <div className="mt-auto flex flex-wrap gap-2 pt-1">
                      <input
                        ref={(el) => {
                          inputs.current[slot] = el;
                        }}
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        className="sr-only"
                        aria-label={`Choose file for ${spec.label}`}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          e.target.value = "";
                          if (f) void onPick(slot, f);
                        }}
                      />
                      <Button type="button" size="sm" variant="outline" disabled={isBusy || pending} onClick={() => inputs.current[slot]?.click()}>
                        {isBusy ? <Loader2 className="mr-1 size-4 animate-spin" /> : <ImagePlus className="mr-1 size-4" />}
                        {a ? "Replace" : "Upload"}
                      </Button>
                      {a && (
                        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => setD((p) => ({ ...p, [slot]: null }))}>
                          <Trash2 className="mr-1 size-4" /> {slot === "og" ? "Remove" : "Use built-in"}
                        </Button>
                      )}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </Panel>
      ))}

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Go back to the built-in logos?</DialogTitle>
            <DialogDescription>Every logo and icon you uploaded is removed and the original Darl Creates artwork is used again.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setConfirmReset(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={() => { setConfirmReset(false); reset(); }}>Use built-in logos</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
