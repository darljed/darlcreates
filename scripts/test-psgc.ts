/**
 * Philippine locations (public/psgc, from the PSA PSGC): the data is complete and consistent (every province has its file, every city
 * is in a province, 42,010 barangays with unique codes, City of Manila's districts merged), an address's codes are checked against it
 * (a city from another province, a barangay from another city, a made-up code all fail), names come from the data, and older text-only
 * addresses can be matched. No database. Run: npx tsx scripts/test-psgc.ts
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeName, parseIndex, parseProvince } from "../src/lib/psgc";
import { guessLocation, loadPsgcIndex, loadPsgcProvince, resolveLocation } from "../src/lib/psgc-server";
import { DEFAULT_SHIPPING_CONFIG, ZONE_IDS, zoneOf } from "../src/lib/shipping";
import { CEBU_ALCANTARA, DAVAO_BANSALAN, PALAWAN_ABORLAN, QUEZON_CITY, SAN_PABLO } from "./fixtures/ph-address";

let failures = 0;
function assert(name: string, cond: boolean, extra = "") {
  if (!cond) { failures++; console.error(`  ✗ ${name} ${extra}`); } else console.log(`  ✓ ${name}`);
}

async function main() {
  const dir = join(process.cwd(), "public", "psgc");
  const index = parseIndex(JSON.parse(readFileSync(join(dir, "index.json"), "utf8")));
  console.log("\nthe data is complete");
  assert("18 regions (including Negros Island Region and BARMM) and 102 province-level units", index.regions.length === 18 && index.provinces.length === 102);
  assert("every province belongs to a region, with unique 10-digit codes", index.provinces.every((p) => /^\d{10}$/.test(p.code) && index.regions.some((r) => r.code === p.regionCode)) && new Set(index.provinces.map((p) => p.code)).size === 102);
  const files = readdirSync(join(dir, "p"));
  assert("every province has its file and there are no extras", files.length === 102 && index.provinces.every((p) => files.includes(`${p.code}.json`)));

  let barangays = 0, cities = 0;
  const brgyCodes = new Set<string>(), cityCodes = new Set<string>();
  const problems: string[] = [];
  for (const p of index.provinces) {
    const d = parseProvince(JSON.parse(readFileSync(join(dir, "p", `${p.code}.json`), "utf8")));
    if (d.cities.length === 0) problems.push(`${p.name} has no cities`);
    for (const c of d.cities) {
      cities++;
      if (cityCodes.has(c.code)) problems.push(`duplicate city ${c.code}`);
      cityCodes.add(c.code);
      const list = d.barangays[c.code] ?? [];
      if (list.length === 0) problems.push(`${c.name} (${p.name}) has no barangays`);
      if (c.code.slice(0, 2) !== p.regionCode.slice(0, 2)) problems.push(`${c.name} is outside its region`);
      for (const b of list) {
        barangays++;
        if (brgyCodes.has(b.code)) problems.push(`duplicate barangay ${b.code}`);
        brgyCodes.add(b.code);
        if (!b.name.trim()) problems.push(`blank barangay name ${b.code}`);
      }
      if (new Set(list.map((b) => b.name)).size !== list.length) problems.push(`two barangays of ${c.name} (${p.name}) share a name`);
    }
  }
  assert("no empty provinces or cities, no duplicate codes or names, every city in its region", problems.length === 0, problems.slice(0, 3).join("; "));
  assert("1,642 cities and municipalities (1,656 in PSGC, less Manila's 14 districts) and all 42,010 barangays", cities === 1642 && barangays === 42010, `${cities} ${barangays}`);

  console.log("\nknown places");
  const laguna = (await loadPsgcProvince(SAN_PABLO.provinceCode))!;
  assert("City of San Pablo has its 80 barangays, including Atisan", laguna.barangays[SAN_PABLO.cityCode].length === 80 && laguna.barangays[SAN_PABLO.cityCode].some((b) => b.name === "Atisan"));
  const ncr = (await loadPsgcProvince("1300000000"))!;
  const manila = ncr.cities.find((c) => c.name === "City of Manila")!;
  assert("City of Manila's districts are merged: one city with all its barangays", ncr.cities.length === 17 && ncr.barangays[manila.code].length === 897);
  assert("Quezon City has its 142 barangays", ncr.barangays[QUEZON_CITY.cityCode].length === 142);
  assert("poblacion barangays are marked (Pob.)", laguna.barangays[SAN_PABLO.cityCode].some((b) => b.name.endsWith("(Pob.)")));
  const baguio = index.provinces.find((p) => p.name.startsWith("City of Baguio"))!;
  assert("an independent city is a province-level unit with its one city", baguio.kind === "c" && (await loadPsgcProvince(baguio.code))!.cities.length === 1);

  console.log("\nan address's codes are checked");
  const ok = await resolveLocation(SAN_PABLO);
  assert("valid codes give the data's own names, region and island group", !!ok && ok.provinceName === "Laguna" && ok.cityName === "City of San Pablo" && ok.barangayName === "Atisan" && ok.regionName.includes("CALABARZON") && ok.group === "luzon");
  assert("Metro Manila resolves with its region", (await resolveLocation(QUEZON_CITY))?.regionName.includes("NCR") === true);
  assert("a city from another province is refused", (await resolveLocation({ ...SAN_PABLO, cityCode: QUEZON_CITY.cityCode })) === null);
  assert("a barangay from another city is refused", (await resolveLocation({ ...SAN_PABLO, barangayCode: QUEZON_CITY.barangayCode })) === null);
  assert("a made-up or malformed code is refused", (await resolveLocation({ ...SAN_PABLO, barangayCode: "9999999999" })) === null && (await resolveLocation({ ...SAN_PABLO, provinceCode: "../../etc/passwd" })) === null && (await resolveLocation({ provinceCode: "abc", cityCode: "", barangayCode: "" })) === null);
  assert("path tricks in a code cannot read other files", (await loadPsgcProvince("..%2F..%2Fpackage")) === null && (await loadPsgcProvince("0403400000/../../x")) === null);
  assert("the index is loaded once", (await loadPsgcIndex()) === (await loadPsgcIndex()));

  console.log("\nolder text-only addresses");
  const g1 = await guessLocation({ province: "Laguna", city: "San Pablo City", barangay: "Brgy. Atisan" });
  assert("Laguna / San Pablo City / Brgy. Atisan matches", g1?.barangayCode === SAN_PABLO.barangayCode && g1.cityCode === SAN_PABLO.cityCode);
  const g2 = await guessLocation({ province: "Metro Manila", city: "Quezon City", barangay: "alicia" });
  assert("Metro Manila / Quezon City / alicia matches", g2?.barangayCode === QUEZON_CITY.barangayCode);
  assert("NCR also means Metro Manila", (await guessLocation({ province: "NCR", city: "Quezon City", barangay: "Alicia" }))?.provinceCode === "1300000000");
  assert("an unknown barangay, a wrong city or a blank guess nothing", (await guessLocation({ province: "Laguna", city: "San Pablo City", barangay: "Nowhere" })) === null && (await guessLocation({ province: "Laguna", city: "Quezon City", barangay: "Alicia" })) === null && (await guessLocation({ province: "", city: "", barangay: "" })) === null);
  assert("matching ignores accents, case and filler words", normalizeName("Brgy. Poblacion (Pob.)") === "" && normalizeName("Las Piñas") === "las pinas" && normalizeName("City of Santa Rosa") === "santa rosa" && normalizeName("San Pablo City") === "san pablo");

  console.log("\nevery province has a shipping zone");
  const zones = index.provinces.map((p) => zoneOf(DEFAULT_SHIPPING_CONFIG, p));
  assert("all are one of the five zones", zones.every((z) => (ZONE_IDS as readonly string[]).includes(z)));
  const zone = (code: string) => zoneOf(DEFAULT_SHIPPING_CONFIG, index.provinces.find((p) => p.code === code)!);
  assert("Metro Manila / Laguna / Cebu / Davao del Sur / Palawan", zone("1300000000") === "metro-manila" && zone(SAN_PABLO.provinceCode) === "luzon" && zone(CEBU_ALCANTARA.provinceCode) === "visayas" && zone(DAVAO_BANSALAN.provinceCode) === "mindanao" && zone(PALAWAN_ABORLAN.provinceCode) === "island");
  assert("independent cities follow their island group (Baguio is Luzon)", zoneOf(DEFAULT_SHIPPING_CONFIG, baguio) === "luzon");
  assert("the default island provinces all exist in the data", Object.keys((await import("../src/lib/shipping")).DEFAULT_ISLAND_PROVINCES).every((c) => index.provinces.some((p) => p.code === c)));

  if (failures) { console.error(`\n${failures} assertion(s) failed`); process.exit(1); }
  console.log("\nAll location checks passed.");
}
main().catch((e) => { console.error(e); process.exit(1); });
