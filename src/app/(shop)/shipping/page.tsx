import { ShippingChecker } from "@/components/shipping-checker";
import { formatPHP } from "@/lib/money";
import { loadPsgcIndex } from "@/lib/psgc-server";
import { pageMetadata } from "@/lib/seo";
import { kg, ZONE_IDS, ZONE_LABELS, zoneOf } from "@/lib/shipping";
import { getShippingConfig } from "@/lib/site-content";

export const metadata = pageMetadata({
  title: "Shipping rates",
  description: "What delivery costs for your order: fees by province and parcel weight, plus how the fee is worked out.",
  path: "/shipping",
});

/** Public rate table. The numbers are owner-editable in Admin → Shipping. */
export default async function ShippingPage() {
  const [cfg, index] = await Promise.all([getShippingConfig(), loadPsgcIndex()]);
  const provinces = [...index.provinces].sort((a, b) => a.name.localeCompare(b.name));
  const verified = cfg.verifiedOn ? new Date(`${cfg.verifiedOn}T00:00:00Z`).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }) : "";
  const last = cfg.tiers.length - 1;

  return (
    <main className="flex-1">
      <div className="mx-auto max-w-3xl space-y-8 px-6 py-12">
        <div>
          <h1 className="text-3xl font-extrabold">Shipping rates</h1>
          <p className="mt-2 text-muted-foreground">
            The delivery fee depends on where your order goes and how heavy the parcel is. You see the exact fee at checkout before you pay.
          </p>
        </div>

        <section aria-labelledby="how" className="space-y-2">
          <h2 id="how" className="text-xl font-bold">How the fee is worked out</h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
            <li>The province you deliver to puts your order in a zone (for example Metro Manila, Visayas or Mindanao).</li>
            <li>We add up the weight of your items and {kg(cfg.packagingGrams)} for the box and packing. That is the parcel weight.</li>
            <li>The table below gives the fee for your zone and the weight band the parcel falls in.</li>
          </ol>
          {cfg.freeOverCents > 0 && <p className="text-sm font-semibold text-primary">Orders of {formatPHP(cfg.freeOverCents)} or more ship free.</p>}
        </section>

        <section aria-labelledby="table" className="space-y-2">
          <h2 id="table" className="text-xl font-bold">Rate table</h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[560px] border-collapse text-left text-sm">
              <caption className="sr-only">Delivery fee by parcel weight and zone</caption>
              <thead className="bg-muted/60 text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Parcel weight</th>
                  {ZONE_IDS.map((z) => (
                    <th key={z} scope="col" className="px-3 py-2 font-semibold">{ZONE_LABELS[z]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cfg.tiers.map((t, i) => (
                  <tr key={t} className="border-t">
                    <th scope="row" className="whitespace-nowrap px-3 py-2 font-medium">Up to {kg(t)}</th>
                    {ZONE_IDS.map((z) => (
                      <td key={z} className="px-3 py-2 tabular-nums">{formatPHP(cfg.rates[z][i])}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-sm text-muted-foreground">
            Heavier than {kg(cfg.tiers[last])}: the {kg(cfg.tiers[last])} fee plus, for each extra kilogram (or part of one),{" "}
            {ZONE_IDS.map((z, i) => (
              <span key={z}>
                {i > 0 && (i === ZONE_IDS.length - 1 ? " and " : ", ")}
                {formatPHP(cfg.overKgCents[z])} ({ZONE_LABELS[z]})
              </span>
            ))}
            .
          </p>
          {(verified || cfg.note) && (
            <div className="space-y-1 text-sm text-muted-foreground">
              {cfg.note && <p>{cfg.note}</p>}
              {verified && <p className="text-xs">Rates last checked on {verified}.</p>}
            </div>
          )}
        </section>

        <section aria-labelledby="check" className="space-y-2">
          <h2 id="check" className="text-xl font-bold">Check your fee</h2>
          <ShippingChecker config={cfg} provinces={provinces.map((p) => ({ code: p.code, name: p.name, group: p.group }))} />
        </section>

        <section aria-labelledby="zones" className="space-y-2">
          <h2 id="zones" className="text-xl font-bold">Which province is in which zone</h2>
          {ZONE_IDS.map((z) => {
            const list = provinces.filter((p) => zoneOf(cfg, p) === z);
            if (!list.length) return null;
            return (
              <details key={z} className="rounded-lg border bg-card px-4 py-2 text-sm">
                <summary className="cursor-pointer font-semibold">{ZONE_LABELS[z]} ({list.length})</summary>
                <p className="mt-2 pb-1 text-muted-foreground">{list.map((p) => p.name).join(", ")}</p>
              </details>
            );
          })}
        </section>
      </div>
    </main>
  );
}
