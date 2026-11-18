"use client";

/**
 * The 3D view of a name keychain being designed. It draws the very pieces the printer will get (one solid per colour), with
 * orbit and zoom, and a top view. If WebGL is not available it falls back to a flat picture.
 */
import { Component, useEffect, useRef, type ReactNode } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { Vector3 } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { SolidPart } from "@/lib/clicker/extrude";
import type { Bounds } from "@/lib/clicker/poly";

export type KeychainViewMode = "3d" | "top";

export type KeychainViewerProps = {
  solids: SolidPart[];
  bounds: Bounds;
  totalHeight: number;
  view: KeychainViewMode;
  /** The flat picture shown if WebGL cannot start. */
  fallback: ReactNode;
};

function Scene({ solids, bounds, totalHeight, view }: Omit<KeychainViewerProps, "fallback">) {
  const camera = useThree((s) => s.camera);
  const controls = useRef<OrbitControlsImpl | null>(null);
  const framed = useRef<{ R: number; view: KeychainViewMode } | null>(null);
  const w = Math.max(bounds.maxX - bounds.minX, 10), h = Math.max(bounds.maxY - bounds.minY, 6);
  const cx = (bounds.minX + bounds.maxX) / 2, cy = (bounds.minY + bounds.maxY) / 2;
  const R = Math.hypot(w, h) / 2;

  // Place the camera once, when the view changes, and again only if the keychain grows or shrinks a lot (so turning it
  // round is not undone by every letter you type).
  useEffect(() => {
    const ctl = controls.current;
    const prev = framed.current;
    if (!ctl || (prev && prev.view === view && Math.abs(prev.R - R) / Math.max(R, 1) < 0.3)) return;
    framed.current = { R, view };
    const fov = (35 * Math.PI) / 180;
    const centre = new Vector3(cx, cy, totalHeight / 2);
    const aspect = (camera as { aspect?: number }).aspect ?? 1.33;
    const fitW = w / 2 / aspect / Math.tan(fov / 2), fitH = h / 2 / Math.tan(fov / 2);
    const dist = Math.max(fitW, fitH) * 1.12 + totalHeight;
    const dir = view === "top" ? new Vector3(0, -0.0001, 1).normalize() : new Vector3(0, -0.62, 0.78).normalize();
    camera.position.copy(centre).addScaledVector(dir, dist);
    ctl.target.copy(centre);
    ctl.update();
  }, [view, R, w, h, cx, cy, totalHeight, camera]);

  return (
    <>
      {/* a constant start position: the library moves the camera back whenever this prop changes */}
      <PerspectiveCamera makeDefault fov={35} near={0.5} far={2000} up={[0, 0, 1]} position={[0, -90, 100]} />
      <ambientLight intensity={1} />
      <directionalLight position={[R, -R * 1.4, R * 2.2]} intensity={1.1} />
      <directionalLight position={[-R, R, R]} intensity={0.35} />
      <OrbitControls ref={controls} makeDefault enableRotate={view === "3d"} enablePan={view === "3d"} screenSpacePanning enableDamping minDistance={R * 0.6} maxDistance={R * 9} maxPolarAngle={Math.PI * 0.55} />
      <mesh position={[cx, cy, -0.05]}>
        <circleGeometry args={[Math.max(w, h) * 0.75, 48]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.05} />
      </mesh>
      {solids.map((p) => (
        // (the geometries belong to the designer's cache, which frees them when it drops them)
        <mesh key={p.id} geometry={p.geometry}>
          <meshStandardMaterial color={p.color} roughness={0.55} metalness={0.02} />
        </mesh>
      ))}
    </>
  );
}

class WebGlGuard extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export default function KeychainViewer({ fallback, ...props }: KeychainViewerProps) {
  return (
    <WebGlGuard fallback={fallback}>
      <div className="size-full" style={{ touchAction: "pan-y" }}>
        <Canvas dpr={[1, 2]} gl={{ antialias: true }} aria-label="3D view of your keychain">
          <Scene {...props} />
        </Canvas>
      </div>
    </WebGlGuard>
  );
}
