"use client";

/**
 * Preview box: the interactive 3D model or a photo, switched by thumbnails.
 */

import { useState } from "react";
import { Box } from "lucide-react";
import type { BufferGeometry } from "three";
import { StlViewer } from "@/components/three/stl-viewer-lazy";
import { cn } from "@/lib/utils";

export type GalleryPhoto = { url: string; alt: string };

/**
 * Preview box + thumbnails. The box shows either the interactive 3D model or one
 * of the product photos; clicking a thumbnail swaps it. The 3D tile comes first
 * when the product has a model. `color` recolors the 3D model (customer's swatch).
 */
export function ProductGallery({
  productName,
  modelUrl,
  color,
  photos,
  overlay,
  overlayColor,
  partColors,
  engraved,
}: {
  productName: string;
  modelUrl: string | null;
  color: string;
  photos: GalleryPhoto[];
  /** The customer's name as raised letters, drawn on the 3D model (see use-name-build.ts). */
  overlay?: BufferGeometry | null;
  /** The name's own colour when it prints in a different filament than the model. */
  overlayColor?: string;
  /** Colours for named parts of a multi-colour model (mesh name -> hex), see part-colors.ts. */
  partColors?: Record<string, string>;
  /** The name is engraved: the viewer cuts it into the model (see CarvedName). */
  engraved?: boolean;
}) {
  // -1 = the 3D model; 0..n-1 = photo index. Default to 3D when there is one.
  const [active, setActive] = useState<number>(modelUrl ? -1 : 0);
  const showing3d = active === -1 && Boolean(modelUrl);
  const photo = photos[active];

  const tile =
    "relative size-16 shrink-0 overflow-hidden rounded-lg border-2 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <div>
      <div
        className="aspect-square overflow-hidden rounded-xl border-2 border-border bg-card"
        aria-live="polite"
      >
        {showing3d ? (
          <StlViewer url={modelUrl} color={color} className="size-full" overlay={overlay} overlayColor={overlayColor} partColors={partColors} engraved={engraved} />
        ) : photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.url}
            alt={photo.alt || `${productName} photo ${active + 1}`}
            className="size-full object-contain"
          />
        ) : (
          <StlViewer url={null} color={color} className="size-full" />
        )}
      </div>

      {(modelUrl || photos.length > 1) && (
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Product views">
          {modelUrl && (
            <button
              type="button"
              aria-label="3D model"
              aria-pressed={showing3d}
              onClick={() => setActive(-1)}
              className={cn(
                tile,
                "flex flex-col items-center justify-center gap-0.5 bg-muted text-xs font-bold",
                showing3d ? "border-primary text-primary" : "border-border hover:border-primary",
              )}
            >
              <Box className="size-5" aria-hidden />3D
            </button>
          )}
          {photos.map((p, i) => (
            <button
              key={p.url}
              type="button"
              aria-label={p.alt || `${productName} photo ${i + 1}`}
              aria-pressed={!showing3d && active === i}
              onClick={() => setActive(i)}
              className={cn(
                tile,
                !showing3d && active === i ? "border-primary" : "border-border hover:border-primary",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <p className="mt-3 text-xs text-muted-foreground">
        {showing3d
          ? "Drag to rotate · scroll to zoom · double-click to reset. The 3D model is the actual print-ready shape."
          : modelUrl
            ? "Select the 3D tile to rotate the model."
            : "Photos of the finished print."}
      </p>
    </div>
  );
}
