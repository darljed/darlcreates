/**
 * A small picture of a clicker shape, drawn from the same outline the print uses.
 */
import { shapeRing, type ShapeId } from "@/lib/clicker/shapes";

export function ShapeThumb({ id, className }: { id: ShapeId; className?: string }) {
  const ring = shapeRing(id, 30, 30, { corner: 5, points: id === "star" ? 5 : 8 });
  const d = "M" + ring.map(([x, y]) => `${(x + 16).toFixed(2)} ${(16 - y).toFixed(2)}`).join("L") + "Z";
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <path d={d} fill="currentColor" />
    </svg>
  );
}
