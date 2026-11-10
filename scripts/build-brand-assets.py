#!/usr/bin/env python3
"""
Rebuild web logo + favicon assets from the designer's files in brand/source/.
Run: python3 scripts/build-brand-assets.py   (needs Pillow)

Inputs (transparent, 2000x2000; icon is identical in both, only wordmark color differs):
  brand/source/wordmark-black.png   icon + black "Darl Creates"  -> light backgrounds
  brand/source/wordmark-white.png   icon + white "Darl Creates"  -> dark backgrounds
The icon is black with opaque white fills and a white outline, so it reads on any
background without inverting.

Outputs:
  public/brand/logo-horizontal.png       (light bg)
  public/brand/logo-horizontal-dark.png  (dark bg)
  public/brand/logo-icon.png             (icon only, any bg)
  public/brand/{icon.png,apple-icon.png} + public/favicon.ico  (white mark on brand blue)
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "brand" / "source"
OUT = ROOT / "public" / "brand"
PUBLIC = ROOT / "public"
BRAND = PUBLIC / "brand"  # not src/app: file-convention icons there would override the owner's uploaded favicon
BRAND_BLUE = (0, 119, 165, 255)  # matches --primary (oklch 0.52 0.14 225) ~ #0077a5
PAD = 8

OUT.mkdir(parents=True, exist_ok=True)


def alpha_bbox(im: Image.Image):
    return im.getchannel("A").point(lambda v: 255 if v > 40 else 0).getbbox()


def crop_alpha(im: Image.Image, pad: int = PAD) -> Image.Image:
    l, t, r, b = alpha_bbox(im)
    return im.crop((max(l - pad, 0), max(t - pad, 0), min(r + pad, im.width), min(b + pad, im.height)))


def split_icon(im: Image.Image) -> Image.Image:
    """The icon is the leftmost ink blob; the wordmark starts after the first empty column run."""
    a = im.getchannel("A").point(lambda v: 255 if v > 40 else 0)
    l, t, r, b = a.getbbox()
    px = a.load()
    x = l
    while x < r and any(px[x, y] for y in range(t, b)):  # inside the icon
        x += 1
    # x is now the first empty column after the icon
    return crop_alpha(im.crop((l, t, x, b)))


def resize_w(im: Image.Image, width: int) -> Image.Image:
    return im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)


def white_mark_on_blue(icon: Image.Image, size: int, radius_frac: float = 0.0, scale: float = 0.66):
    """Favicon: the icon's black ink rendered white, centered on a brand-blue square."""
    # ink = opaque AND dark (the white fills must stay "empty" so the mark reads)
    px = icon.load()
    ink = Image.new("L", icon.size, 0)
    ip = ink.load()
    for y in range(icon.height):
        for x in range(icon.width):
            r, g, b, a = px[x, y]
            if a > 128 and (r + g + b) / 3 < 110:
                ip[x, y] = 255
    ink = ink.crop(ink.getbbox())
    ratio = min(size * scale / ink.width, size * scale / ink.height)
    ink = ink.resize((round(ink.width * ratio), round(ink.height * ratio)), Image.LANCZOS)
    canvas = Image.new("RGBA", (size, size), BRAND_BLUE)
    canvas.paste(Image.new("RGBA", ink.size, (255, 255, 255, 255)), ((size - ink.width) // 2, (size - ink.height) // 2), ink)
    if radius_frac:
        rm = Image.new("L", (size, size), 0)
        ImageDraw.Draw(rm).rounded_rectangle((0, 0, size - 1, size - 1), radius=int(size * radius_frac), fill=255)
        canvas.putalpha(rm)
    return canvas


def main():
    black = Image.open(SRC / "wordmark-black.png").convert("RGBA")
    white = Image.open(SRC / "wordmark-white.png").convert("RGBA")

    icon = split_icon(black)
    outputs = {
        "logo-horizontal.png": resize_w(crop_alpha(black), 1000),
        "logo-horizontal-dark.png": resize_w(crop_alpha(white), 1000),
        "logo-icon.png": resize_w(icon, 512),
    }
    for name, im in outputs.items():
        im.save(OUT / name, optimize=True)
        print(f"{name}: {im.size}")

    white_mark_on_blue(icon, 512, radius_frac=0.22).save(BRAND / "icon.png", optimize=True)
    white_mark_on_blue(icon, 180).save(BRAND / "apple-icon.png", optimize=True)
    white_mark_on_blue(icon, 256, radius_frac=0.18).save(PUBLIC / "favicon.ico", sizes=[(16, 16), (32, 32), (48, 48)])
    print("icon.png, apple-icon.png, favicon.ico written")


if __name__ == "__main__":
    main()
