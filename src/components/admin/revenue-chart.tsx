import { formatPHP } from "@/lib/money";
import type { SourcePoint } from "@/lib/workshop/summary";

/**
 * Pure-CSS stacked bar chart (no chart library): each day is a bar, online revenue (verified payments) at the bottom and off-site
 * sales (the sales log, Paid) on top, so you can see at a glance where the money came from. The table below is the accessible equivalent.
 */
export function RevenueChart({ points }: { points: SourcePoint[] }) {
  const max = Math.max(...points.map((p) => p.onlineCents + p.offsiteCents), 1);
  const online = points.reduce((a, p) => a + p.onlineCents, 0);
  const offsite = points.reduce((a, p) => a + p.offsiteCents, 0);
  const fmt = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  return (
    <figure>
      <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 bg-primary" aria-hidden /> Online <strong className="tabular-nums">{formatPHP(online)}</strong></span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2.5 bg-accent" aria-hidden /> Off-site <strong className="tabular-nums">{formatPHP(offsite)}</strong></span>
      </div>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={`Revenue, last ${points.length} days: ${formatPHP(online + offsite)} total, ${formatPHP(online)} online and ${formatPHP(offsite)} off-site`}>
        {points.map((p) => {
          const total = p.onlineCents + p.offsiteCents;
          return (
            <div key={p.day} className="group relative flex h-full flex-1 items-end">
              {total === 0 ? (
                <div className="h-[2px] w-full bg-muted" />
              ) : (
                <div className="flex w-full flex-col-reverse" style={{ height: `${Math.max((total / max) * 100, 4)}%` }}>
                  {p.onlineCents > 0 && <div className="w-full bg-primary/85 group-hover:bg-primary" style={{ flexGrow: p.onlineCents }} />}
                  {p.offsiteCents > 0 && <div className="w-full bg-accent" style={{ flexGrow: p.offsiteCents }} />}
                </div>
              )}
              <span className="pointer-events-none absolute -top-12 left-1/2 z-10 hidden -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[11px] text-background group-hover:block">
                {fmt(p.day)}: {formatPHP(total)}<br />online {formatPHP(p.onlineCents)} · off-site {formatPHP(p.offsiteCents)}
              </span>
            </div>
          );
        })}
      </div>
      <figcaption className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>{fmt(points[0].day)}</span>
        <span>{formatPHP(online + offsite)} in {points.length} days</span>
        <span>{fmt(points[points.length - 1].day)}</span>
      </figcaption>
      <div className="sr-only">
        <table>
          <caption>Revenue by day and source</caption>
          <thead><tr><th scope="col">Day</th><th scope="col">Online</th><th scope="col">Off-site</th></tr></thead>
          <tbody>{points.filter((p) => p.onlineCents || p.offsiteCents).map((p) => <tr key={p.day}><td>{p.day}</td><td>{formatPHP(p.onlineCents)}</td><td>{formatPHP(p.offsiteCents)}</td></tr>)}</tbody>
        </table>
      </div>
    </figure>
  );
}
