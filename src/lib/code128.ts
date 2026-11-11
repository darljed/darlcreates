/**
 * Code 128 (subset B) barcode as plain SVG geometry. Pure and dependency-free, so the internal waybill can print a
 * scannable order number without a barcode package. Subset B covers printable ASCII (order numbers like
 * "DC-20261109-K7M2QX" fit). Each pattern is six alternating bar/space widths (in modules) that add up to 11.
 */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232",
];
const START_B = 104;
const STOP = "2331112"; // 13 modules: the stop pattern has a seventh (final bar) width

export const CODE128_PATTERNS = PATTERNS;

/** Symbol values for `text` (start B, data, checksum). Throws for characters outside printable ASCII. */
export function code128Values(text: string): number[] {
  if (!text) throw new Error("Nothing to encode");
  const data = [...text].map((ch) => {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Cannot encode "${ch}" in Code 128 B`);
    return code - 32;
  });
  const check = data.reduce((sum, v, i) => sum + v * (i + 1), START_B) % 103;
  return [START_B, ...data, check];
}

/** Bars as `{x, w}` rectangles in module units, plus the total width (including the 10-module quiet zones). */
export function code128Bars(text: string): { bars: { x: number; w: number }[]; width: number } {
  const quiet = 10;
  const widths = [...code128Values(text).map((v) => PATTERNS[v]), STOP].join("");
  const bars: { x: number; w: number }[] = [];
  let x = quiet;
  [...widths].forEach((d, i) => {
    const w = Number(d);
    if (i % 2 === 0) bars.push({ x, w }); // even positions are bars, odd are spaces
    x += w;
  });
  return { bars, width: x + quiet };
}
