"use client";

import dynamic from "next/dynamic";
import { Loader2 } from "lucide-react";
import type { StlViewerProps } from "./stl-viewer";

const Inner = dynamic(() => import("./stl-viewer"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center bg-muted">
      <Loader2 className="size-8 animate-spin text-primary" />
    </div>
  ),
});

/** Public entry: lazy-loads the Three.js viewer only on the client. */
export function StlViewer(props: StlViewerProps) {
  return <Inner {...props} />;
}
