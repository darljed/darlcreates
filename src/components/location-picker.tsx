"use client";

/**
 * Province / city / barangay picker (PSA PSGC data from public/psgc). Controlled; three native selects that cascade, plus hidden inputs
 * (provinceCode, cityCode, barangayCode) so a plain <form> posts the codes. The province index and each province's file are fetched once
 * and cached at module level.
 */

import { useEffect, useRef, useState } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { INDEX_URL, normalizeName, parseIndex, parseProvince, provinceUrl, type PsgcIndex, type PsgcProvince, type PsgcProvinceData } from "@/lib/psgc";

export type LocationValue = { provinceCode: string; cityCode: string; barangayCode: string };
export const EMPTY_LOCATION: LocationValue = { provinceCode: "", cityCode: "", barangayCode: "" };

const BARANGAY_FILTER_MIN = 30;

let indexPromise: Promise<PsgcIndex> | null = null;
const provincePromises = new Map<string, Promise<PsgcProvinceData>>();

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not fetch ${url}`);
  return res.json();
}

function loadIndex(): Promise<PsgcIndex> {
  indexPromise ??= fetchJson(INDEX_URL).then(parseIndex).catch((e: unknown) => {
    indexPromise = null;
    throw e;
  });
  return indexPromise;
}

function loadProvince(code: string): Promise<PsgcProvinceData> {
  let p = provincePromises.get(code);
  if (!p) {
    p = fetchJson(provinceUrl(code)).then(parseProvince).catch((e: unknown) => {
      provincePromises.delete(code);
      throw e;
    });
    provincePromises.set(code, p);
  }
  return p;
}

const SELECT_CLASS =
  "h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30";

export function LocationPicker({ value, onChange, onProvince, idPrefix = "loc", disabled }: {
  value: LocationValue;
  onChange: (v: LocationValue) => void;
  onProvince?: (p: PsgcProvince | null) => void;
  idPrefix?: string;
  disabled?: boolean;
}) {
  const [index, setIndex] = useState<PsgcIndex | null>(null);
  const [loaded, setLoaded] = useState<{ code: string; data: PsgcProvinceData } | null>(null);
  const [failed, setFailed] = useState<"index" | "province" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [filter, setFilter] = useState<{ city: string; text: string }>({ city: "", text: "" });

  // Latest props for use inside async callbacks and the notify effect.
  const latest = useRef({ value, onChange, onProvince });
  useEffect(() => {
    latest.current = { value, onChange, onProvince };
  });

  useEffect(() => {
    let live = true;
    loadIndex().then(
      (i) => live && (setIndex(i), setFailed((f) => (f === "index" ? null : f))),
      () => live && setFailed("index"),
    );
    return () => {
      live = false;
    };
  }, [attempt]);

  const { provinceCode } = value;
  useEffect(() => {
    if (!provinceCode) return;
    let live = true;
    loadProvince(provinceCode).then(
      (data) => {
        if (!live) return;
        setLoaded({ code: provinceCode, data });
        setFailed((f) => (f === "province" ? null : f));
        const cur = latest.current.value;
        if (data.cities.length === 1 && cur.provinceCode === provinceCode && !cur.cityCode) {
          latest.current.onChange({ ...cur, cityCode: data.cities[0].code, barangayCode: "" });
        }
      },
      () => live && setFailed("province"),
    );
    return () => {
      live = false;
    };
  }, [provinceCode, attempt]);

  const province = index?.provinces.find((p) => p.code === provinceCode) ?? null;
  useEffect(() => {
    if (index || !provinceCode) latest.current.onProvince?.(province);
  }, [index, province, provinceCode]);

  const data = loaded && loaded.code === provinceCode ? loaded.data : null;
  const barangays = data && value.cityCode ? (data.barangays[value.cityCode] ?? []) : [];
  const filterText = filter.city === value.cityCode ? filter.text : "";
  const q = normalizeName(filterText);
  const shown = q ? barangays.filter((b) => b.code === value.barangayCode || normalizeName(b.name).includes(q)) : barangays;

  const id = (s: string) => `${idPrefix}-${s}`;
  const provinceStatus = provinceCode && !data && failed !== "province";

  function pickProvince(code: string) {
    onChange({ provinceCode: code, cityCode: "", barangayCode: "" });
  }
  function pickCity(code: string) {
    onChange({ provinceCode, cityCode: code, barangayCode: "" });
  }

  const byRegion = index
    ? index.regions
        .map((r) => ({ region: r, list: index.provinces.filter((p) => p.regionCode === r.code) }))
        .filter((g) => g.list.length > 0)
    : [];

  return (
    <div className="space-y-4">
      <input type="hidden" name="provinceCode" value={value.provinceCode} />
      <input type="hidden" name="cityCode" value={value.cityCode} />
      <input type="hidden" name="barangayCode" value={value.barangayCode} />

      <div className="space-y-1.5">
        <Label htmlFor={id("province")}>Province <span className="text-primary">*</span></Label>
        <select
          id={id("province")}
          className={SELECT_CLASS}
          value={provinceCode}
          disabled={disabled || !index}
          onChange={(e) => pickProvince(e.target.value)}
        >
          <option value="">{index ? "Choose your province" : failed === "index" ? "Could not fetch the list" : "Fetching provinces…"}</option>
          {byRegion.map(({ region, list }) => (
            <optgroup key={region.code} label={region.name}>
              {list.map((p) => (
                <option key={p.code} value={p.code}>{p.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("city")}>City / Municipality <span className="text-primary">*</span></Label>
        <select
          id={id("city")}
          className={SELECT_CLASS}
          value={value.cityCode}
          disabled={disabled || !data}
          onChange={(e) => pickCity(e.target.value)}
        >
          <option value="">{!provinceCode ? "Choose a province first" : data ? "Choose your city or municipality" : failed === "province" ? "Could not fetch the list" : "Fetching cities…"}</option>
          {data?.cities.map((c) => (
            <option key={c.code} value={c.code}>{c.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={id("barangay")}>Barangay <span className="text-primary">*</span></Label>
        {barangays.length > BARANGAY_FILTER_MIN && (
          <Input
            id={id("barangay-filter")}
            type="search"
            aria-label="Type to narrow the barangay list"
            placeholder="Type to narrow the barangay list"
            value={filterText}
            disabled={disabled}
            onChange={(e) => setFilter({ city: value.cityCode, text: e.target.value })}
          />
        )}
        <select
          id={id("barangay")}
          className={SELECT_CLASS}
          value={value.barangayCode}
          disabled={disabled || !value.cityCode || !data}
          onChange={(e) => onChange({ ...value, barangayCode: e.target.value })}
        >
          <option value="">{!provinceCode ? "Choose a province first" : !value.cityCode ? "Choose a city first" : data ? (shown.length ? "Choose your barangay" : "No barangay matches") : "Fetching barangays…"}</option>
          {shown.map((b) => (
            <option key={b.code} value={b.code}>{b.name}</option>
          ))}
        </select>
      </div>

      {failed && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <span>We could not fetch the location list. Check your connection and try again.</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>
        </div>
      )}
      {provinceStatus && <span className="sr-only" role="status">Please wait, fetching locations</span>}
    </div>
  );
}
