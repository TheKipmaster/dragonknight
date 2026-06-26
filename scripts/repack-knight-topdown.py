#!/usr/bin/env python3
"""
Repack a ragged TOP-DOWN knight drop into a clean, rotation-ready spritesheet.

Sibling to scripts/repack-knight.py. Same front half — colour-KEY the flat
background to transparency, then split the row into frames at the wide gutters —
but the anchoring is built for a different camera and a different goal:

  SIDE-VIEW packer            TOP-DOWN packer (this file)
  ------------------          ---------------------------
  anchors on the FEET         anchors on the BODY CENTROID
  (a fixed standing point)    (the torso's middle, = the rotation pivot)
  cell is W x H (tall)        cell is SQUARE
  body never shifts sideways  body sits dead-centre in every cell

Why centroid + square: the whole point of a true top-down sprite is that ONE
frame can be rotated in-game to face any direction. That only looks right if the
sprite spins about the knight's body centre, so every frame must place that
centre at the exact middle of a square cell. Then `sprite.setOrigin(0.5)` +
rotating by the movement angle (with a +90 deg offset, since the art faces north
while Phaser's angle 0 faces east) makes the sword orbit the body cleanly.

Two robustness tricks, both dependency-free:
  * The body anchor is the MEDIAN of the foreground pixel coordinates, not the
    mean. A sword extended forward is a thin tail of pixels; the median ignores
    that tail and lands in the dense torso, so the pivot doesn't drift toward the
    blade on the attack frames.
  * The cell is sized to the farthest foreground pixel from the centroid (the
    sword tip at full reach). Rotation preserves distance-from-centre, so if the
    tip fits inside the inscribed circle it can NEVER clip the square at any
    angle.

Derived artifact (re-run after re-dropping knight.topdown.raw.png):
    public/sprites/knight.topdown.png      6 uniform CELL x CELL frames in a row
    public/sprites/knight.topdown.x8.png   8x preview (gitignored)

TARGET_BODY_PX is the on-screen body footprint diameter (sword excluded). CELL is
a FIXED square frame size the art is scaled to fit, NOT derived from each drop —
so PreloadScene's frameWidth/Height is set to CELL once and never drifts when art
is re-dropped. A sword long enough to clip the rotation circle fails --check
instead, prompting a deliberate one-time CELL bump.
"""

import argparse
import math
import statistics
import sys
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SPRITES = ROOT / "public" / "sprites"
SRC = SPRITES / "knight.topdown.raw.png"

EXPECTED_FRAMES = 6   # idle, walk-A, walk-B, hurt, attack-raise, attack-swing
CELL = 64             # FIXED output frame size (px). This is the loader contract:
                      # PreloadScene's frameWidth/Height must equal it, and it does
                      # NOT change when art is re-dropped — only a genuinely longer
                      # sword (caught by --check) ever forces a deliberate bump.
TARGET_BODY_PX = 24   # on-screen body footprint diameter (px), sword excluded
PAD = 2               # transparent breathing room inside the cell
MIN_GAP = 16          # empty column run this wide separates two frames
KEY_TOL = 40          # colour distance from the keyed background that counts as fg
MAG_MIN = 100         # a magenta pixel has R and B at least this high...
MAG_MARGIN = 30       # ...and G at least this far below the smaller of R,B
BODY_PCTL = 0.75      # foreground pixels within this distance percentile are "body"
BODY_SPREAD_WARN = 0.15  # body-radius range/median above this = inconsistent body


