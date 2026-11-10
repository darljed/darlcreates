"use client";

import dynamic from "next/dynamic";
import { ViewerLoading } from "./viewer-loading";
import type { StlViewerProps } from "./stl-viewer";

const Inner = dynamic(() => import("./stl-viewer"), {
  ssr: false,
  // Same loading look as the model-download phase inside the viewer, so there is no flicker between the two.
  loading: () => (
    <div className="relative size-full">
      <ViewerLoading />
    </div>
  ),
});

/** Public entry: lazy-loads the Three.js viewer only on the client. */
export function StlViewer(props: StlViewerProps) {
  return <Inner {...props} />;
}
