#!/usr/bin/env python3
"""
Repack a ragged, hand/AI-authored walker sheet into a clean uniform spritesheet.

The dropped-in art (public/sprites/walker.raw.png) is a single row of 4 skeleton
poses scattered across a huge canvas with irregular gaps — Phaser's spritesheet
slicer needs a UNIFORM grid, so it can't read that directly. This script:

  1. Auto-detects the frames: threshold alpha, split columns at the wide gaps.
  2. Crops each frame to its content, scales them ALL by one factor (so no frame
     resizes mid-walk), and pastes each bottom-aligned + horizontally centred into
     a uniform CELL×CELL cell. Bottom-align keeps the feet on a fixed baseline.
  3. Emits a tight strip the game loads with frameWidth=frameHeight=CELL.

Derived artifact (re-run after re-dropping walker.raw.png):
    public/sprites/walker.png      4 uniform CELL px frames in a row
    public/sprites/walker.x8.png   8x preview (not loaded by the game)

CELL is the on-screen size (32px ≈ 2 tiles); change it here and the loader's
frame size in PreloadScene must match.
"""

from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "public" / "sprites"
SRC = SPRITES / "walker.raw.png"
CELL = 32          # output frame size in px (≈ 2 tiles); display 1:1, pixel-art
PAD = 1            # transparent breathing room inside each cell
MIN_GAP = 16       # an empty column run this wide counts as a frame boundary
ALPHA_CUT = 32     # alpha above this is "solid" (ignores faint export fringe)


def solid_mask(im):
    return im.getchannel("A").point(lambda v: 255 if v > ALPHA_CUT else 0)


def column_spans(mask):
    """X-spans of the frames: solid column runs separated by empty gaps >= MIN_GAP."""
    w, h = mask.size
    px = mask.load()
    solid_col = [any(px[x, y] for y in range(h)) for x in range(w)]
    spans, start, gap = [], None, 0
    for x in range(w):
        if solid_col[x]:
            if start is None:
                start = x
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= MIN_GAP:
                spans.append((start, x - gap))
                start = None
    if start is not None:
        spans.append((start, w - 1))
    return spans


def content_bbox(im, x0, x1):
    """Tight bbox of solid pixels within the column span [x0, x1]."""
    sub = im.crop((x0, 0, x1 + 1, im.height))
    bb = solid_mask(sub).getbbox()  # (l, t, r, b) within sub
    return (x0 + bb[0], bb[1], x0 + bb[2], bb[3])


def repack():
    im = Image.open(SRC).convert("RGBA")
    spans = column_spans(solid_mask(im))
    boxes = [content_bbox(im, a, b) for a, b in spans]
    print(f"detected {len(boxes)} frames: {boxes}")

    # One shared scale so every pose keeps the same on-screen size (no jitter).
    max_w = max(r - l for l, t, r, b in boxes)
    max_h = max(b - t for l, t, r, b in boxes)
    inner = CELL - 2 * PAD
    scale = min(inner / max_w, inner / max_h)

    sheet = Image.new("RGBA", (CELL * len(boxes), CELL), (0, 0, 0, 0))
    for i, (l, t, r, b) in enumerate(boxes):
        crop = im.crop((l, t, r, b))
        sw, sh = max(1, round((r - l) * scale)), max(1, round((b - t) * scale))
        crop = crop.resize((sw, sh), Image.NEAREST)
        ox = i * CELL + (CELL - sw) // 2          # horizontally centred
        oy = CELL - PAD - sh                       # feet on a fixed baseline
        sheet.alpha_composite(crop, (ox, oy))

    sheet.save(SPRITES / "walker.png")
    sheet.resize((sheet.width * 8, sheet.height * 8), Image.NEAREST).save(SPRITES / "walker.x8.png")
    print(f"wrote {SPRITES/'walker.png'} ({len(boxes)} frames, {CELL}px)")


if __name__ == "__main__":
    repack()
