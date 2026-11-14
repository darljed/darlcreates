/**
 * Loading state for the 3D viewer. No Three.js here, so it can be shown while the 3D library itself is still
 * downloading, and again (same look, no flicker) while the model file downloads and is parsed. It stays up until the
 * first frame has painted, then fades out. The "still loading" hint appears by CSS alone after a few seconds.
 */
export function ViewerLoading({ ready = false, label = "Loading 3D preview" }: { ready?: boolean; label?: string }) {
  return (
    <div
      data-ready={ready}
      aria-hidden={ready || undefined}
      className="viewer-loading absolute inset-0 z-10 flex flex-col items-center justify-center gap-5 bg-gradient-to-br from-muted via-background to-muted transition-opacity duration-500 data-[ready=true]:pointer-events-none data-[ready=true]:opacity-0"
    >
      <div className="viewer-scene" aria-hidden>
        <div className="viewer-cube">
          <span className="viewer-face viewer-front" />
          <span className="viewer-face viewer-back" />
          <span className="viewer-face viewer-right" />
          <span className="viewer-face viewer-left" />
          <span className="viewer-face viewer-top" />
          <span className="viewer-face viewer-bottom" />
        </div>
        <span className="viewer-shadow" />
      </div>
      <div role="status" aria-live="polite" className="text-center">
        <p className="text-sm font-semibold text-foreground">{label}…</p>
        <p className="viewer-slow mt-1 text-xs text-muted-foreground">Still working. Large models can take a few seconds.</p>
      </div>
    </div>
  );
}
