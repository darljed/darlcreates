"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useLoader, useFrame } from "@react-three/fiber";
import { OrbitControls, Center, Bounds } from "@react-three/drei";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import type { BufferGeometry, Mesh } from "three";
import { Box, Loader2 } from "lucide-react";

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

function Model({ url, color, autoRotate }: { url: string; color: string; autoRotate: boolean }) {
  const geometry = useLoader(STLLoader, url) as BufferGeometry;
  const ref = useRef<Mesh>(null);
  useFrame((_, delta) => {
    if (autoRotate && ref.current) ref.current.rotation.z += delta * 0.4;
  });
  // STL files are Z-up; tip slightly for a nicer default framing.
  return (
    <Center>
      <mesh ref={ref} geometry={geometry} rotation={[-Math.PI / 2.4, 0, 0]} castShadow>
        <meshStandardMaterial color={color} roughness={0.45} metalness={0.05} />
      </mesh>
    </Center>
  );
}

export type StlViewerProps = {
  url: string | null;
  color?: string;
  className?: string;
};

/** Interactive STL viewer. Falls back to a placeholder when no URL/model. */
export default function StlViewer({ url, color = "#ff2d78", className }: StlViewerProps) {
  const reduced = usePrefersReducedMotion();
  const [failed, setFailed] = useState(false);
  const autoRotate = !reduced;

  // Reset the failure state if the url changes.
  useEffect(() => setFailed(false), [url]);

  const placeholder = useMemo(
    () => (
      <div className="flex size-full flex-col items-center justify-center gap-2 bg-gradient-to-br from-primary/10 via-secondary/10 to-accent/20 text-muted-foreground">
        <Box className="size-16" />
        <span className="text-sm">3D preview unavailable</span>
      </div>
    ),
    [],
  );

  if (!url || failed) {
    return <div className={className}>{placeholder}</div>;
  }

  return (
    <div className={className}>
      <ErrorBoundary onError={() => setFailed(true)}>
        <Canvas
          camera={{ position: [0, 0, 120], fov: 40 }}
          dpr={[1, 2]}
          gl={{ antialias: true }}
          aria-label="Interactive 3D model viewer"
        >
          <ambientLight intensity={0.8} />
          <directionalLight position={[10, 10, 10]} intensity={1.1} />
          <directionalLight position={[-10, -5, -10]} intensity={0.4} />
          <Suspense fallback={null}>
            <Bounds fit clip observe margin={1.2}>
              <Model url={url} color={color} autoRotate={autoRotate} />
            </Bounds>
          </Suspense>
          <OrbitControls
            enablePan={false}
            enableDamping
            minDistance={40}
            maxDistance={300}
          />
        </Canvas>
      </ErrorBoundary>
    </div>
  );
}

/** Minimal error boundary so a bad/unreachable STL never blocks the page. */
import { Component, type ReactNode } from "react";
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

export { Loader2 };
