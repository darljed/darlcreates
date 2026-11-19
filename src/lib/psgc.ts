/**
 * Philippine locations (PSA PSGC): the types of the static data in public/psgc, and the pure helpers around it. The data is built
 * by scripts/build-psgc.ts (see there for the source and how to refresh). Codes are the 10-digit PSGC codes, as strings.
 * Pure: the browser (the address pickers) and the server (checking an address, picking the shipping zone) both use it.
 */
export type PsgcRegion = { code: string; name: string };
/** `kind`: p province, n Metro Manila (NCR), c independent city, s special area. `group`: the island group. */
export type PsgcProvince = { code: string; name: string; regionCode: string; group: "luzon" | "visayas" | "mindanao"; kind: "p" | "n" | "c" | "s" };
export type PsgcCity = { code: string; name: string; municipality: boolean };
export type PsgcBarangay = { code: string; name: string };
/** One province's file: its cities and municipalities, and the barangays of each. */
export type PsgcProvinceData = { cities: PsgcCity[]; barangays: Record<string, PsgcBarangay[]> };
export type PsgcIndex = { source: string; regions: PsgcRegion[]; provinces: PsgcProvince[] };

type RawIndex = { source: string; regions: [string, string][]; provinces: [string, string, string, string, string][] };
type RawProvince = { c: [string, string, string][]; b: Record<string, [string, string][]> };

const GROUPS = { l: "luzon", v: "visayas", m: "mindanao" } as const;

export function parseIndex(raw: unknown): PsgcIndex {
  const r = raw as RawIndex;
  return {
    source: r.source,
    regions: r.regions.map(([code, name]) => ({ code, name })),
    provinces: r.provinces.map(([code, name, regionCode, g, kind]) => ({ code, name, regionCode, group: GROUPS[g as keyof typeof GROUPS], kind: kind as PsgcProvince["kind"] })),
  };
}

export function parseProvince(raw: unknown): PsgcProvinceData {
  const r = raw as RawProvince;
  return {
    cities: r.c.map(([code, name, level]) => ({ code, name, municipality: level === "M" })),
    barangays: Object.fromEntries(Object.entries(r.b).map(([city, list]) => [city, list.map(([code, name]) => ({ code, name }))])),
  };
}

/** Where a province's file is, for the browser. */
export const provinceUrl = (provinceCode: string) => `/psgc/p/${provinceCode}.json`;
export const INDEX_URL = "/psgc/index.json";

export const PSGC_CODE = /^\d{10}$/;

/** A resolved location: every name comes from the data, never from what the browser sent. */
export type ResolvedLocation = {
  regionCode: string;
  regionName: string;
  provinceCode: string;
  provinceName: string;
  cityCode: string;
  cityName: string;
  barangayCode: string;
  barangayName: string;
  group: PsgcProvince["group"];
};

/** Pure: resolve three codes against loaded data. Null when a code is unknown or does not belong to its parent. */
export function resolveIn(index: PsgcIndex, data: PsgcProvinceData | null, codes: { provinceCode: string; cityCode: string; barangayCode: string }): ResolvedLocation | null {
  const province = index.provinces.find((p) => p.code === codes.provinceCode);
  const region = province && index.regions.find((r) => r.code === province.regionCode);
  const city = data?.cities.find((c) => c.code === codes.cityCode);
  const barangay = city && data?.barangays[city.code]?.find((b) => b.code === codes.barangayCode);
  if (!province || !region || !city || !barangay) return null;
  return {
    regionCode: region.code,
    regionName: region.name,
    provinceCode: province.code,
    provinceName: province.name,
    cityCode: city.code,
    cityName: city.name,
    barangayCode: barangay.code,
    barangayName: barangay.name,
    group: province.group,
  };
}

/** A name for matching free text: lower-case, no accents, no filler words, no punctuation. */
export function normalizeName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\(pob\.?\)|\(.*?\)/g, " ")
    .replace(/\b(city of|municipality of|city|brgy|barangay|brg|bgy|pob|poblacion)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
