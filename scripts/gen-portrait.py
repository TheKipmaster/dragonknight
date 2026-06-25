#!/usr/bin/env python3
"""
Generate the Knight's Dialogue Portrait — the dragon-headed hero, in profile.

Derived artifact (re-run to regenerate):
    public/portraits/knight.png      46x46 bust, the Dialogue box's Portrait slot
    public/portraits/knight.x8.png   8x preview for eyeballing (not loaded)

The Dialogue box (src/ui/DialogueBox.ts) draws this at DIALOGUE.portraitSize
(46px) via setDisplaySize, and the game renders pixelArt (NEAREST), so the source
is authored at the native 46x46 — a 1:1 scale that stays crisp. Swapping in finer
art means replacing this PNG only; the speaker wiring (SPEAKERS.player.portrait →
TEX.knightPortrait) doesn't change.

The subject (per the brief): a humanoid man with a dragon's head, blue scales and
plate armour, shown in profile from the waist up, his near hand clutching the
pommel of the sword on his belt. He faces RIGHT, toward the text he's speaking.

Technique: at 46px, gradients read as mush and polygon blobs lose the silhouette,
so the figure is HAND-PAINTED as a 46x46 grid of material letters (see ART below)
— one char per pixel, so the dragon's snout, horn and jaw are placed deliberately.
A shading pass then lights each pixel from a fixed top-left key light and stamps a
1px dark outline along every silhouette edge; that hard edge plus a few flat
shades per material is what reads as "pixel art".
"""

from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "portraits"
SIZE = 46

# ── Palette ───────────────────────────────────────────────────────────────────
# Each material is (base, light, dark, line): the flat fill, the top-left rim
# highlight, the bottom-right shadow, and its own seam/outline ink.
BG_TOP = (26, 27, 41)
BG_BOT = (15, 15, 24)
SPOT = (44, 46, 70)            # faint spotlight halo behind the head

SCALE = ((46, 92, 168), (96, 150, 224), (28, 58, 116), (12, 26, 56))   # blue hide
PLATE = ((96, 104, 126), (170, 178, 198), (56, 62, 80), (24, 28, 40))  # steel armour
HORN = ((196, 188, 162), (232, 226, 206), (140, 132, 110), (60, 56, 44))  # bone
BELT = ((92, 60, 34), (132, 92, 54), (58, 36, 18), (28, 16, 8))        # leather
GOLD = ((206, 168, 70), (244, 214, 120), (150, 112, 40), (60, 44, 14)) # pommel
EYE = ((240, 196, 70), (255, 236, 150), (150, 96, 20), (20, 12, 4))    # amber eye

# Material registry: name → (base, light, dark, line). Order is irrelevant here;
# paint order is set by the polygon list below.
MAT = {
    "scale": SCALE, "plate": PLATE, "horn": HORN,
    "belt": BELT, "gold": GOLD, "eye": EYE,
}


# One letter per material; '.' is background. The shader reads this map directly.
CHARS = {".": None, "s": "scale", "p": "plate", "h": "horn",
         "b": "belt", "g": "gold", "e": "eye"}


def parse(art):
    """Turn the hand-painted ART rows into mat[y][x] = material name or None.
    Rows are padded/truncated to the 46x46 grid so the source stays editable."""
    rows = art.strip("\n").split("\n")
    assert len(rows) == SIZE, f"ART has {len(rows)} rows, need {SIZE}"
    mat = [[None] * SIZE for _ in range(SIZE)]
    for y, row in enumerate(rows):
        row = row.ljust(SIZE)[:SIZE]
        for x, ch in enumerate(row):
            mat[y][x] = CHARS[ch]
    return mat


def bg_color(y):
    """Vertical background gradient, dark and quantised into a few bands."""
    t = y / (SIZE - 1)
    band = round(t * 4) / 4
    return tuple(round(a + (b - a) * band) for a, b in zip(BG_TOP, BG_BOT))


