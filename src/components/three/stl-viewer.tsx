"use client";

import {
  Component,
  Suspense,
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { Box, RotateCcw } from "lucide-react";
import { centerGeometry, frameModel, VIEWER_FOV_DEG } from "@/lib/viewer-framing";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(REDUCED_MOTION);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
function usePrefersReducedMotion() {
  return useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => false,
  );
}

/**
 * Loads the STL, centers it on its own bounding box, and frames the camera from
 * the model's size, so tiny / huge / off-origin models all start centered and
 * fully visible (slicers often export parts at the bed middle, e.g. 128,128).
 * Rotation never moves the mesh: auto-rotate orbits the CAMERA around the center.
 */
function Scene({
  url,
  color,
  autoRotate,
  onUserInteract,
}: {
  url: string;
  color: string;
  autoRotate: boolean;
  onUserInteract: () => void;
}) {
  const raw = useLoader(STLLoader, url);
  // useLoader caches the parsed geometry; clone before mutating (centering).
  const { geometry, radius } = useMemo(() => centerGeometry(raw.clone()), [raw]);
  const framing = useMemo(() => frameModel(radius), [radius]);

  return (
    <>
      <PerspectiveCamera
        makeDefault
        fov={VIEWER_FOV_DEG}
        position={framing.position}
        near={framing.near}
        far={framing.far}
      />
      <ambientLight intensity={0.8} />
      <directionalLight position={[radius * 3, radius * 4, radius * 3]} intensity={1.1} />
      <directionalLight position={[-radius * 3, -radius * 2, -radius * 3]} intensity={0.4} />
      {/* STL is Z-up; rotate exactly -90° about X so the model stands upright. */}
      <mesh geometry={geometry} rotation={[-Math.PI / 2, 0, 0]}>
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} />
      </mesh>
      <OrbitControls
        makeDefault
        target={[0, 0, 0]}
        enableDamping
        enablePan
        screenSpacePanning
        autoRotate={autoRotate}
        autoRotateSpeed={1.5}
        minDistance={framing.minDistance}
        maxDistance={framing.maxDistance}
        onStart={onUserInteract}
      />
    </>
  );
}

export type StlViewerProps = {
  url: string | null;
  color?: string;
  className?: string;
};

/**
 * Interactive STL viewer. `key={url}` remounts the inner viewer for a new model,
 * which resets its state (failed / spinning) without effects.
 */
export default function StlViewer({ url, color = "#9ca3af", className }: StlViewerProps) {
  if (!url) return <Placeholder className={className} />;
  return <Viewer key={url} url={url} color={color} className={className} />;
}

function Placeholder({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/20 text-muted-foreground">
        <Box className="size-16" />
        <span className="text-sm">3D preview unavailable</span>
      </div>
    </div>
  );
}

function Viewer({ url, color, className }: { url: string; color: string; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [failed, setFailed] = useState(false);
  const [spinning, setSpinning] = useState(true);
  // Bumping this remounts the canvas contents => camera + controls return to the framed view.
  const [view, setView] = useState(0);

  const reset = useCallback(() => {
    setView((n) => n + 1);
    setSpinning(true);
  }, []);

  if (failed) return <Placeholder className={className} />;

  return (
    <div className={`relative ${className ?? ""}`} onDoubleClick={reset}>
      <ErrorBoundary onError={() => setFailed(true)}>
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true }}
          aria-label="Interactive 3D model viewer"
        >
          <Suspense fallback={null}>
            <Scene
              key={view}
              url={url}
              color={color}
              autoRotate={spinning && !reduced}
              onUserInteract={() => setSpinning(false)}
            />
          </Suspense>
        </Canvas>
      </ErrorBoundary>
      <button
        type="button"
        onClick={reset}
        className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full border-2 border-border bg-background/90 px-3 py-1.5 text-xs font-semibold shadow-sm backdrop-blur transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RotateCcw className="size-3.5" aria-hidden /> Reset view
      </button>
    </div>
  );
}

/** Minimal error boundary so a bad/unreachable STL never blocks the page. */
class ErrorBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
