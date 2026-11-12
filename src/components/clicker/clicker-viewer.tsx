"use client";

/**
 * The 3D view of a clicker being designed. It draws the very pieces the printer will get (one solid per colour), with
 * orbit, zoom and a top view. In "move" mode a drag on the clicker moves the design layer under the pointer, or swings the
 * keyring round the edge; the camera stays put while you do. If WebGL is not available it falls back to a flat picture.
 */
import { Component, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Canvas, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Vector3, type PerspectiveCamera as Cam } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Layout } from "@/lib/clicker/layout";
import type { SolidPart } from "@/lib/clicker/extrude";
import { boundsOf } from "@/lib/clicker/poly";

export type ViewMode = "3d" | "top";
export type Point = [number, number];

export type ClickerViewerProps = {
  solids: SolidPart[];
  layout: Layout;
  selectedLayerId: string | null;
  view: ViewMode;
  /** When on, dragging on the clicker moves things instead of orbiting the camera. */
  moveMode: boolean;
  onDragStart: (p: Point) => void;
  onDrag: (p: Point) => void;
  onDragEnd: () => void;
  /** The flat picture shown if WebGL cannot start. */
  fallback: ReactNode;
};

function Parts({ solids }: { solids: SolidPart[] }) {
  // the geometries belong to the layout that made them; free the GPU copies when a newer set replaces them
  useEffect(() => () => solids.forEach((s) => s.geometry.dispose()), [solids]);
  return (
    <>
      {solids.map((s) => (
        <mesh key={`${s.id}-${s.color}`} geometry={s.geometry}>
          <meshStandardMaterial color={s.color} roughness={0.55} metalness={0.04} />
        </mesh>
      ))}
    </>
  );
}

/** A thin box round the selected layer, so you can see what you are moving. */
function SelectionBox({ layout, layerId, z }: { layout: Layout; layerId: string | null; z: number }) {
  const geometry = useMemo(() => {
    const shapes = layerId ? layout.layerShapes.get(layerId) : undefined;
    if (!shapes?.length) return null;
    const b = boundsOf(shapes);
    const m = 0.6;
    const pts = [b.minX - m, b.minY - m, z, b.maxX + m, b.minY - m, z, b.maxX + m, b.maxY + m, z, b.minX - m, b.maxY + m, z];
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(pts, 3));
    return g;
  }, [layout, layerId, z]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <lineLoop geometry={geometry} renderOrder={20}>
      <lineBasicMaterial color="#0ea5e9" depthTest={false} transparent opacity={0.95} />
    </lineLoop>
  );
}

function Scene({ solids, layout, selectedLayerId, view, moveMode, onDragStart, onDrag, onDragEnd }: Omit<ClickerViewerProps, "fallback">) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const camera = useRef<Cam | null>(null);
  const dragging = useRef(false);
  const size = Math.max(layout.bounds.maxX - layout.bounds.minX, layout.bounds.maxY - layout.bounds.minY, 20);
  const top = layout.totalHeight;

  // put the camera where the chosen view wants it (also when the clicker's size changes enough to need re-framing)
  const frame = useRef({ size, view });
  useEffect(() => {
    const cam = camera.current, ctl = controls.current;
    if (!cam || !ctl) return;
    const changedView = frame.current.view !== view;
    const changedSize = Math.abs(frame.current.size - size) / size > 0.25;
    frame.current = { size, view };
    if (!changedView && !changedSize && cam.userData.framed) return;
    cam.userData.framed = true;
    const d = size * 1.9;
    const p = view === "top" ? new Vector3(0, -d * 0.0001, d) : new Vector3(size * 0.35, -size * 1.15, size * 1.25);
    cam.position.copy(p);
    ctl.target.set((layout.bounds.minX + layout.bounds.maxX) / 2, (layout.bounds.minY + layout.bounds.maxY) / 2, 0);
    ctl.update();
  }, [view, size, layout.bounds.minX, layout.bounds.maxX, layout.bounds.minY, layout.bounds.maxY]);

  const toPoint = (e: ThreeEvent<PointerEvent>): Point => [e.point.x, e.point.y];
  const kr = layout.keyring;

  return (
    <>
      <PerspectiveCamera ref={camera} makeDefault fov={35} near={0.5} far={2000} up={[0, 0, 1]} position={[size * 0.35, -size * 1.15, size * 1.25]} />
      <ambientLight intensity={0.95} />
      <directionalLight position={[size, -size * 1.2, size * 2]} intensity={1.15} />
      <directionalLight position={[-size, size, size * 0.8]} intensity={0.35} />
      <OrbitControls
        ref={controls}
        makeDefault
        enableRotate={!moveMode && view === "3d"}
        enablePan={view === "3d"}
        screenSpacePanning
        enableDamping
        minDistance={size * 0.6}
        maxDistance={size * 6}
        maxPolarAngle={Math.PI * 0.55}
      />

      {/* a soft disc under the clicker so it does not float */}
      <mesh position={[(layout.bounds.minX + layout.bounds.maxX) / 2, (layout.bounds.minY + layout.bounds.maxY) / 2, -0.04]}>
        <circleGeometry args={[size * 0.85, 48]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.05} />
      </mesh>

      <Parts solids={solids} />
      <SelectionBox layout={layout} layerId={selectedLayerId} z={top + 0.08} />

      {moveMode && kr && (
        <mesh position={[kr.cx, kr.cy, top + 0.1]} renderOrder={19}>
          <ringGeometry args={[kr.holeR + 0.2, kr.holeR + 0.9, 40]} />
          <meshBasicMaterial color="#0ea5e9" side={DoubleSide} depthTest={false} transparent opacity={0.8} />
        </mesh>
      )}

      {/* the surface a drag lands on: invisible, level with the top of the clicker, bigger than it */}
      {moveMode && (
        <mesh
          position={[0, 0, top]}
          onPointerDown={(e) => {
            e.stopPropagation();
            (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
            dragging.current = true;
            onDragStart(toPoint(e));
          }}
          onPointerMove={(e) => {
            if (!dragging.current) return;
            e.stopPropagation();
            onDrag(toPoint(e));
          }}
          onPointerUp={(e) => {
            if (!dragging.current) return;
            e.stopPropagation();
            dragging.current = false;
            (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
            onDragEnd();
          }}
        >
          <planeGeometry args={[size * 8, size * 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
        </mesh>
      )}
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

export default function ClickerViewer(props: ClickerViewerProps) {
  return (
    <WebGlGuard fallback={props.fallback}>
      <div className="size-full" style={{ cursor: props.moveMode ? "grab" : "default", touchAction: props.moveMode ? "none" : "pan-y" }}>
        <Canvas dpr={[1, 2]} gl={{ antialias: true }} aria-label="3D view of your clicker">
          <Scene {...props} />
        </Canvas>
      </div>
    </WebGlGuard>
  );
}
