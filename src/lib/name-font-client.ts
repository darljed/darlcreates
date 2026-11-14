/**
 * Browser side of the name fonts: fetches /fonts/<file> once per font and parses it. The same files the server reads, so
 * the preview and the print file use identical letter shapes.
 */
import { NAME_FONTS, parseFont, type Font, type NameFontId } from "./name-mesh";

const cache = new Map<NameFontId, Promise<Font>>();

export function loadFontClient(id: NameFontId): Promise<Font> {
  let f = cache.get(id);
  if (!f) {
    f = fetch(`/fonts/${NAME_FONTS[id].file}`)
      .then((r) => {
        if (!r.ok) throw new Error(`font ${id}: ${r.status}`);
        return r.arrayBuffer();
      })
      .then(parseFont);
    f.catch(() => cache.delete(id)); // allow a retry after a network failure
    cache.set(id, f);
  }
  return f;
}
