"use client";

import { useEffect, useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { validateUpload } from "@/lib/uploads";

/**
 * Lets a signed-in customer attach artwork to an "image" customization option.
 * Flow: validate locally -> POST /api/uploads/presign (kind "customer") -> PUT straight to S3 ->
 * hand the object key to the parent. The server re-verifies ownership, existence and the file's
 * magic bytes when the item is added to the cart, so nothing here is trusted.
 */
export function CustomerImageUpload({
  signedIn,
  value,
  onChange,
  onNeedSignIn,
}: {
  signedIn: boolean;
  value: string | undefined;
  onChange: (key: string | undefined) => void;
  onNeedSignIn: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function pick(file: File) {
    setError(null);
    const problem = validateUpload("customer", file.name, file.type, file.size);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      const res = await fetch("/api/uploads/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "customer", filename: file.name, contentType: file.type, size: file.size }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Could not start the upload");
      let put: Response;
      try {
        put = await fetch(data.url, { method: "PUT", headers: { "Content-Type": data.contentType }, body: file });
      } catch {
        throw new Error("Couldn't reach storage. Check your connection and try again.");
      }
      if (!put.ok) throw new Error(`Upload failed (${put.status})`);
      setPreview(URL.createObjectURL(file));
      onChange(data.key as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  function clear() {
    setPreview(null);
    setError(null);
    onChange(undefined);
  }

  if (!signedIn) {
    return (
      <button type="button" onClick={onNeedSignIn} className="w-full rounded-lg border-2 border-dashed p-4 text-sm text-muted-foreground hover:border-primary hover:text-primary">
        Sign in to upload your image
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" aria-label="Upload your image" onChange={(e) => e.target.files?.[0] && pick(e.target.files[0])} />
      {value ? (
        <div className="flex items-center gap-3 rounded-lg border-2 border-border p-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {preview ? <img src={preview} alt="Your uploaded image" className="size-16 rounded-md object-cover" /> : <div className="size-16 rounded-md bg-muted" />}
          <span className="flex-1 text-sm font-medium">Image attached</span>
          <button type="button" onClick={clear} aria-label="Remove image" className="rounded-full p-1.5 hover:bg-muted"><X className="size-4" /></button>
        </div>
      ) : (
        <button type="button" disabled={busy} onClick={() => input.current?.click()} className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-sm font-semibold hover:border-primary hover:text-primary disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
          {busy ? "Uploading…" : "Choose an image (JPG, PNG or WebP, max 5 MB)"}
        </button>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
