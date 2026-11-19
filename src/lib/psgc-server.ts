/**
 * Server side of the Philippine locations: reads the static files in public/psgc (the same ones the browser fetches), keeps them in
 * memory, checks that an address's province, city and barangay belong together, and makes a best guess for older saved addresses that
 * only have text. Server only (reads files).
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { normalizeName, parseIndex, parseProvince, PSGC_CODE, resolveIn, type PsgcIndex, type PsgcProvinceData, type ResolvedLocation } from "./psgc";

const dir = () => join(process.cwd(), "public", "psgc");
let indexP: Promise<PsgcIndex> | null = null;
const provinces = new Map<string, Promise<PsgcProvinceData | null>>();

export function loadPsgcIndex(): Promise<PsgcIndex> {
  indexP ??= readFile(join(dir(), "index.json"), "utf8").then((t) => parseIndex(JSON.parse(t))).catch((e) => { indexP = null; throw e; });
  return indexP;
}

/** One province's cities and barangays, or null when the code is not a province. */
export function loadPsgcProvince(code: string): Promise<PsgcProvinceData | null> {
  if (!PSGC_CODE.test(code)) return Promise.resolve(null);
  let p = provinces.get(code);
  if (!p) {
    p = readFile(join(dir(), "p", `${code}.json`), "utf8").then((t) => parseProvince(JSON.parse(t)), () => null);
    provinces.set(code, p);
  }
  return p;
}

/** The location behind three codes, with every name from the data; null when they are unknown or do not belong together. */
export async function resolveLocation(codes: { provinceCode: string; cityCode: string; barangayCode: string }): Promise<ResolvedLocation | null> {
  if (![codes.provinceCode, codes.cityCode, codes.barangayCode].every((c) => PSGC_CODE.test(c))) return null;
  const [index, data] = await Promise.all([loadPsgcIndex(), loadPsgcProvince(codes.provinceCode)]);
  return resolveIn(index, data, codes);
}

/**
 * Best guess for an older saved address that has only text (province, city, barangay as typed). Returns the codes only when
 * province, city AND barangay each match exactly one entry; otherwise null and the customer picks from the lists.
 */
export async function guessLocation(text: { province: string; city: string; barangay: string }): Promise<{ provinceCode: string; cityCode: string; barangayCode: string } | null> {
  const index = await loadPsgcIndex();
  const want = normalizeName(text.province.trim().replace(/^(ncr|national capital region( \(ncr\))?|metro manila)$/i, "Metro Manila"));
  const provs = index.provinces.filter((p) => {
    const n = normalizeName(p.name);
    return n === want || n.startsWith(want) || (want && want.length > 3 && n.includes(want));
  });
  const exact = provs.filter((p) => normalizeName(p.name) === want);
  for (const prov of exact.length ? exact : provs.length === 1 ? provs : []) {
    const data = await loadPsgcProvince(prov.code);
    if (!data) continue;
    const city = normalizeName(text.city);
    const cs = data.cities.filter((c) => normalizeName(c.name) === city);
    if (cs.length !== 1) continue;
    const brgy = normalizeName(text.barangay);
    const bs = (data.barangays[cs[0].code] ?? []).filter((b) => normalizeName(b.name) === brgy);
    if (bs.length === 1) return { provinceCode: prov.code, cityCode: cs[0].code, barangayCode: bs[0].code };
  }
  return null;
}
