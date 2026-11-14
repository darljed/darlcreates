import { formatPHP } from "@/lib/money";
import type { RevenuePoint } from "@/lib/admin";

/** Pure-CSS bar chart (no chart library). The table below is the accessible equivalent. */
export function RevenueChart({ points }: { points: RevenuePoint[] }) {
  const max = Math.max(...points.map((p) => p.cents), 1);
  const total = points.reduce((a, p) => a + p.cents, 0);
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  return (
    <figure>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={`Verified revenue, last ${points.length} days: ${formatPHP(total)} total`}>
        {points.map((p) => (
          <div key={p.day} className="group relative flex h-full flex-1 items-end">
            <div
              className={p.cents ? "w-full bg-primary/85 transition-colors group-hover:bg-primary" : "w-full bg-muted"}
              style={{ height: p.cents ? `${Math.max((p.cents / max) * 100, 4)}%` : "2px" }}
            />
            <span className="pointer-events-none absolute -top-7 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[11px] text-background group-hover:block">
              {fmt(p.day)}: {formatPHP(p.cents)}
            </span>
          </div>
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{fmt(points[0].day)}</span>
        <span>{formatPHP(total)} in {points.length} days</span>
        <span>{fmt(points[points.length - 1].day)}</span>
      </figcaption>
      <div className="sr-only">
      <table>
        <caption>Verified revenue by day</caption>
        <thead><tr><th scope="col">Day</th><th scope="col">Revenue</th></tr></thead>
        <tbody>{points.filter((p) => p.cents).map((p) => <tr key={p.day}><td>{p.day}</td><td>{formatPHP(p.cents)}</td></tr>)}</tbody>
      </table>
      </div>
    </figure>
  );
}
