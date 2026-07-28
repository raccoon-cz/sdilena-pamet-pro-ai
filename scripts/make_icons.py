"""Vygeneruje jednoduché ikony rozšíření (16/32/48/128 px) do public/icons/.

Motiv: tmavě modrý zaoblený čtverec s bílým symbolem propojených uzlů
(reprezentuje "sdílenou paměť"). Žádné externí assety, žádné fonty.
"""

import math
import os
from PIL import Image, ImageDraw

SIZES = [16, 32, 48, 128]
OUT_DIR = os.path.join(os.path.dirname(__file__), "..", "public", "icons")

BG = (30, 41, 59)  # slate-800
FG = (226, 232, 240)  # slate-200
ACCENT = (56, 189, 248)  # sky-400


def draw_icon(size: int) -> Image.Image:
    scale = 4  # anti-aliasing přes downscale
    s = size * scale
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)

    radius = s * 0.22
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=BG)

    cx, cy = s / 2, s / 2
    r = s * 0.30
    node_r = s * 0.085

    angles = [-90, 30, 150]
    points = []
    for a in angles:
        rad = math.radians(a)
        x = cx + r * math.cos(rad)
        y = cy + r * math.sin(rad)
        points.append((x, y))

    for i in range(len(points)):
        for j in range(i + 1, len(points)):
            d.line([points[i], points[j]], fill=ACCENT, width=max(2, int(s * 0.045)))

    for (x, y) in points:
        d.ellipse(
            [x - node_r, y - node_r, x + node_r, y + node_r],
            fill=FG,
            outline=ACCENT,
            width=max(1, int(s * 0.02)),
        )

    center_r = node_r * 0.9
    d.ellipse(
        [cx - center_r, cy - center_r, cx + center_r, cy + center_r],
        fill=ACCENT,
    )

    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    os.makedirs(OUT_DIR, exist_ok=True)
    for size in SIZES:
        icon = draw_icon(size)
        path = os.path.join(OUT_DIR, f"icon{size}.png")
        icon.save(path)
        print(f"Uloženo: {path}")


if __name__ == "__main__":
    main()
