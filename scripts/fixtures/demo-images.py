#!/usr/bin/env python3
"""
Generate simple placeholder product photos for the demo seed (scripts/seed-demo.ts).
Usage: demo-images.py <outdir> '<json: [{"slug": "...", "name": "...", "category": "..."}]>'
Writes <outdir>/<slug>-1.png and <slug>-2.png (800x800). Needs Pillow (already used by build-brand-assets.py).
These are deliberately plain: enough to see how cards, galleries and 3D tiles lay out with real images.
"""
import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

PALETTES = {
    "keychains": ((255, 214, 102), (255, 140, 66)),
    "stands": ((140, 211, 255), (66, 135, 245)),
    "toys": ((190, 242, 170), (60, 179, 113)),
    "desk": ((221, 214, 254), (139, 92, 246)),
    "home": ((254, 202, 202), (239, 68, 68)),
    "gifts": ((253, 186, 224), (219, 39, 119)),
    "signs": ((186, 230, 253), (14, 116, 144)),
    "general": ((226, 232, 240), (100, 116, 139)),
}


def font(size):
    for p in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc",
              "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
        try:
            return ImageFont.truetype(p, size)
        except Exception:
            continue
    return ImageFont.load_default()


def gradient(size, a, b):
    w, h = size
    img = Image.new("RGB", size, a)
    px = img.load()
    for y in range(h):
        t = y / (h - 1)
        c = tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def draw_object(d, kind, w, h, accent, variant):
    """A chunky, vaguely product-like silhouette so the photo isn't just a colour field."""
    cx, cy = w // 2, int(h * 0.48)
    shade = tuple(max(0, c - 40) for c in accent)
    if kind in ("keychains", "gifts"):
        d.ellipse((cx - 70, cy - 250, cx + 70, cy - 110), outline=(60, 60, 60), width=18)  # ring
        d.rounded_rectangle((cx - 190, cy - 130, cx + 190, cy + 130), radius=40, fill=accent, outline=shade, width=8)
    elif kind in ("stands", "desk"):
        d.polygon([(cx - 230, cy + 190), (cx + 230, cy + 190), (cx + 150, cy - 200), (cx + 70, cy - 200)], fill=accent, outline=shade)
        d.rectangle((cx - 230, cy + 150, cx + 230, cy + 200), fill=shade)
    elif kind == "toys":
        for i in range(6):
            r = 120 - i * 14
            d.ellipse((cx - r + (i % 2) * 40 - 20, cy - r + i * 30 - 80, cx + r + (i % 2) * 40 - 20, cy + r + i * 30 - 80), fill=accent if i % 2 else shade)
    elif kind == "home":
        d.polygon([(cx - 170, cy - 140), (cx + 170, cy - 140), (cx + 120, cy + 190), (cx - 120, cy + 190)], fill=accent, outline=shade)
        d.ellipse((cx - 170, cy - 190, cx + 170, cy - 90), fill=shade)
    else:
        d.rounded_rectangle((cx - 230, cy - 120, cx + 230, cy + 120), radius=24, fill=accent, outline=shade, width=8)
    if variant == 2:  # second photo: add a "detail" circle
        d.ellipse((cx + 90, cy + 40, cx + 230, cy + 180), fill=(255, 255, 255), outline=shade, width=6)


def main():
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for p in json.loads(sys.argv[2]):
        lo, hi = PALETTES.get(p["category"], PALETTES["general"])
        for variant in (1, 2):
            img = gradient((800, 800), lo, hi) if variant == 1 else gradient((800, 800), hi, lo)
            d = ImageDraw.Draw(img)
            draw_object(d, p["category"], 800, 800, (255, 255, 255) if variant == 1 else (30, 41, 59), variant)
            label = p["name"][:34] + ("…" if len(p["name"]) > 34 else "")
            d.rounded_rectangle((40, 690, 760, 760), radius=16, fill=(255, 255, 255))
            d.text((60, 705), label, font=font(34), fill=(30, 41, 59))
            img.save(out / f"{p['slug']}-{variant}.png", optimize=True)
    print("ok")


if __name__ == "__main__":
    main()
