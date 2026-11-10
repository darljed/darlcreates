"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Box, ImagePlus, Loader2, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { validateUpload, type AdminUploadKind } from "@/lib/uploads";
import {
  addPhotoAction,
  attachStlAction,
  deletePhotoAction,
} from "@/app/(admin)/admin/products/actions";

/** Presign -> PUT straight to S3 -> return the object key. */
async function uploadToS3(kind: AdminUploadKind, file: File): Promise<string> {
  const problem = validateUpload(kind, file.name, file.type, file.size);
  if (problem) throw new Error(problem);

  const res = await fetch("/api/uploads/presign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      kind,
      filename: file.name,
      contentType: file.type,
      size: file.size,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Could not start upload");

  const put = await fetch(data.url, {
    method: "PUT",
    headers: { "Content-Type": data.contentType },
    body: file,
  });
  if (!put.ok) throw new Error("Upload to storage failed");
  return data.key as string;
}

export function ProductFiles({
  productId,
  stlKey,
  photos,
}: {
  productId: string;
  stlKey: string | null;
  photos: { id: string; url: string; alt: string }[];
}) {
  const router = useRouter();
  const stlInput = useRef<HTMLInputElement>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"stl" | "photo" | string | null>(null);

  async function onStl(file: File) {
    setBusy("stl");
    try {
      const key = await uploadToS3("stl", file);
      const res = await attachStlAction({ productId, key });
      if (!res.ok) throw new Error(res.error);
      toast.success("STL uploaded");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      if (stlInput.current) stlInput.current.value = "";
    }
  }

  async function onPhotos(files: FileList) {
    setBusy("photo");
    try {
      for (const file of Array.from(files)) {
        const key = await uploadToS3("photo", file);
        const res = await addPhotoAction({ productId, key });
        if (!res.ok) throw new Error(res.error);
      }
      toast.success("Photo(s) uploaded");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(null);
      if (photoInput.current) photoInput.current.value = "";
    }
  }

  async function onDelete(photoId: string) {
    setBusy(photoId);
    const res = await deletePhotoAction({ photoId });
    setBusy(null);
    if (res.ok) {
      toast.success("Photo removed");
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <div className="space-y-6 rounded-xl border-2 border-border bg-card p-5">
      <div>
        <h3 className="font-bold">3D model (STL)</h3>
        <p className="text-sm text-muted-foreground">
          The print-ready file shown in the 3D viewer and downloaded for printing.
          Max 50 MB.
        </p>
        <div className="mt-3 flex items-center gap-3">
          <span className="inline-flex items-center gap-2 text-sm">
            <Box className="size-4 text-primary" />
            {stlKey ? (
              <span className="font-mono text-xs">{stlKey.split("/").pop()}</span>
            ) : (
              <span className="text-muted-foreground">No STL yet</span>
            )}
          </span>
          <input
            ref={stlInput}
            type="file"
            accept=".stl"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && onStl(e.target.files[0])}
          />
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            onClick={() => stlInput.current?.click()}
          >
            {busy === "stl" ? (
              <Loader2 className="mr-2 size-4 animate-spin" />
            ) : (
              <Upload className="mr-2 size-4" />
            )}
            {stlKey ? "Replace STL" : "Upload STL"}
          </Button>
        </div>
      </div>

      <div>
        <h3 className="font-bold">Photos</h3>
        <p className="text-sm text-muted-foreground">
          JPEG, PNG or WebP, up to 5 MB each. The first photo is the shop thumbnail.
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {photos.map((p) => (
            <div key={p.id} className="group relative">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={p.alt || "Product photo"}
                className="size-24 rounded-lg border object-cover"
              />
              <button
                type="button"
                aria-label="Remove photo"
                disabled={busy !== null}
                onClick={() => onDelete(p.id)}
                className="absolute -right-2 -top-2 rounded-full bg-destructive p-1 text-white shadow"
              >
                {busy === p.id ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <Trash2 className="size-3" />
                )}
              </button>
            </div>
          ))}
          <input
            ref={photoInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && onPhotos(e.target.files)}
          />
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => photoInput.current?.click()}
            className="flex size-24 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed text-xs text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-50"
          >
            {busy === "photo" ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <ImagePlus className="size-5" />
            )}
            Add photo
          </button>
        </div>
      </div>
    </div>
  );
}