def build_mask(im):
    """Boolean foreground mask. A pixel is foreground when it is BOTH far from the
    background colour AND not magenta-hued.

    The background isn't a single flat colour — the model dithers it (the dominant
    shade is a minority of pixels), and anti-aliasing blends a pinkish fringe along
    every edge. A plain distance-from-dominant key leaves that fringe (and any
    swing-arc the model drew in a near-key colour) behind as speckle. Since the
    knight is blue/steel/gold with NO magenta, we also reject any magenta-hued
    pixel outright (R and B high, G well below both) — that strips the whole halo
    regardless of its exact shade."""
    from collections import Counter
    bg = Counter(im.getdata()).most_common(1)[0][0]
    px = im.load()
    w, h = im.size
    cut = KEY_TOL * KEY_TOL
    def is_magenta(p):
        return p[0] > MAG_MIN and p[2] > MAG_MIN and p[1] < min(p[0], p[2]) - MAG_MARGIN
    def fg(x, y):
        p = px[x, y]
        far = (p[0] - bg[0]) ** 2 + (p[1] - bg[1]) ** 2 + (p[2] - bg[2]) ** 2 > cut
        return far and not is_magenta(p)
    return [[fg(x, y) for x in range(w)] for y in range(h)], bg


def column_spans(mask, w, h):
    """X-spans of the frames: solid column runs separated by gaps >= MIN_GAP."""
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
    """Per frame: content bbox, body-centroid anchor, body radius, and sword reach.

    centroid = median of foreground coords (robust to the thin sword tail).
    body_r   = the BODY_PCTL distance from the centroid (torso size, sword excluded).
    reach    = the farthest foreground pixel from the centroid (sword tip).
    """
    boxes, anchors, body_rs, reaches = [], [], [], []
    for a, b in spans:
        pts = [(x, y) for y in range(h) for x in range(a, b + 1) if mask[y][x]]
        xs = [x for x, _ in pts]
        ys = [y for _, y in pts]
        l, t, r, bot = a, min(ys), b, max(ys)
        cx, cy = statistics.median(xs), statistics.median(ys)
        ds = sorted(math.hypot(x - cx, y - cy) for x, y in pts)
        boxes.append((l, t, r, bot))
        anchors.append((cx, cy))
        body_rs.append(ds[min(len(ds) - 1, int(BODY_PCTL * (len(ds) - 1)))])
        reaches.append(ds[-1])
    return boxes, anchors, body_rs, reaches


def _detect():
    im = Image.open(SRC).convert("RGB")
    w, h = im.size
    mask, bg = build_mask(im)
    spans = column_spans(mask, w, h)
    boxes, anchors, body_rs, reaches = frame_geometry(mask, w, h, spans)
    return im, w, h, mask, bg, boxes, anchors, body_rs, reaches


def _layout(body_rs, reaches):
    """Shared scale + rotation-fit maths, so check() and repack() never disagree.

    The body is scaled to a constant on-screen size and the cell is FIXED, so the
    only way a drop can fail to fit is a sword that reaches past the cell's
    inscribed circle — which would clip as the sprite rotates. Returns the scale,
    the farthest scaled reach from centre, and the safe radius (CELL/2 - PAD)."""
    scale = TARGET_BODY_PX / (2 * statistics.median(body_rs))
    reach_px = max(reaches) * scale
    return scale, reach_px, CELL / 2 - PAD


