#!/usr/bin/env python3
"""
Generate a PLACEHOLDER pentagram floor decal.

Derived artifact (re-run to regenerate):
    public/tiles/pentagram.png   ~80px sigil, transparent background

This is a stand-in for real art. The game binds it under the logical key
TEX.pentagram and draws it at the `pentagram` point marker in a Room's `objects`
layer (see TiledRoom.readObjects). Swapping in real art means replacing this PNG
only — no code change.
"""

import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "tiles" / "pentagram.png"

SIZE = 80
CENTER = SIZE / 2
RADIUS = SIZE / 2 - 4
INK = (204, 34, 34, 230)  # ritual red
LINE = 2

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Outer circle.
draw.ellipse(
    [CENTER - RADIUS, CENTER - RADIUS, CENTER + RADIUS, CENTER + RADIUS],
    outline=INK,
    width=LINE,
)

# Five pentagon vertices, first point straight up.
pts = [
    (
        CENTER + RADIUS * math.cos(math.radians(-90 + i * 72)),
        CENTER + RADIUS * math.sin(math.radians(-90 + i * 72)),
    )
    for i in range(5)
]

# Connect every other vertex (0-2-4-1-3-0) to trace the star.
order = [0, 2, 4, 1, 3, 0]
for a, b in zip(order, order[1:]):
    draw.line([pts[a], pts[b]], fill=INK, width=LINE)

OUT.parent.mkdir(parents=True, exist_ok=True)
img.save(OUT)
print(f"wrote {OUT.relative_to(ROOT)} ({SIZE}x{SIZE})")
