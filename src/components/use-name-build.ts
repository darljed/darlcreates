"use client";

/**
 * Hook: the raised-letter geometry for `text` at `slot`, rebuilt as the customer types (or the admin moves the slot).
 * Loads the slot's font on first use. Returns the build result (geometry or a plain-language error), `null` while there
 * is nothing to show, and frees the previous geometry's GPU memory when it is replaced.
 */
import { useEffect, useMemo, useState } from "react";
import { buildName, type Font, type NameBuild, type NameSlot } from "@/lib/name-mesh";
import { loadFontClient } from "@/lib/name-font-client";

export function useNameBuild(slot: NameSlot | null, text: string): NameBuild | null {
  const [loaded, setLoaded] = useState<{ id: string; font: Font } | null>(null);
  const fontId = slot?.font;

  useEffect(() => {
    if (!fontId) return;
    let live = true;
    loadFontClient(fontId)
      .then((font) => live && setLoaded({ id: fontId, font }))
      .catch(() => {
        /* offline or missing file: no preview, the server still checks the name */
      });
    return () => {
      live = false;
    };
  }, [fontId]);

  const build = useMemo(
    () => (slot && text.trim() && loaded && loaded.id === slot.font ? buildName(loaded.font, text, slot) : null),
    [slot, text, loaded],
  );

  useEffect(() => () => void (build?.ok && build.geometry.dispose()), [build]);
  return build;
}
