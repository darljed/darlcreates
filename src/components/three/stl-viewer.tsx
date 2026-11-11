"use client";

/**
 * Three.js viewer for STL and 3MF models: frames any model, orbit controls, customer colour choice, reduced-motion
 * aware.
 */

import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { ThreeMFLoader } from "three/examples/jsm/loaders/3MFLoader.js";
import { Box, RotateCcw } from "lucide-react";
import {
  centerGeometry,
  DEFAULT_3MF_MATERIAL,
  frameModel,
  measureObject,
  prepareMultiPart,
  VIEWER_FOV_DEG,
} from "@/lib/viewer-framing";
import { modelFormatOf } from "@/lib/uploads";
import { ViewerLoading } from "./viewer-loading";

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
 * Shared stage: camera framed from the model's bounding radius, lights, and orbit
 * controls. Works for tiny / huge / off-origin models (slicers often export parts at
 * the bed middle, e.g. 128,128). Auto-rotate orbits the CAMERA around the origin, so
 * the model itself never moves; children must already be centered on the origin.
 */
function Stage({
  radius,
  autoRotate,
  onUserInteract,
  children,
}: {
  radius: number;
  autoRotate: boolean;
  onUserInteract: () => void;
  children: ReactNode;
}) {
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
      {/* STL and 3MF are both Z-up; rotate exactly -90° about X so the model stands upright. */}
      <group rotation={[-Math.PI / 2, 0, 0]}>{children}</group>
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

type SceneProps = {
  url: string;
  color: string;
  autoRotate: boolean;
  onUserInteract: () => void;
};

/** STL: one mesh, uses the customer's chosen color. */
function StlScene({ url, color, autoRotate, onUserInteract }: SceneProps) {
  const raw = useLoader(STLLoader, url);
  // useLoader caches the parsed geometry; clone before mutating (centering).
  const { geometry, radius } = useMemo(() => centerGeometry(raw.clone()), [raw]);
  return (
    <Stage radius={radius} autoRotate={autoRotate} onUserInteract={onUserInteract}>
      <mesh geometry={geometry}>
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} />
      </mesh>
    </Stage>
  );
}

/**
 * 3MF: may hold several parts with their own colors. Colors in the file are kept; the
 * customer's chosen color is applied only to parts that have none.
 */
function ThreeMfScene({ url, color, autoRotate, onUserInteract }: SceneProps) {
  const loaded = useLoader(ThreeMFLoader, url);
  const { object, center, radius } = useMemo(() => {
    const object = prepareMultiPart(loaded, color, (m) => m.name === DEFAULT_3MF_MATERIAL);
    const { center, radius } = measureObject(object);
    return { object, center, radius };
  }, [loaded, color]);
  return (
    <Stage radius={radius} autoRotate={autoRotate} onUserInteract={onUserInteract}>
      {/* translate in model space so the model's own center sits on the origin */}
      <group position={[-center.x, -center.y, -center.z]}>
        <primitive object={object} />
      </group>
    </Stage>
  );
}

export type StlViewerProps = {
  url: string | null;
  color?: string;
  className?: string;
};

/**
 * Interactive 3D model viewer (STL or 3MF, chosen from the file extension). `key={url}` remounts the inner viewer for a new model,
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

/**
 * Rendered next to the scene inside the same <Suspense>, so it only mounts once the model has downloaded AND parsed.
 * Two animation frames later the first frame is on screen, which is when the loading overlay may fade out.
 */
function ReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    let id2 = 0;
    const id1 = requestAnimationFrame(() => {
      id2 = requestAnimationFrame(onReady);
    });
    return () => {
      cancelAnimationFrame(id1);
      cancelAnimationFrame(id2);
    };
  }, [onReady]);
  return null;
}

function Viewer({ url, color, className }: { url: string; color: string; className?: string }) {
  const reduced = usePrefersReducedMotion();
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const markReady = useCallback(() => setReady(true), []);
  const [spinning, setSpinning] = useState(true);
  // Bumping this remounts the canvas contents => camera + controls return to the framed view.
  const [view, setView] = useState(0);

  const reset = useCallback(() => {
    setView((n) => n + 1);
    setSpinning(true);
  }, []);

  if (failed) return <Placeholder className={className} />;

  // key={view} remounts the scene on "Reset view" => camera + controls return to the framed view.
  const sceneProps = {
    url,
    color,
    autoRotate: spinning && !reduced,
    onUserInteract: () => setSpinning(false),
  };

  return (
    <div className={`relative ${className ?? ""}`} onDoubleClick={reset}>
      <ErrorBoundary onError={() => setFailed(true)}>
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true }}
          aria-label="Interactive 3D model viewer"
        >
          <Suspense fallback={null}>
            {modelFormatOf(url) === "3mf" ? (
              <ThreeMfScene key={view} {...sceneProps} />
            ) : (
              <StlScene key={view} {...sceneProps} />
            )}
            <ReadySignal onReady={markReady} />
          </Suspense>
        </Canvas>
      </ErrorBoundary>
      <ViewerLoading ready={ready} />
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
