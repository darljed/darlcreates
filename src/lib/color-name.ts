/**
 * A plain-English name for a hex colour ("Pink", "Dark green", "Cream"), so swatches created from a 3MF's filament
 * list get readable labels. Pure. Based on hue, saturation and lightness; good enough for filament colours, not for
 * design work.
 */
export function colorName(hex: string): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim());
  if (!m) return hex;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  if (l < 0.12) return "Black";
  if (s < 0.1) return l > 0.9 ? "White" : l > 0.62 ? "Light grey" : l > 0.38 ? "Grey" : "Dark grey";
  // pale warm tints read as cream / beige rather than orange
  if (l > 0.82 && h >= 15 && h < 70) return "Cream";
  const hue =
    h < 15 || h >= 345 ? "Red" : h < 40 ? "Orange" : h < 70 ? "Yellow" : h < 160 ? "Green" : h < 185 ? "Teal" : h < 255 ? "Blue" : h < 290 ? "Purple" : "Pink";
  if (hue === "Red" && l > 0.62) return "Pink";
  if (hue === "Orange" && l < 0.42) return "Brown";
  if (hue === "Pink" && l < 0.4) return "Magenta";
  return l < 0.3 ? `Dark ${hue.toLowerCase()}` : l > 0.8 ? `Light ${hue.toLowerCase()}` : hue;
}