def shade(mat):
    """Colour the label grid: flat material base, a top-left rim light and a
    bottom-right shadow against neighbours, plus a 1px dark seam wherever a
    material meets a *different* one (or the background). Pixel-art readability
    comes from that hard seam and the handful of flat shades."""
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    px = img.load()

    # Spotlight halo first, baked into the background, so the head pops off it.
    cx, cy, rad = 25, 17, 17
    for y in range(SIZE):
        for x in range(SIZE):
            c = bg_color(y)
            d = ((x - cx) ** 2 + (y - cy) ** 2) ** 0.5
            if d < rad:
                k = (1 - d / rad) * 0.5
                c = tuple(round(a + (b - a) * k) for a, b in zip(c, SPOT))
            px[x, y] = (*c, 255)

    def at(x, y):
        return mat[y][x] if 0 <= x < SIZE and 0 <= y < SIZE else None

    for y in range(SIZE):
        for x in range(SIZE):
            m = mat[y][x]
            if m is None:
                continue
            base, light, dark, line = MAT[m]

            up, left = at(x, y - 1), at(x - 1, y)
            down, right = at(x, y + 1), at(x + 1, y)

            # Seam/outline: a different material (or empty) above-left of us reads
            # as the lit silhouette edge → ink it; below-right stays the form's
            # own shadow line. We ink the whole silhouette for a clean cutout.
            border = any(n != m for n in (up, left, down, right))
            outer = any(n is None for n in (up, left, down, right))

            if outer:
                px[x, y] = (*line, 255)
                continue

            # Interior shading from a top-left key light.
            if up != m or left != m:
                col = light
            elif down != m or right != m:
                col = dark
            else:
                col = base

            # A sparse scale stipple: every few cells drop to the dark shade so the
            # blue hide reads as overlapping scales rather than a flat field.
            if m == "scale" and (x * 2 + y) % 5 == 0 and col is base:
                col = dark
            if border and not outer and (up is None or left is None):
                col = line

            px[x, y] = (*col, 255)
    return img


# ── The figure ────────────────────────────────────────────────────────────────
# Hand-painted on the 46x46 grid as horizontal spans: row → list of (c0, c1, char)
# filling columns c0..c1 inclusive. Later spans on a row paint over earlier ones,
# so the gold pommel and the gauntleted hand can sit atop the breastplate. The
# Knight faces RIGHT: a bone horn sweeps back off the crown (top-left), the snout
# thrusts to the right with an amber eye at its base, a fanged jaw opens beneath,
# and below the scaled neck the plate shoulders carry a fist clutching the sword's
# gold pommel at the belt.
SEG = {
    4:  [(13, 16, "h")],
    5:  [(12, 17, "h")],
    6:  [(12, 18, "h")],
    7:  [(13, 20, "h")],
    8:  [(15, 22, "h"), (22, 26, "s")],
    9:  [(17, 24, "h"), (22, 28, "s")],
    10: [(15, 31, "s"), (18, 22, "h")],
    11: [(14, 33, "s")],
    12: [(14, 44, "s")],
    13: [(13, 29, "s"), (30, 31, "e"), (32, 44, "s")],
    14: [(13, 29, "s"), (30, 30, "e"), (31, 44, "s")],
    15: [(14, 44, "s")],
    16: [(15, 44, "s")],
    17: [(16, 30, "s"), (34, 34, "h"), (38, 38, "h"), (42, 42, "h")],
    18: [(17, 41, "s"), (34, 34, "h"), (38, 38, "h"), (42, 42, "h")],
    19: [(18, 40, "s")],
    20: [(18, 38, "s")],
    21: [(18, 35, "s")],
    22: [(18, 32, "s")],
    23: [(17, 31, "s")],
    24: [(17, 31, "s")],
    25: [(16, 31, "s")],
    26: [(9, 13, "p"), (16, 31, "s")],
    27: [(9, 32, "p")],
    28: [(12, 34, "p")],
    29: [(11, 35, "p")],
    30: [(9, 40, "p")],
    31: [(8, 42, "p")],
    32: [(8, 43, "p")],
    33: [(11, 40, "p"), (22, 27, "g")],
    34: [(10, 41, "p"), (21, 28, "g")],
    35: [(10, 41, "p"), (20, 29, "s")],
    36: [(10, 41, "p"), (19, 30, "s")],
    37: [(11, 40, "p"), (19, 30, "s")],
    38: [(11, 40, "p"), (20, 29, "s")],
    39: [(11, 40, "p"), (21, 28, "s")],
    40: [(11, 40, "p")],
    41: [(11, 40, "b"), (23, 26, "p")],
    42: [(11, 40, "b"), (23, 26, "p")],
    43: [(12, 39, "p")],
    44: [(13, 38, "p")],
    45: [(14, 37, "p")],
}


def build_art():
    """Render SEG into the 46-row ART string the parser consumes."""
    grid = [["."] * SIZE for _ in range(SIZE)]
    for y, spans in SEG.items():
        for c0, c1, ch in spans:
            for x in range(c0, c1 + 1):
                grid[y][x] = ch
    return "\n".join("".join(row) for row in grid)


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    mat = parse(build_art())
    img = shade(mat)
    img.save(OUT_DIR / "knight.png")
    img.resize((SIZE * 8, SIZE * 8), Image.NEAREST).save(OUT_DIR / "knight.x8.png")
    print(f"wrote {(OUT_DIR / 'knight.png').relative_to(ROOT)} ({SIZE}x{SIZE})")


if __name__ == "__main__":
    build()
