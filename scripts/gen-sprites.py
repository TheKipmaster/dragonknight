#!/usr/bin/env python3
"""
Generate placeholder entity spritesheets — PROVING the animation pipeline.

This is a deliberately THROWAWAY artifact: it draws blocky, obviously-placeholder
frames so the real art path can be wired and verified end-to-end:

    public PNG → PreloadScene.load.spritesheet → this.anims.create → sprite.play()

Replace public/sprites/*.png with real art later; the loader call, the frame size,
and the animation keys (see ANIM in constants.ts) are the contract that stays put —
gameplay code never changes.

Derived artifact (re-run `python3 scripts/gen-sprites.py` to regenerate):
    public/sprites/walker.png      4-frame, 16px walk cycle (64x16 strip)
    public/sprites/walker.x8.png   8x preview for eyeballing (not loaded by the game)

Contract the game relies on:
  * TILE = 16px frames, laid left-to-right; frame index = column (0-based).
  * Frames 0..3 are the walk cycle and loop. Frame 0 doubles as the idle pose.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "public" / "sprites"
TILE = 16
WALK_FRAMES = 4

# Walker palette — matches the old placeholder rect (makeRect for TEX.walker), so
# the swap is visually continuous: same red body, same maroon border.
FILL = (214, 69, 80)       # 0xd64550
BORDER = (122, 31, 41)     # 0x7a1f29
EYE = (255, 220, 180)      # a pale glint, so "which way it faces" reads
FOOT = (90, 20, 28)        # darker than the border — little stubby feet


def transparent(img, ox):
    for y in range(TILE):
        for x in range(TILE):
            img.putpixel((ox + x, y), (0, 0, 0, 0))


def walker_frame(img, fx, step):
    """Draw one 16px walker frame in column `fx`. `step` (0..3) alternates the feet
    so looped playback reads as a waddle — unmistakably animated, unmistakably a
    placeholder."""
    ox = fx * TILE
    transparent(img, ox)

    # Body: a bordered block inset 2px on the sides, leaving room for feet at the
    # bottom. Top/bottom/left/right edge pixels take the darker border colour.
    top, bottom = 2, TILE - 3
    for y in range(top, bottom + 1):
        for x in range(2, TILE - 2):
            edge = x in (2, TILE - 3) or y in (top, bottom)
            img.putpixel((ox + x, y), BORDER if edge else FILL)

    # Eyes — two pale pips near the top.
    img.putpixel((ox + 5, top + 2), EYE)
    img.putpixel((ox + TILE - 6, top + 2), EYE)

    # Feet: on even steps the left foot plants low and the right lifts; on odd
    # steps they swap. That up/down alternation is the whole "walk".
    left_low = step in (0, 1)
    fy = TILE - 2
    lo, hi = (fy, fy - 1) if left_low else (fy - 1, fy)
    img.putpixel((ox + 4, lo), FOOT); img.putpixel((ox + 5, lo), FOOT)
    img.putpixel((ox + TILE - 6, hi), FOOT); img.putpixel((ox + TILE - 5, hi), FOOT)


def build():
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    img = Image.new("RGBA", (WALK_FRAMES * TILE, TILE), (0, 0, 0, 0))
    for i in range(WALK_FRAMES):
        walker_frame(img, i, i)
    img.save(OUT_DIR / "walker.png")
    img.resize((WALK_FRAMES * TILE * 8, TILE * 8), Image.NEAREST).save(OUT_DIR / "walker.x8.png")
    print(f"wrote {OUT_DIR/'walker.png'} ({WALK_FRAMES} frames, {TILE}px)")


if __name__ == "__main__":
    build()
