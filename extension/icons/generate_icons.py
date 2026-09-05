"""Generates the extension's PNG icons at build time — see README's Extension
setup notes. Not shipped/loaded by the extension itself (only the .png
outputs are referenced from manifest.json); requires Pillow (`pip install
Pillow`), which is intentionally not added to any requirements*.txt since
nothing at runtime imports it.

Run: python extension/icons/generate_icons.py
"""
from pathlib import Path

from PIL import Image, ImageDraw

BG = (17, 24, 39, 255)       # matches the floating card background (#111827)
ACCENT = (245, 158, 11, 255)  # matches the badge/accent color (#f59e0b)
MARK = (255, 255, 255, 255)

SIZES = (16, 32, 48, 128)


def draw_icon(size: int) -> Image.Image:
    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    radius = round(size * 0.22)
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)

    center = size / 2
    draw.ellipse(
        [center - size * 0.34, center - size * 0.34, center + size * 0.34, center + size * 0.34],
        fill=ACCENT,
    )

    bar_w = size * 0.09
    draw.rounded_rectangle(
        [center - bar_w / 2, size * 0.30, center + bar_w / 2, size * 0.58],
        radius=bar_w / 2,
        fill=MARK,
    )
    dot_r = size * 0.05
    dot_y = size * 0.68
    draw.ellipse([center - dot_r, dot_y - dot_r, center + dot_r, dot_y + dot_r], fill=MARK)

    return image


def main() -> None:
    out_dir = Path(__file__).parent
    for size in SIZES:
        draw_icon(size).save(out_dir / f"icon{size}.png")
        print(f"wrote icon{size}.png")


if __name__ == "__main__":
    main()
