#!/usr/bin/env python3
"""
Rebuild web logo + favicon assets from the originals in brand/source/.
Run: python3 scripts/build-brand-assets.py   (needs Pillow)

Inputs  (black on transparent, 2000x2000): brand/source/{stacked,icon,horizontal}.png
Outputs: public/brand/*.png   (cropped, web-sized)
         src/app/{icon.png,apple-icon.png,favicon.ico}  (white mark on brand blue)
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "source"
OUT = ROOT / "public" / "brand"
APP = ROOT / "src" / "app"
BRAND_BLUE = (0, 119, 165, 255)  # matches --primary (oklch 0.52 0.14 225) ~ #0077a5
PAD = 24

OUT.mkdir(parents=True, exist_ok=True)


def ink_mask(im: Image.Image) -> Image.Image:
    """255 where the pixel is opaque and dark (the logo ink)."""
    px = im.load()
    w, h = im.size
    m = Image.new("L", im.size, 0)
    mp = m.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a > 128 and (r + g + b) / 3 < 110:
                mp[x, y] = 255
    return m


def crop_to_ink(im: Image.Image, pad: int = PAD) -> Image.Image:
    bb = ink_mask(im).getbbox()
    l, t, r, b = bb
    return im.crop((max(l - pad, 0), max(t - pad, 0), min(r + pad, im.width), min(b + pad, im.height)))


def resize_w(im: Image.Image, width: int) -> Image.Image:
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def strip_tagline(horizontal: Image.Image) -> Image.Image:
    """Remove the tagline line under the wordmark (right of the icon)."""
    m = ink_mask(horizontal)
    mp = m.load()
    w, h = m.size
    l, t, r, b = m.getbbox()
    # Icon is the left ~30% of the ink box; text column starts after it.
    text_x = l + int((r - l) * 0.32)
    rows = [any(mp[x, y] for x in range(text_x, r)) for y in range(h)]
    # find first blank gap after the wordmark's rows (between wordmark and tagline)
    y = t
    while y < h and not rows[y]:
        y += 1
    while y < h and rows[y]:  # wordmark block
        y += 1
    gap_start = y
    if gap_start >= h:
        return horizontal
    out = horizontal.copy()
    px = out.load()
    for yy in range(gap_start, h):
        for xx in range(text_x, w):
            px[xx, yy] = (0, 0, 0, 0)
    return out


def white_on_blue(icon_rgba: Image.Image, size: int, radius_frac: float = 0.0, scale: float = 0.66):
    """Render the icon in white, centered on a brand-blue square."""
    mask = ink_mask(icon_rgba)
    ib = mask.getbbox()
    mask = mask.crop(ib)
    target = int(size * scale)
    ratio = min(target / mask.width, target / mask.height)
    mask = mask.resize((round(mask.width * ratio), round(mask.height * ratio)), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), BRAND_BLUE)
    white = Image.new("RGBA", mask.size, (255, 255, 255, 255))
    canvas.paste(white, ((size - mask.width) // 2, (size - mask.height) // 2), mask)
    if radius_frac:
        from PIL import ImageDraw
        rm = Image.new("L", (size, size), 0)
        ImageDraw.Draw(rm).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius_frac), fill=255)
        canvas.putalpha(rm)
    return canvas


def main():
    stacked = Image.open(SRC / "stacked.png").convert("RGBA")
    icon = Image.open(SRC / "icon.png").convert("RGBA")
    horizontal = Image.open(SRC / "horizontal.png").convert("RGBA")

    outputs = {
        "logo-stacked.png": resize_w(crop_to_ink(stacked), 900),
        "logo-icon.png": resize_w(crop_to_ink(icon), 512),
        "logo-horizontal-tagline.png": resize_w(crop_to_ink(horizontal), 1000),
        "logo-horizontal.png": resize_w(crop_to_ink(strip_tagline(horizontal)), 900),
    }
    for name, im in outputs.items():
        im.save(OUT / name, optimize=True)
        print(f"{name}: {im.size}")

    white_on_blue(icon, 512, radius_frac=0.22).save(APP / "icon.png", optimize=True)
    white_on_blue(icon, 180).save(APP / "apple-icon.png", optimize=True)
    ico_src = white_on_blue(icon, 256, radius_frac=0.18)
    ico_src.save(APP / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("icon.png, apple-icon.png, favicon.ico written")


if __name__ == "__main__":
    main()