def check():
    """Validate the raw drop against the top-down contract WITHOUT writing output.

    Two invariants the diffusion model can't be trusted to honour: exactly
    EXPECTED_FRAMES poses split by wide gutters, and a torso drawn at one
    consistent size (so the rotated sprite doesn't pulse). Reports both, plus the
    sword reach per frame, and exits nonzero on a violation.
    """
    if not SRC.exists():
        print(f"FAIL: {SRC} not found — drop the top-down art there first.")
        return 1
    _, _, _, _, bg, boxes, anchors, body_rs, reaches = _detect()
    n = len(boxes)
    print(f"keyed bg {bg}; detected {n} frames (expected {EXPECTED_FRAMES})")

    print(f"  {'#':>2}  {'w':>4} {'h':>4}  {'body_r':>6} {'reach':>6}  {'anchor(x,y)':>12}")
    for i, ((l, t, r, b), (cx, cy), br, rch) in enumerate(
            zip(boxes, anchors, body_rs, reaches)):
        print(f"  {i:>2}  {r - l + 1:>4} {b - t + 1:>4}  {br:>6.1f} {rch:>6.1f}"
              f"  ({cx - l:>4.0f},{cy - t:>4.0f})")

    ok = True
    if n != EXPECTED_FRAMES:
        print(f"FAIL: detected {n} frames, expected {EXPECTED_FRAMES} — "
              f"poses overlap or gutters are too narrow (need >= {MIN_GAP}px).")
        ok = False

    lo, hi, med = min(body_rs), max(body_rs), statistics.median(body_rs)
    spread = (hi - lo) / med if med else 0
    verdict = "ok" if spread <= BODY_SPREAD_WARN else "TOO HIGH"
    print(f"body radius: {lo:.1f}-{hi:.1f}px (median {med:.1f}), "
          f"spread {spread:.0%} [{verdict}, limit {BODY_SPREAD_WARN:.0%}]")
    if spread > BODY_SPREAD_WARN:
        print("WARN: the torso is drawn at inconsistent sizes — the rotated "
              "sprite will pulse; regenerate or fix the outlier frame.")
        ok = False

    scale, reach_px, limit = _layout(body_rs, reaches)
    fit = "ok" if reach_px <= limit else "CLIPS"
    print(f"sword reach: {reach_px:.1f}px from centre "
          f"(safe radius {limit:.1f}px in CELL {CELL}) [{fit}]")
    if reach_px > limit:
        print(f"FAIL: the sword reaches past the cell's safe radius — it will clip "
              f"when rotated. Bump CELL to at least {2 * (reach_px + PAD):.0f} "
              f"(and PreloadScene to match), or shorten the swing.")
        ok = False

    print("PASS" if ok else "CHECK FAILED")
    return 0 if ok else 1


def repack():
    if not SRC.exists():
        print(f"error: {SRC} not found — drop the top-down art there first.")
        return 1
    im, w, h, mask, bg, boxes, anchors, body_rs, reaches = _detect()
    print(f"keyed bg {bg}; detected {len(boxes)} frames")

    # One scale for every frame (so the body never resizes mid-animation): map the
    # median torso diameter to the target. The cell is FIXED (not derived from how
    # far this drop's sword happens to reach), so the loader never drifts; a sword
    # that would clip the rotation circle is a --check failure, not a resize.
    scale, reach_px, limit = _layout(body_rs, reaches)
    centre = CELL / 2
    if reach_px > limit:
        print(f"WARN: sword reach {reach_px:.1f}px exceeds the safe radius "
              f"{limit:.1f}px — it will clip when rotated (run --check, bump CELL).")
    print(f"scale {scale:.3f} -> fixed cell {CELL}x{CELL}, body {TARGET_BODY_PX}px")

    # Punch the background out to transparency.
    rgba = im.convert("RGBA")
    rp = rgba.load()
    for y in range(h):
        for x in range(w):
            if not mask[y][x]:
                rp[x, y] = (0, 0, 0, 0)

    # Place each scaled frame so its body centroid lands on the cell centre.
    sheet = Image.new("RGBA", (CELL * len(boxes), CELL), (0, 0, 0, 0))
    for i, ((l, t, r, b), (cx, cy)) in enumerate(zip(boxes, anchors)):
        crop = rgba.crop((l, t, r + 1, b + 1))
        sw, sh = max(1, round((r - l + 1) * scale)), max(1, round((b - t + 1) * scale))
        crop = crop.resize((sw, sh), Image.NEAREST)
        ox = round(i * CELL + centre - (cx - l) * scale)
        oy = round(centre - (cy - t) * scale)
        sheet.alpha_composite(crop, (ox, oy))

    sheet.save(SPRITES / "knight.topdown.png")
    sheet.resize((sheet.width * 8, sheet.height * 8), Image.NEAREST).save(
        SPRITES / "knight.topdown.x8.png")
    print(f"wrote {SPRITES/'knight.topdown.png'} ({len(boxes)} frames, {CELL}x{CELL}px)")
    return 0


if __name__ == "__main__":
    ap = argparse.ArgumentParser(
        description="Repack the raw top-down knight drop into a rotation-ready spritesheet.")
    ap.add_argument("--check", action="store_true",
                    help="validate the raw drop against the contract without writing output")
    args = ap.parse_args()
    sys.exit(check() if args.check else repack())
