"use client";

/**
 * The 3D view of a clicker being designed. It draws the very pieces the printer will get (one solid per colour), with
 * orbit, zoom and a top view. "Inside" lifts the key off the base to show the switch pocket and a ghost switch. Clicking a
 * part picks it (so the designer can offer its colour). In "move" mode a drag on the clicker moves the design layer under
 * the pointer, or swings the keyring tab round the base; the camera stays put while you do. While you drag, a light preview
 * (a blue copy of the layer, or the ring) follows the pointer on the graphics card, and the clicker itself is rebuilt once,
 * when you let go: rebuilding on every pointer move is far too slow to feel smooth. If WebGL is not available it falls back to
 * a flat picture.
 */
import { Component, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls, PerspectiveCamera } from "@react-three/drei";
import { BufferGeometry, DoubleSide, Float32BufferAttribute, Path, Shape, ShapeGeometry, Vector2, Vector3, type Group, type PerspectiveCamera as Cam } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import type { Layout } from "@/lib/clicker/layout";
import type { SolidPart } from "@/lib/clicker/extrude";
import { boundsOf } from "@/lib/clicker/poly";
import { FIT } from "@/lib/clicker/fit";

export type ViewMode = "3d" | "top";
export type Point = [number, number];
/** What a drag in Move mode is moving: a design layer, or the keyring tab. */
export type DragTarget = { kind: "layer"; id: string } | { kind: "keyring" };

export type ClickerViewerProps = {
  solids: SolidPart[];
  layout: Layout;
  selectedLayerId: string | null;
  view: ViewMode;
  /** Lift the key off the base to show the inside, with the switch. */
  explode: boolean;
  /** A part was clicked (not dragged). */
  onPick?: (part: { object: "housing" | "cap"; role: string; color: string }) => void;
  /** When on, dragging on the clicker moves things instead of orbiting the camera. */
  moveMode: boolean;
  /** Called when a drag begins: say what is under the pointer (or null for nothing). */
  onDragStart: (p: Point) => DragTarget | null;
  /** Called once, when the pointer is released, with where it ended. */
  onDragEnd: (p: Point) => void;
  /** The flat picture shown if WebGL cannot start. */
  fallback: ReactNode;
};

/** How far the key lifts in the inside view (mm). */
const LIFT = 26;

function Parts({ solids, explode, onPick, moveMode }: { solids: SolidPart[]; explode: boolean; onPick?: ClickerViewerProps["onPick"]; moveMode: boolean }) {
  // (the geometries belong to the designer's cache, which frees them when it drops them)
  const cap = useRef<Group | null>(null);
  useFrame((_, dt) => {
    const g = cap.current;
    if (!g) return;
    const target = explode ? LIFT : 0;
    g.position.z += (target - g.position.z) * Math.min(1, dt * 7);
    if (Math.abs(target - g.position.z) < 0.01) g.position.z = target;
  });
  const mesh = (s: SolidPart) => (
    <mesh
      key={`${s.id}-${s.color}`}
      geometry={s.geometry}
      onClick={(e) => {
        if (moveMode || !onPick || e.delta > 4) return;
        e.stopPropagation();
        onPick({ object: s.object, role: s.role, color: s.color });
      }}
    >
      <meshStandardMaterial color={s.color} roughness={0.55} metalness={0.04} />
    </mesh>
  );
  return (
    <>
      {solids.filter((s) => s.object === "housing").map(mesh)}
      <group ref={cap}>{solids.filter((s) => s.object === "cap").map(mesh)}</group>
    </>
  );
}

/** A see-through MX switch in each pocket: the body below the deck, the top housing above it, and the cross stem. */
function GhostSwitches({ layout, show }: { layout: Layout; show: boolean }) {
  if (!show) return null;
  const deck = FIT.deckTopMm;
  const mat = (color: string, opacity: number) => <meshStandardMaterial color={color} transparent opacity={opacity} roughness={0.6} depthWrite={false} />;
  return (
    <>
      {layout.switches.map((k, i) => (
        <group key={i} position={[k.x, k.y, 0]}>
          <mesh position={[0, 0, (deck + 1.7) / 2]}><boxGeometry args={[13.6, 13.6, deck - 1.7]} />{mat("#9ca3af", 0.45)}</mesh>
          <mesh position={[0, 0, deck + 0.75]}><boxGeometry args={[15.4, 15.4, 1.5]} />{mat("#374151", 0.6)}</mesh>
          <mesh position={[0, 0, deck + 3.5]}><boxGeometry args={[11.4, 11.4, 4]} />{mat("#374151", 0.55)}</mesh>
          <mesh position={[0, 0, (deck + 5.5 + FIT.capRestZ + FIT.crossDepthMm) / 2]}><boxGeometry args={[FIT.crossSpanMm, FIT.crossArmMm, FIT.capRestZ + FIT.crossDepthMm - deck - 5.5]} />{mat("#2563eb", 0.9)}</mesh>
          <mesh position={[0, 0, (deck + 5.5 + FIT.capRestZ + FIT.crossDepthMm) / 2]}><boxGeometry args={[FIT.crossArmMm, FIT.crossSpanMm, FIT.capRestZ + FIT.crossDepthMm - deck - 5.5]} />{mat("#2563eb", 0.9)}</mesh>
        </group>
      ))}
    </>
  );
}

