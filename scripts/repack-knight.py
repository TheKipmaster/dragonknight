#!/usr/bin/env python3
"""
Repack the ragged knight (Player) sheet into a clean uniform spritesheet.

Same job as scripts/repack-walker.py, with two wrinkles the knight art adds:

  1. NO ALPHA. The raw drop (knight.raw.png) is RGB with a solid grey backdrop,
     so we colour-KEY that grey to transparency before anything else.
  2. A WEAPON THAT LEAVES THE BODY. The attack frames swing a sword far past the
     torso, so centring each frame on its own content bbox (what repack-walker
     does) would make the body lurch sideways on those frames. Instead every
     frame is anchored on the knight's FEET — a fixed standing point — so the body
     stays put across the whole sheet and the sword just sweeps into the cell's
     empty margin. The cell is kept symmetric about that point, so a future
     left-facing flip mirrors the swing correctly.

Derived artifact (re-run after re-dropping knight.raw.png):
    public/sprites/knight.png      uniform CELL_W x CELL_H frames in a row
    public/sprites/knight.x8.png   8x preview (gitignored)

TARGET_BODY_H is the on-screen body height (≈2 tiles, to match the Walker); the
cell ends up a bit taller/wider to hold the raised sword. The loader's frame size
in PreloadScene must match the printed cell dimensions.
"""

import argparse
import statistics
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "public" / "sprites"
SRC = SPRITES / "knight.raw.png"

EXPECTED_FRAMES = 6  # idle, walk-A, walk-B, hurt, attack-raise, attack-swing
BODY_SPREAD_WARN = 0.15  # body-height range/median above this means an inconsistent body
TARGET_BODY_H = 30   # on-screen height of the body (px), sword excluded
PAD = 2              # transparent breathing room around the cell
MIN_GAP = 16         # empty column run this wide separates two frames
KEY_TOL = 40         # colour distance from the keyed background that counts as fg
FEET_STRIP = 22      # bottom band (src px) whose centroid gives the standing x
BAND_FRAC = 0.22     # central column band (× body width) used to find the feet row


def build_mask(im):
    """Boolean foreground mask: a pixel is solid if it's far enough from the
    background colour (the sheet's most common colour)."""
    from collections import Counter
    bg = Counter(im.getdata()).most_common(1)[0][0]
    px = im.load()
    w, h = im.size
    cut = KEY_TOL * KEY_TOL
    def fg(x, y):
        p = px[x, y]
        return (p[0] - bg[0]) ** 2 + (p[1] - bg[1]) ** 2 + (p[2] - bg[2]) ** 2 > cut
    return [[fg(x, y) for x in range(w)] for y in range(h)], bg


def column_spans(mask, w, h):
    solid = [any(mask[y][x] for y in range(h)) for x in range(w)]
    spans, start, gap = [], None, 0
    for x in range(w):
        if solid[x]:
            start = x if start is None else start
            gap = 0
        elif start is not None:
            gap += 1
            if gap >= MIN_GAP:
                spans.append((start, x - gap))
                start = None
    if start is not None:
        spans.append((start, w - 1))
    return spans


def frame_geometry(mask, w, h, spans):
    """For each frame: its content bbox and the feet anchor (standing point)."""
    boxes, feet = [], []
    for a, b in spans:
        ys = [y for y in range(h) if any(mask[y][x] for x in range(a, b + 1))]
        l, t, r, bot = a, min(ys), b, max(ys)
        boxes.append((l, t, r, bot))
    body_w = statistics.median([r - l for l, t, r, b in boxes])
    band = max(4, int(body_w * BAND_FRAC))
    for (l, t, r, b) in boxes:
        pts = [(x, y) for y in range(b - FEET_STRIP, b + 1)
               for x in range(l, r + 1) if mask[y][x]]
        fx = round(sum(x for x, _ in pts) / len(pts))            # standing column
        fy = max(y for y in range(t, b + 1)                       # lowest leg row,
                 if any(mask[y][x] for x in range(fx - band, fx + band + 1)
                        if 0 <= x < w))                           # ignoring the sword
        feet.append((fx, fy))
    return boxes, feet


