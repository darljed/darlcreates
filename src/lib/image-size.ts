/**
 * Read an image's pixel size from its first bytes (PNG, JPEG, WebP). Pure and dependency-free, so the server
 * can check an uploaded logo without trusting the browser's claimed dimensions or decoding the whole image.
 * Returns null for anything else or when the header is incomplete (JPEG needs enough bytes to reach its frame header).
 */
export type ImageInfo = { type: "png" | "jpeg" | "webp"; width: number; height: number };

const u16be = (b: Uint8Array, i: number) => (b[i] << 8) | b[i + 1];
const u32be = (b: Uint8Array, i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
const u16le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8);
const u24le = (b: Uint8Array, i: number) => b[i] | (b[i + 1] << 8) | (b[i + 2] << 16);
const tag = (b: Uint8Array, i: number, s: string) => s.split("").every((c, k) => b[i + k] === c.charCodeAt(0));

export function imageSize(b: Uint8Array): ImageInfo | null {
  // PNG: 8-byte signature, then the IHDR chunk (width, height as 32-bit big-endian)
  if (b.length >= 24 && b[0] === 0x89 && tag(b, 1, "PNG") && tag(b, 12, "IHDR")) {
    return { type: "png", width: u32be(b, 16), height: u32be(b, 20) };
  }

  // WebP: "RIFF" size "WEBP", then VP8 (lossy), VP8L (lossless) or VP8X (extended)
  if (b.length >= 30 && tag(b, 0, "RIFF") && tag(b, 8, "WEBP")) {
    if (tag(b, 12, "VP8X")) return { type: "webp", width: u24le(b, 24) + 1, height: u24le(b, 27) + 1 };
    if (tag(b, 12, "VP8L") && b[20] === 0x2f) {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      return { type: "webp", width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    if (tag(b, 12, "VP8 ") && b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a) {
      return { type: "webp", width: u16le(b, 26) & 0x3fff, height: u16le(b, 28) & 0x3fff };
    }
    return null;
  }

  // JPEG: walk the marker segments until a start-of-frame (SOF) marker, which holds height then width
  if (b.length >= 4 && b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) {
        i++;
        continue;
      }
      const marker = b[i + 1];
      if (marker === 0xff) {
        i++;
        continue;
      }
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
        i += 2; // markers without a length
        continue;
      }
      const len = u16be(b, i + 2);
      const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSof) return { type: "jpeg", height: u16be(b, i + 5), width: u16be(b, i + 7) };
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }
  return null;
}
