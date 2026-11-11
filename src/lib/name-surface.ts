/**
 * The product model as one mesh in build space, cached in memory for a few minutes. Reading a large 3MF takes a second
 * or more, and the admin editor asks about the same model many times in a row (every click and rotation), so the parsed
 * surface is kept for 10 minutes, at most two models at a time. Server only (reads S3).
 */
import type { Mesh } from "./name-mesh";
import { readBaseSurface } from "./name-3mf";
import { getObject } from "./storage";

const TTL_MS = 10 * 60 * 1000;
const MAX_ENTRIES = 2;
const cache = new Map<string, { at: number; surface: Promise<Mesh> }>();

export function loadSurface(key: string): Promise<Mesh> {
  const now = Date.now();
  for (const [k, v] of cache) if (now - v.at > TTL_MS) cache.delete(k);
  const hit = cache.get(key);
  if (hit) return hit.surface;
  const kind = /\.3mf$/i.test(key) ? "3mf" : "stl";
  const surface = (async () => {
    const obj = await getObject(key);
    if (!obj) throw new Error("The model file could not be read from storage");
    return readBaseSurface(await new Response(obj.stream).arrayBuffer(), kind);
  })();
  surface.catch(() => cache.delete(key)); // do not keep a failure
  while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
  cache.set(key, { at: now, surface });
  return surface;
}
