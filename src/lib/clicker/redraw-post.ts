/**
 * What happens to an AI answer in the browser before it is traced. Pure (works on RGBA pixels), so it is tested without
 * a browser.
 *   stencil: every pixel becomes pure black or pure white, so exactly two tones are left whatever the AI drew;
 *   flat:    the solid "key" backdrop is made transparent (including the blended edge pixels around the subject),
 *            then a 1 pixel rim is trimmed so no pinkish fringe is traced as a colour of its own.
 */
import type { Pixels } from "./trace";

/**
 * How many colours a flat redraw may use: the base and the key take two of the printer's colours (the same rule as a
 * traced picture), so the picture gets what is left, at least 2 and at most 3.
 */
export const flatColourCount = (maxColours: number): number => Math.min(3, Math.max(2, maxColours - 2));

/** Black or white by brightness. Transparent pixels stay transparent. Returns a new array. */
export function thresholdPixels(px: Pixels, level = 128): Pixels {
  const out = new Uint8ClampedArray(px.width * px.height * 4);
  for (let i = 0; i < px.width * px.height; i++) {
    const r = px.data[i * 4], g = px.data[i * 4 + 1], b = px.data[i * 4 + 2];
    const v = 0.299 * r + 0.587 * g + 0.114 * b >= level ? 255 : 0;
    out[i * 4] = out[i * 4 + 1] = out[i * 4 + 2] = v;
    out[i * 4 + 3] = px.data[i * 4 + 3];
  }
  return { width: px.width, height: px.height, data: out };
}

/** Make the backdrop transparent: pixels close to `key` (a `#rrggbb`), then trim `trim` pixels of rim. Returns a new array. */
export function keyOutPixels(px: Pixels, key: string, tolerance = 120, trim = 1): Pixels {
  const k = [parseInt(key.slice(1, 3), 16), parseInt(key.slice(3, 5), 16), parseInt(key.slice(5, 7), 16)];
  const { width: w, height: h } = px;
  const data = new Uint8ClampedArray(w * h * 4);
  data.set(px.data as ArrayLike<number>);
  const clear = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const d = Math.hypot(data[i * 4] - k[0], data[i * 4 + 1] - k[1], data[i * 4 + 2] - k[2]);
    if (d < tolerance || data[i * 4 + 3] < 128) clear[i] = 1;
  }
  // trim: a kept pixel next to a cleared one is a blend of the subject and the backdrop, so it goes too
  for (let t = 0; t < trim; t++) {
    const next = clear.slice();
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (clear[y * w + x]) continue;
        if ((x > 0 && clear[y * w + x - 1]) || (x < w - 1 && clear[y * w + x + 1]) || (y > 0 && clear[(y - 1) * w + x]) || (y < h - 1 && clear[(y + 1) * w + x])) next[y * w + x] = 1;
      }
    clear.set(next);
  }
  for (let i = 0; i < w * h; i++) if (clear[i]) data[i * 4 + 3] = 0;
  return { width: w, height: h, data };
}