type Live = { target: DragTarget; start: Point; cur: Point };

/**
 * The preview that follows the pointer while you drag: a blue flat copy of the layer, or the keyring ring. Its position is
 * set every frame straight from the pointer, with no React state and no rebuild, so it keeps up however heavy the design is.
 */
function DragGhost({ layout, live, target, z }: { layout: Layout; live: MutableRefObject<Live | null>; target: DragTarget; z: number }) {
  const group = useRef<Group | null>(null);
  const geometry = useMemo(() => {
    if (target.kind !== "layer") return null;
    const shapes = layout.layerShapes.get(target.id);
    if (!shapes?.length) return null;
    const list = shapes.map((r) => {
      const sh = new Shape(r.outer.map(([x, y]) => new Vector2(x, y)));
      for (const h of r.holes) sh.holes.push(new Path(h.map(([x, y]) => new Vector2(x, y))));
      return sh;
    });
    return new ShapeGeometry(list);
  }, [layout, target]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useFrame(() => {
    const g = group.current, l = live.current;
    if (!g || !l) return;
    if (l.target.kind === "layer") g.position.set(l.cur[0] - l.start[0], l.cur[1] - l.start[1], 0);
    else {
      const kr = layout.keyring;
      const r = kr ? Math.hypot(kr.cx, kr.cy) : 0;
      const a = Math.atan2(l.cur[1], l.cur[0]);
      g.position.set(r * Math.cos(a) - (kr?.cx ?? 0), r * Math.sin(a) - (kr?.cy ?? 0), 0);
    }
  });
  return (
    <group ref={group}>
      {geometry && (
        <mesh geometry={geometry} position={[0, 0, z]} renderOrder={18}>
          <meshBasicMaterial color="#0ea5e9" transparent opacity={0.6} depthTest={false} side={DoubleSide} />
        </mesh>
      )}
      {target.kind === "keyring" && layout.keyring && (
        <mesh position={[layout.keyring.cx, layout.keyring.cy, FIT.keyringMm + 0.2]} renderOrder={19}>
          <ringGeometry args={[layout.keyring.holeR + 0.2, layout.keyring.holeR + 1.1, 40]} />
          <meshBasicMaterial color="#0ea5e9" side={DoubleSide} depthTest={false} transparent opacity={0.9} />
        </mesh>
      )}
    </group>
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

function Scene({ solids, layout, selectedLayerId, view, moveMode, explode, onPick, onDragStart, onDragEnd }: Omit<ClickerViewerProps, "fallback">) {
  const controls = useRef<OrbitControlsImpl | null>(null);
  const camera = useRef<Cam | null>(null);
  const dragging = useRef(false);
  const live = useRef<Live | null>(null);
  // the preview stays on screen until the rebuilt clicker arrives, so the layer does not jump back for a moment
  const [ghostFor, setGhostFor] = useState<{ target: DragTarget; since: Layout | null } | null>(null);
  useEffect(() => {
    if (!ghostFor || ghostFor.since === null) return;
    if (layout !== ghostFor.since) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- the new layout has arrived: drop the preview
      setGhostFor(null);
      live.current = null;
    }
  }, [layout, ghostFor]);
  useEffect(() => {
    if (!ghostFor || ghostFor.since === null) return;
    const t = setTimeout(() => { setGhostFor(null); live.current = null; }, 2500); // nothing changed, or a very slow rebuild
    return () => clearTimeout(t);
  }, [ghostFor]);
  const size = Math.max(layout.bounds.maxX - layout.bounds.minX, layout.bounds.maxY - layout.bounds.minY, layout.totalHeight * 1.3, 30);
  const top = layout.totalHeight;

  // Put the camera where the view wants it: far enough back to see the whole clicker (and the lifted key in the inside view).
  // It re-frames when the view changes or the clicker's size changes by more than a tenth, keeping the way you are looking.
  const frame = useRef({ R: 0, view, explode });
  const H = layout.totalHeight + (explode ? LIFT : 0);
  const w = layout.bounds.maxX - layout.bounds.minX, h = layout.bounds.maxY - layout.bounds.minY;
  const R = Math.hypot(w, h, H) / 2;
  const cx = (layout.bounds.minX + layout.bounds.maxX) / 2, cy = (layout.bounds.minY + layout.bounds.maxY) / 2;
  useEffect(() => {
    const cam = camera.current, ctl = controls.current;
    if (!cam || !ctl) return;
    const prev = frame.current;
    const first = !cam.userData.framed;
    const viewChanged = prev.view !== view || prev.explode !== explode;
    if (!first && !viewChanged && Math.abs(prev.R - R) / Math.max(R, 1) < 0.1) return;
    frame.current = { R, view, explode };
    cam.userData.framed = true;
    const centre = new Vector3(cx, cy, view === "top" ? 0 : H * 0.5);
    const fov = (35 * Math.PI) / 180;
    let dir: Vector3;
    let dist: number;
    if (view === "top") {
      dir = new Vector3(0, -0.0001, 1).normalize();
      dist = (Math.max(w, h) / 2 / Math.tan(fov / 2)) * 1.25 + layout.totalHeight;
    } else {
      dir = first || viewChanged ? new Vector3(0.3, -0.85, 0.5).normalize() : cam.position.clone().sub(ctl.target).normalize();
      dist = (R / Math.sin(fov / 2)) * 1.08;
    }
    cam.position.copy(centre).addScaledVector(dir, dist);
    ctl.target.copy(centre);
    ctl.update();
  }, [view, explode, R, H, w, h, cx, cy, layout.totalHeight]);

  const toPoint = (e: ThreeEvent<PointerEvent>): Point => [e.point.x, e.point.y];
  const kr = layout.keyring;

  return (
    <>
      {/* The start position is a constant on purpose: this library moves the camera back whenever a position prop changes, which threw
          you out of the top view each time the clicker changed size. The effect above places the camera. */}
      <PerspectiveCamera ref={camera} makeDefault fov={35} near={0.5} far={4000} up={[0, 0, 1]} position={[30, -100, 60]} />
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
        minDistance={R * 0.8}
        maxDistance={R * 9}
        maxPolarAngle={Math.PI * 0.55}
      />

      {/* a soft disc under the clicker so it does not float */}
      <mesh position={[(layout.bounds.minX + layout.bounds.maxX) / 2, (layout.bounds.minY + layout.bounds.maxY) / 2, -0.04]}>
        <circleGeometry args={[size * 0.85, 48]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.05} />
      </mesh>

      <Parts solids={solids} explode={explode && !moveMode} onPick={onPick} moveMode={moveMode} />
      <GhostSwitches layout={layout} show={explode && !moveMode} />
      <SelectionBox layout={layout} layerId={selectedLayerId} z={top + 0.08} />

      {moveMode && kr && ghostFor?.target.kind !== "keyring" && (
        <mesh position={[kr.cx, kr.cy, FIT.keyringMm + 0.1]} renderOrder={19}>
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
            const p = toPoint(e);
            const t = onDragStart(p);
            if (!t) return;
            (e.target as Element | null)?.setPointerCapture?.(e.pointerId);
            dragging.current = true;
            live.current = { target: t, start: p, cur: p };
            setGhostFor({ target: t, since: null });
          }}
          onPointerMove={(e) => {
            if (!dragging.current || !live.current) return;
            e.stopPropagation();
            live.current.cur = toPoint(e);
          }}
          onPointerUp={(e) => {
            if (!dragging.current) return;
            e.stopPropagation();
            dragging.current = false;
            (e.target as Element | null)?.releasePointerCapture?.(e.pointerId);
            const p = toPoint(e);
            if (live.current) live.current.cur = p;
            setGhostFor((g) => (g ? { ...g, since: layout } : g));
            onDragEnd(p);
          }}
        >
          <planeGeometry args={[size * 8, size * 8]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} side={DoubleSide} />
        </mesh>
      )}
      {ghostFor && <DragGhost layout={layout} live={live} target={ghostFor.target} z={top + 0.12} />}
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
