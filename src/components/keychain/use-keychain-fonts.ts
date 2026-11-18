"use client";

/**
 * The fonts a keychain design uses, loaded in the browser (the same files the server prints with). `lookup` is what the
 * layout builder asks for; `version` changes when a font arrives so the layout is built again. A bag tag also needs the
 * plain "bold" font for its small line.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Font, NameFontId } from "@/lib/name-mesh";
import { loadFontClient } from "@/lib/name-font-client";
import type { KeychainSpec } from "@/lib/keychain/spec";

export function useKeychainFonts(specs: KeychainSpec[]) {
  const fonts = useRef(new Map<NameFontId, Font>());
  const [version, setVersion] = useState(0);
  const lookup = useCallback((id: NameFontId) => fonts.current.get(id), []);

  const needed = [...new Set(specs.flatMap((s) => [s.font, ...(s.style === "tag" ? (["bold"] as NameFontId[]) : [])]))].sort().join(",");
  useEffect(() => {
    let live = true;
    for (const id of needed.split(",").filter(Boolean) as NameFontId[]) {
      if (fonts.current.has(id)) continue;
      loadFontClient(id)
        .then((f) => {
          if (!live) return;
          fonts.current.set(id, f);
          setVersion((v) => v + 1);
        })
        .catch(() => undefined); // offline: the name is simply not drawn until the font arrives
    }
    return () => {
      live = false;
    };
  }, [needed]);

  /** Wait for every font the designs use (before checking them for the cart). */
  const ready = useCallback(async () => {
    await Promise.all(
      needed.split(",").filter(Boolean).map(async (id) => {
        if (!fonts.current.has(id as NameFontId)) fonts.current.set(id as NameFontId, await loadFontClient(id as NameFontId));
      }),
    );
    setVersion((v) => v + 1);
  }, [needed]);

  return { lookup, version, ready };
}