def check():
    """Validate the raw drop against the repack contract WITHOUT writing anything.

    The diffusion model can't be trusted to honour the two invariants the slicer
    and the feet-anchor depend on: exactly EXPECTED_FRAMES poses separated by wide
    gutters, and a body drawn at one consistent size. This reports both and exits
    nonzero on a violation, so a bad drop fails loudly instead of mis-slicing.
    """
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    mask, bg = build_mask(im)
    spans = column_spans(mask, w, h)
    boxes, feet = frame_geometry(mask, w, h, spans)
    n = len(boxes)
    print(f"keyed bg {bg}; detected {n} frames (expected {EXPECTED_FRAMES})")

    # Per-frame geometry. Narrow (sword-less) frames define the body; their height
    # should barely vary — a wide spread means the model redrew the knight bigger.
    median_w = statistics.median([r - l for l, t, r, b in boxes])
    print(f"  {'#':>2}  {'w':>4} {'h':>4}  {'feet(x,y)':>12}")
    body_hs = []
    for i, ((l, t, r, b), (fx, fy)) in enumerate(zip(boxes, feet)):
        narrow = (r - l) < 1.5 * median_w
        if narrow:
            body_hs.append(b - t)
        tag = "" if narrow else "  <- sword frame (excluded from body stats)"
        print(f"  {i:>2}  {r - l + 1:>4} {b - t + 1:>4}  ({fx - l:>4},{fy - t:>4}){tag}")

    ok = True
    if n != EXPECTED_FRAMES:
        print(f"FAIL: detected {n} frames, expected {EXPECTED_FRAMES} — "
              f"poses are overlapping or the gutters are too narrow (need >= {MIN_GAP}px).")
        ok = False
    if body_hs:
        lo, hi, med = min(body_hs), max(body_hs), statistics.median(body_hs)
        spread = (hi - lo) / med if med else 0
        verdict = "ok" if spread <= BODY_SPREAD_WARN else "TOO HIGH"
        print(f"body height: {lo}-{hi}px (median {med:.0f}), "
              f"spread {spread:.0%} [{verdict}, limit {BODY_SPREAD_WARN:.0%}]")
        if spread > BODY_SPREAD_WARN:
            print("WARN: the body is drawn at inconsistent sizes — the walk cycle "
                  "will scale-jitter; regenerate or fix the outlier frame.")
            ok = False

    print("PASS" if ok else "CHECK FAILED")
    return 0 if ok else 1


def repack():
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    mask, bg = build_mask(im)
    spans = column_spans(mask, w, h)
    boxes, feet = frame_geometry(mask, w, h, spans)
    print(f"keyed bg {bg}; detected {len(boxes)} frames")

    # Scale by body height (narrow, sword-less frames) so the body reads at a
    # constant size; the sword frames are simply taller/wider in the same cell.
    body_h = statistics.median([b - t for (l, t, r, b), (fx, fy) in zip(boxes, feet)
                                if (r - l) < 1.5 * statistics.median([R - L for L, _, R, _ in boxes])])
    scale = TARGET_BODY_H / body_h

    half = max(max(fx - l, r - fx) for (l, t, r, b), (fx, fy) in zip(boxes, feet))
    up = max(fy - t for (l, t, r, b), (fx, fy) in zip(boxes, feet))
    down = max(b - fy for (l, t, r, b), (fx, fy) in zip(boxes, feet))
    cell_w = round(2 * half * scale) + 2 * PAD
    cell_h = round((up + down) * scale) + 2 * PAD
    baseline = cell_h - PAD - round(down * scale)   # the row the feet sit on
    print(f"scale {scale:.3f} → cell {cell_w}x{cell_h}, body {TARGET_BODY_H}px")

    # Punch the background out to transparency, then place each scaled frame with
    # its feet on (cell centre-x, baseline).
    rgba = im.convert("RGBA")
    rp = rgba.load()
    for y in range(h):
        for x in range(w):
            if not mask[y][x]:
                rp[x, y] = (0, 0, 0, 0)

    sheet = Image.new("RGBA", (cell_w * len(boxes), cell_h), (0, 0, 0, 0))
    for i, ((l, t, r, b), (fx, fy)) in enumerate(zip(boxes, feet)):
        crop = rgba.crop((l, t, r + 1, b + 1))
        sw, sh = max(1, round((r - l + 1) * scale)), max(1, round((b - t + 1) * scale))
        crop = crop.resize((sw, sh), Image.NEAREST)
        ox = i * cell_w + round(cell_w / 2 - (fx - l) * scale)
        oy = round(baseline - (fy - t) * scale)
        sheet.alpha_composite(crop, (ox, oy))

    sheet.save(SPRITES / "knight.png")
    sheet.resize((sheet.width * 8, sheet.height * 8), Image.NEAREST).save(SPRITES / "knight.x8.png")
    print(f"wrote {SPRITES/'knight.png'} ({len(boxes)} frames, {cell_w}x{cell_h}px)")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Repack the raw knight drop into a uniform spritesheet.")
    ap.add_argument("--check", action="store_true",
                    help="validate the raw drop against the repack contract without writing output")
    args = ap.parse_args()
    sys.exit(check() if args.check else repack())
