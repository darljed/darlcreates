/**
 * Builds the Philippine location data the address form and the shipping zones use, as small static JSON files in public/psgc:
 *   index.json        the regions and every "province" (real provinces, Metro Manila, and the independent cities / special areas
 *                     that PSGC lists as province-level units), each with its region and island group
 *   p/<province>.json that province's cities and municipalities and, per city, its barangays
 * Source: the PSA Philippine Standard Geographic Code (PSGC), as packaged by the MIT-licensed `psgc` Python package
 * (https://pypi.org/project/psgc/, "PSA PSGC Q1 2026 release": 18 regions, 82 provinces, 1,656 cities and municipalities, 42,010 barangays).
 * To refresh when PSA publishes a new quarter:
 *   pip download psgc --no-deps -d /tmp/psgc && unzip -o /tmp/psgc/psgc-*.whl -d /tmp/psgc/x
 *   npx tsx scripts/build-psgc.ts /tmp/psgc/x/psgc/data/core
 * Then run npx tsx scripts/test-psgc.ts. Codes are the 10-digit PSGC codes (strings; the leading zero matters).
 * City of Manila's barangays are listed under its 14 districts (sub-municipalities) in PSGC; here they are merged under City of Manila.
 */
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

type Region = { psgc_code: string; name: string };
type Province = { psgc_code: string; name: string; region_code: string; island_group: string; is_pseudo?: boolean; geographic_level?: string };
type City = { psgc_code: string; name: string; province_code: string; geographic_level: string };
type Barangay = { psgc_code: string; name: string; city_code: string; status?: string | null };

const from = process.argv[2];
if (!from) throw new Error("usage: npx tsx scripts/build-psgc.ts <dir with regions.json, provinces.json, cities.json, barangays.json>");
const read = <T>(f: string): T => JSON.parse(readFileSync(join(from, f), "utf8")) as T;
const regions = read<Region[]>("regions.json");
const provinces = read<Province[]>("provinces.json");
const cities = read<City[]>("cities.json");
const barangays = read<Barangay[]>("barangays.json");

const out = join(process.cwd(), "public", "psgc");
rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "p"), { recursive: true });
const cmp = (a: string, b: string) => a.localeCompare(b, "en", { sensitivity: "base", numeric: true });

/** How the unit appears in the province list. Independent cities and special areas are province-level units in PSGC. */
function provinceLabel(p: Province): { name: string; kind: "p" | "n" | "c" | "s" } {
  if (p.geographic_level === "PseudoProvince") return { name: "Metro Manila (National Capital Region)", kind: "n" };
  if (p.geographic_level === "HUCGroup") return { name: p.name.replace(/ \(Independent City\)$/, "") + " (independent city)", kind: "c" };
  if (p.name === "City of Isabela (Not a Province)") return { name: "City of Isabela (Basilan)", kind: "s" };
  if (p.geographic_level === "SpecialGroup") return { name: p.name, kind: "s" };
  return { name: p.name, kind: "p" };
}
const group = (g: string) => (g === "luzon" ? "l" : g === "visayas" ? "v" : "m");

const subToCity = new Map<string, string>(); // Manila's districts -> City of Manila
for (const c of cities) if (c.geographic_level === "SubMun") {
  const parent = cities.find((x) => x.province_code === c.province_code && x.name === "City of Manila");
  if (parent) subToCity.set(c.psgc_code, parent.psgc_code);
}
const display = (b: Barangay) => (b.status === "Pob." ? `${b.name} (Pob.)` : b.name);

const brgyByCity = new Map<string, [string, string][]>();
for (const b of barangays) {
  const city = subToCity.get(b.city_code) ?? b.city_code;
  const list = brgyByCity.get(city) ?? [];
  list.push([b.psgc_code, display(b)]);
  brgyByCity.set(city, list);
}

let nBrgy = 0, nCity = 0;
for (const p of provinces) {
  const pc = cities.filter((c) => c.province_code === p.psgc_code && c.geographic_level !== "SubMun").sort((a, b) => cmp(a.name, b.name));
  const cityList = pc.map((c) => [c.psgc_code, c.name, c.geographic_level === "Mun" ? "M" : "C"]);
  const b: Record<string, [string, string][]> = {};
  for (const c of pc) {
    const list = (brgyByCity.get(c.psgc_code) ?? []).sort((x, y) => cmp(x[1], y[1]));
    b[c.psgc_code] = list;
    nBrgy += list.length;
  }
  nCity += pc.length;
  writeFileSync(join(out, "p", `${p.psgc_code}.json`), JSON.stringify({ c: cityList, b }));
}
const index = {
  source: "PSA Philippine Standard Geographic Code (PSGC), Q1 2026 release, via the MIT-licensed psgc package",
  regions: regions.map((r) => [r.psgc_code, r.name]),
  provinces: provinces
    .map((p) => {
      const l = provinceLabel(p);
      return [p.psgc_code, l.name, p.region_code, group(p.island_group), l.kind];
    })
    .sort((a, b) => cmp(String(a[1]), String(b[1]))),
};
writeFileSync(join(out, "index.json"), JSON.stringify(index));
console.log(`regions ${regions.length}, provinces ${provinces.length}, cities and municipalities ${nCity}, barangays ${nBrgy} (source has ${barangays.length})`);
