#!/usr/bin/env python3
"""Generate the application icon set.

Draws the icon at 1024px and downsamples, so the small sizes stay crisp.
Run with: python3 scripts/make-icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "src-tauri" / "icons"
SIZE = 1024
TOP = (99, 102, 241)      # indigo
BOTTOM = (14, 165, 233)   # sky
GLYPH = (255, 255, 255)


def gradient(size: int) -> Image.Image:
    img = Image.new("RGB", (1, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        px[0, y] = tuple(round(TOP[i] + (BOTTOM[i] - TOP[i]) * t) for i in range(3))
    return img.resize((size, size), Image.BICUBIC)


def rounded_mask(size: int, radius_ratio: float = 0.225) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, size - 1, size - 1), radius=int(size * radius_ratio), fill=255
    )
    return mask


def draw_glyph(img: Image.Image, size: int) -> None:
    """The Markdown mark: an 'M' beside a downward arrow."""
    d = ImageDraw.Draw(img)
    u = size / 100.0
    stroke = int(9 * u)

    # M — two verticals joined by a peak.
    left, right = 20 * u, 50 * u
    top, bottom = 33 * u, 67 * u
    mid_x, mid_y = (left + right) / 2, 52 * u
    d.line([(left, bottom), (left, top), (mid_x, mid_y), (right, top), (right, bottom)],
           fill=GLYPH, width=stroke, joint="curve")
    # Round off the two upright ends; the peak is already joined.
    for x in (left, right):
        d.ellipse([x - stroke / 2, top - stroke / 2, x + stroke / 2, top + stroke / 2], fill=GLYPH)
    for x in (left, right):
        d.ellipse([x - stroke / 2, bottom - stroke / 2, x + stroke / 2, bottom + stroke / 2], fill=GLYPH)

    # Downward arrow.
    ax = 71 * u
    d.line([(ax, top - 1 * u), (ax, 57 * u)], fill=GLYPH, width=stroke)
    d.polygon([(ax - 12 * u, 53 * u), (ax + 12 * u, 53 * u), (ax, 70 * u)], fill=GLYPH)


def build() -> Image.Image:
    base = gradient(SIZE).convert("RGBA")
    draw_glyph(base, SIZE)
    base.putalpha(rounded_mask(SIZE))
    return base


def main() -> None:
    ICONS.mkdir(parents=True, exist_ok=True)
    master = build()

    outputs = {
        "32x32.png": 32,
        "128x128.png": 128,
        "128x128@2x.png": 256,
        "icon.png": 512,
    }
    for name, size in outputs.items():
        master.resize((size, size), Image.LANCZOS).save(ICONS / name, optimize=True)

    # .ico for the Windows bundle; harmless to ship from Linux.
    master.resize((256, 256), Image.LANCZOS).save(
        ICONS / "icon.ico", sizes=[(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]
    )
    print(f"wrote {len(outputs) + 1} icons to {ICONS}")


if __name__ == "__main__":
    main()
