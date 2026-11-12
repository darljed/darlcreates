/**
 * A picture to colour areas a clicker can be printed from. Done in two steps so the customer can play with the result
 * without re-reading the picture:
 *
 *   analyzeImage  finds the few main colours of the picture (k-means in Lab colour space) and gives every pixel one,
 *                 and works out which colour is the background (transparent pixels, or the colour along the edges).
 *   traceAnalysis for the colours the customer keeps, draws the outline of each colour's pixels, straightens the
 *                 stair-steps, smooths them, and returns outlines scaled so the picture's longest side is 1.
 *
 * Pure: it works on an array of pixels (the browser reads them from a canvas), so it is tested without a browser.
 */
import type { Region, Ring } from "./poly";
import { regionsFromLoops } from "./poly";

export type Pixels = { width: number; height: number; data: ArrayLike<number> };
export type PaletteEntry = { hex: string; rgb: [number, number, number]; count: number; fraction: number; background: boolean };
export type Analysis = {
  width: number;
  height: number;
  /** Colour index per pixel (row 0 = top of the picture), or 255 for transparent. */
  labels: Uint8Array;
  palette: PaletteEntry[];
};

const toHex = ([r, g, b]: number[]) => "#" + [r, g, b].map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// --- colour distance in Lab (so "close" means close to the eye) ----------------------------------------------------
function srgbToLab([r, g, b]: number[]): [number, number, number] {
  const lin = (v: number) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const R = lin(r), G = lin(g), B = lin(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const y = R * 0.2126 + G * 0.7152 + B * 0.0722;
  const z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}
const dist2 = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

/** The palette colour nearest to `hex` (for matching a picture's colours to the filaments on offer). */
export function nearestHex(hex: string, palette: string[]): string {
  const lab = srgbToLab(hexToRgb(hex));
  let best = palette[0], bestD = Infinity;
  for (const p of palette) {
    const d = dist2(lab, srgbToLab(hexToRgb(p)));
    if (d < bestD) { bestD = d; best = p; }
  }
  return best;
}

/** Find the main colours of a picture. `colours` is how many to look for (2 to 8). */
export function analyzeImage(px: Pixels, colours = 4): Analysis {
  const { width, height } = px;
  const n = width * height;
  const alpha = (i: number) => px.data[i * 4 + 3];

  // a histogram of 5-bit colours keeps this fast for any picture size
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  for (let i = 0; i < n; i++) {
    if (alpha(i) < 128) continue;
    const r = px.data[i * 4], g = px.data[i * 4 + 1], b = px.data[i * 4 + 2];
    const key = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
    const e = bins.get(key);
    if (e) { e.count++; e.r += r; e.g += g; e.b += b; }
    else bins.set(key, { count: 1, r, g, b });
  }
  const pts = [...bins.values()].map((e) => ({ rgb: [e.r / e.count, e.g / e.count, e.b / e.count] as [number, number, number], lab: srgbToLab([e.r / e.count, e.g / e.count, e.b / e.count]), w: e.count }));
  if (pts.length === 0) return { width, height, labels: new Uint8Array(n).fill(255), palette: [] };

  const k = Math.max(1, Math.min(colours, pts.length));
  // k-means++ style start: the heaviest colour, then repeatedly the colour farthest from those chosen
  const centres: number[][] = [pts.reduce((a, b) => (b.w > a.w ? b : a)).lab];
  while (centres.length < k) {
    let far = pts[0], farD = -1;
    for (const p of pts) {
      const d = Math.min(...centres.map((c) => dist2(p.lab, c))) * Math.sqrt(p.w);
      if (d > farD) { farD = d; far = p; }
    }
    centres.push(far.lab);
  }
  for (let iter = 0; iter < 10; iter++) {
    const sum = centres.map(() => [0, 0, 0, 0]);
    for (const p of pts) {
      let bi = 0, bd = Infinity;
      centres.forEach((c, i) => { const d = dist2(p.lab, c); if (d < bd) { bd = d; bi = i; } });
      sum[bi][0] += p.lab[0] * p.w; sum[bi][1] += p.lab[1] * p.w; sum[bi][2] += p.lab[2] * p.w; sum[bi][3] += p.w;
    }
    sum.forEach((s, i) => { if (s[3]) centres[i] = [s[0] / s[3], s[1] / s[3], s[2] / s[3]]; });
  }

  // each pixel gets its nearest centre; the displayed colour is the average of the pixels it got
  const labels = new Uint8Array(n).fill(255);
  const acc = centres.map(() => [0, 0, 0, 0]);
  const cache = new Map<number, number>();
  for (let i = 0; i < n; i++) {
    if (alpha(i) < 128) continue;
    const r = px.data[i * 4], g = px.data[i * 4 + 1], b = px.data[i * 4 + 2];
    const key = (r << 16) | (g << 8) | b;
    let bi = cache.get(key);
    if (bi === undefined) {
      const lab = srgbToLab([r, g, b]);
      let bd = Infinity;
      bi = 0;
      centres.forEach((c, j) => { const d = dist2(lab, c); if (d < bd) { bd = d; bi = j; } });
      cache.set(key, bi);
    }
    labels[i] = bi;
    acc[bi][0] += r; acc[bi][1] += g; acc[bi][2] += b; acc[bi][3]++;
  }

  // drop colours nothing was assigned to, and renumber, most common first
  const order = acc.map((a, i) => ({ i, c: a[3] })).filter((e) => e.c > 0).sort((a, b) => b.c - a.c);
  const remap = new Map(order.map((e, j) => [e.i, j]));
  for (let i = 0; i < n; i++) if (labels[i] !== 255) labels[i] = remap.get(labels[i]) ?? 255;
  const total = order.reduce((s, e) => s + e.c, 0);
  const palette: PaletteEntry[] = order.map((e) => {
    const a = acc[e.i];
    const rgb: [number, number, number] = [a[0] / a[3], a[1] / a[3], a[2] / a[3]];
    return { hex: toHex(rgb), rgb, count: e.c, fraction: e.c / total, background: false };
  });

  // background: transparent pixels count as background; otherwise the colour that makes up most of the picture's edge
  const edgeCount = new Array(palette.length).fill(0);
  let edgeTotal = 0;
  const seen = (x: number, y: number) => {
    const l = labels[y * width + x];
    edgeTotal++;
    if (l !== 255) edgeCount[l]++;
  };
  for (let x = 0; x < width; x++) { seen(x, 0); seen(x, height - 1); }
  for (let y = 1; y < height - 1; y++) { seen(0, y); seen(width - 1, y); }
  const hasTransparent = labels.some((l) => l === 255);
  const topEdge = edgeCount.reduce((best, c, i) => (c > edgeCount[best] ? i : best), 0);
  if (!hasTransparent && palette.length > 1 && edgeCount[topEdge] / Math.max(1, edgeTotal) > 0.6) palette[topEdge].background = true;
  return { width, height, labels, palette };
}

// --- tracing --------------------------------------------------------------------------------------------------------

/** Outline loops of the pixels where `mask` is set. Outer loops run counter-clockwise, holes clockwise (y up). */
function maskLoops(mask: Uint8Array, w: number, h: number): Ring[] {
  // edges around each filled cell, with the cell on the left; flip to y up so the loops run the right way round
  const edges = new Map<number, number[]>(); // start vertex -> list of end vertices
  const key = (x: number, y: number) => y * (w + 1) + x;
  const add = (x1: number, y1: number, x2: number, y2: number) => {
    const k = key(x1, y1);
    const list = edges.get(k);
    if (list) list.push(key(x2, y2));
    else edges.set(k, [key(x2, y2)]);
  };
  const on = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!on(x, y)) continue;
      const py = h - 1 - y; // y up
      if (!on(x, y + 1)) add(x, py, x + 1, py); // below (in y up): bottom edge, left to right
      if (!on(x + 1, y)) add(x + 1, py, x + 1, py + 1);
      if (!on(x, y - 1)) add(x + 1, py + 1, x, py + 1);
      if (!on(x - 1, y)) add(x, py + 1, x, py);
    }
  }
  const loops: Ring[] = [];
  const xy = (k: number): [number, number] => [k % (w + 1), Math.floor(k / (w + 1))];
  for (const [start] of edges) {
    while (edges.get(start)?.length) {
      const loop: Ring = [];
      let from = start;
      let prevDir: [number, number] | null = null;
      for (let guard = 0; guard < 4_000_000; guard++) {
        const outs = edges.get(from);
        if (!outs?.length) break;
        let pick = 0;
        if (outs.length > 1 && prevDir) {
          // two loops meet at this corner: turn left, so pixels touching only at a corner stay one shape
          let bestTurn = -Infinity;
          outs.forEach((to, i) => {
            const [fx, fy] = xy(from), [tx, ty] = xy(to);
            const d: [number, number] = [tx - fx, ty - fy];
            const turn = Math.atan2(prevDir![0] * d[1] - prevDir![1] * d[0], prevDir![0] * d[0] + prevDir![1] * d[1]);
            if (turn > bestTurn) { bestTurn = turn; pick = i; }
          });
        }
        const to = outs.splice(pick, 1)[0];
        loop.push(xy(from));
        const [fx, fy] = xy(from), [tx, ty] = xy(to);
        prevDir = [tx - fx, ty - fy];
        from = to;
        if (from === start) break;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

/** Ramer–Douglas–Peucker on a closed loop. */
function simplifyLoop(loop: Ring, eps: number): Ring {
  if (loop.length <= 4) return loop;
  // split the loop at its two farthest-apart anchor points so the recursion has fixed ends
  const a = 0;
  let b = 0, best = -1;
  for (let i = 1; i < loop.length; i++) {
    const d = (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
    if (d > best) { best = d; b = i; }
  }
  const keep = new Array(loop.length).fill(false);
  keep[a] = keep[b] = true;
  const rdp = (i0: number, i1: number) => {
    // iterative stack over the indexes between i0 and i1 (wrapping once)
    const stack: [number, number][] = [[i0, i1]];
    while (stack.length) {
      const [s, e] = stack.pop()!;
      const [x1, y1] = loop[s % loop.length], [x2, y2] = loop[e % loop.length];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1e-9;
      let md = -1, mi = -1;
      for (let i = s + 1; i < e; i++) {
        const [px, py] = loop[i % loop.length];
        const d = Math.abs(dx * (y1 - py) - dy * (x1 - px)) / len;
        if (d > md) { md = d; mi = i; }
      }
      if (md > eps && mi >= 0) {
        keep[mi % loop.length] = true;
        stack.push([s, mi], [mi, e]);
      }
    }
  };
  rdp(a, b);
  rdp(b, a + loop.length);
  return loop.filter((_, i) => keep[i]);
}

/** One round of corner cutting: every corner is replaced by two points a quarter of the way along its edges. */
function chaikin(loop: Ring): Ring {
  const out: Ring = [];
  for (let i = 0; i < loop.length; i++) {
    const p = loop[i], q = loop[(i + 1) % loop.length];
    out.push([0.75 * p[0] + 0.25 * q[0], 0.75 * p[1] + 0.25 * q[1]], [0.25 * p[0] + 0.75 * q[0], 0.25 * p[1] + 0.75 * q[1]]);
  }
  return out;
}

export type TraceOptions = {
  /** For each palette entry: keep it (true) or leave it out (false). */
  keep: boolean[];
  /** For each palette entry: the colour it is printed in (usually the nearest filament). */
  target: string[];
  /** 0 = no smoothing, 1 = some, 2 = a lot. */
  smoothing?: number;
  /** 0 (coarse, few points) to 1 (fine, many points). */
  detail?: number;
  /** Most points allowed over all colours. */
  maxPoints?: number;
};

export type Traced = {
  /** One group per printed colour; shapes are scaled so the picture's longest side is 1, centred on the origin. */
  groups: { color: string; shapes: Region[] }[];
  /** Picture width and height as fractions of the longest side. */
  fitWidth: number;
  fitHeight: number;
  points: number;
};

export function traceAnalysis(a: Analysis, o: TraceOptions): Traced {
  const { width: w, height: h } = a;
  const longest = Math.max(w, h);
  const smoothing = o.smoothing ?? 1;
  const baseEps = 0.45 + (1 - (o.detail ?? 0.6)) * 1.4; // pixels
  const budget = o.maxPoints ?? 12_000;

  // palette entries that print in the same colour are one shape
  const byTarget = new Map<string, number[]>();
  a.palette.forEach((_, i) => { if (o.keep[i]) byTarget.set(o.target[i].toLowerCase(), [...(byTarget.get(o.target[i].toLowerCase()) ?? []), i]); });

  const build = (eps: number) => {
    const groups: { color: string; shapes: Region[] }[] = [];
    let points = 0;
    for (const [color, idxs] of byTarget) {
      const set = new Set(idxs);
      const mask = new Uint8Array(w * h);
      for (let i = 0; i < mask.length; i++) if (set.has(a.labels[i])) mask[i] = 1;
      const loops: Ring[] = [];
      for (const raw of maskLoops(mask, w, h)) {
        let loop = simplifyLoop(raw, eps);
        for (let s = 0; s < smoothing && loop.length >= 3; s++) loop = chaikin(loop);
        if (loop.length < 3) continue;
        loops.push(loop.map(([x, y]) => [(x - w / 2) / longest, (y - h / 2) / longest] as [number, number]));
      }
      const shapes = regionsFromLoops(loops).filter((r) => r.outer.length >= 3);
      points += shapes.reduce((n, r) => n + r.outer.length + r.holes.reduce((m, hh) => m + hh.length, 0), 0);
      if (shapes.length) groups.push({ color, shapes });
    }
    return { groups, points };
  };
  let eps = baseEps;
  let r = build(eps);
  for (let tries = 0; tries < 5 && r.points > budget; tries++) {
    eps *= 1.7;
    r = build(eps);
  }
  return { groups: r.groups, fitWidth: w / longest, fitHeight: h / longest, points: r.points };
}

/** Keep-flags and target colours for a first look at a picture: leave out the background, match the rest to `palette`. */
export function defaultTrace(a: Analysis, palette: string[]): Pick<TraceOptions, "keep" | "target"> {
  return { keep: a.palette.map((p) => !p.background), target: a.palette.map((p) => nearestHex(p.hex, palette)) };
}
