#!/usr/bin/env python3
"""
Prepare the Title screen art for loading at its on-screen size.

Two dropped-in source images need conditioning before the game loads them
(see ADR 0015 for the Title wiring they feed):

  public/title-screen.raw.png  a PORTRAIT castle (1024x1536), but the viewport
                               is 320x240 landscape. The Title scales it to
                               WIDTH (320x480 — twice the viewport height) and
                               pans UP through it. Pre-scaling to 320x480 here
                               means the game displays it ~1:1 with no runtime
                               minification shimmer during the pan.

  public/game-title.raw.png    the "DRAGON KNIGHT" wordmark, a silver logo on an
                               OPAQUE black background (RGB, no alpha). The Title
                               fades it in over the SKY, where that black would
                               paste as a box. This keys the black to transparent
                               (RGBA) and scales it down to its on-screen width.

Derived artifacts (re-run after re-dropping either *.raw.png):
    public/title-screen.png          320x480 background, displayed 1:1
    public/game-title.png            keyed RGBA wordmark, ~TITLE_W px wide
    public/game-title.preview.png    wordmark composited over sky-blue (eyeball
                                     the key for halos/holes; not loaded by game)

The black key floods the background as the border-connected near-black region
(scipy label), so a dark interior enclosed by the logo can't be punched into a
hole; a luminance ramp softens the anti-aliased edge so no dark fringe haloes
over the light sky.
"""

from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent.parent
PUBLIC = ROOT / "public"

# Background: pre-scaled to the exact on-screen size (scale-to-width, ADR 0015).
BG_SRC = PUBLIC / "title-screen.raw.png"
BG_OUT = PUBLIC / "title-screen.png"
BG_SIZE = (320, 480)  # 320 wide (fills viewport width); 480 tall (pans through)

# Wordmark: keyed + scaled to its on-screen width.
LOGO_SRC = PUBLIC / "game-title.raw.png"
LOGO_OUT = PUBLIC / "game-title.png"
LOGO_PREVIEW = PUBLIC / "game-title.preview.png"
TITLE_W = 280  # on-screen wordmark width (px); sits within the 320 viewport
BG_THRESH = 36  # luminance <= this counts as keyable black background
EDGE_KNEE = 64  # foreground luminance below this ramps alpha down (kills halo)
SKY = (104, 168, 216)  # approx sky blue from the art, for the preview composite


def luminance(rgb: np.ndarray) -> np.ndarray:
    """Rec.601 luma of an (H, W, 3) uint8 array → (H, W) float."""
    return rgb[..., :3] @ np.array([0.299, 0.587, 0.114])


def key_black(src: Image.Image) -> Image.Image:
    """Make the border-connected black background transparent, softening edges."""
    rgb = np.asarray(src.convert("RGB"), dtype=np.uint8)
    lum = luminance(rgb)

    # Border-connected near-black is the background; an enclosed dark region
    # inside the logo is NOT (it never reaches the border), so it stays opaque.
    dark = lum <= BG_THRESH
    labels, _ = ndimage.label(dark)  # 4-connectivity
    border = np.concatenate(
        [labels[0, :], labels[-1, :], labels[:, 0], labels[:, -1]]
    )
    bg_labels = set(np.unique(border)) - {0}
    background = np.isin(labels, list(bg_labels))

    # Foreground alpha: opaque, but ramp down where the (anti-aliased) edge is
    # dark, so the silver logo dissolves into the sky instead of leaving a fringe.
    alpha = np.clip(lum / EDGE_KNEE, 0.0, 1.0) * 255.0
    alpha[background] = 0.0

    out = np.dstack([rgb, alpha.astype(np.uint8)])
    return Image.fromarray(out, "RGBA")


def main() -> None:
    bg = Image.open(BG_SRC).convert("RGB").resize(BG_SIZE, Image.LANCZOS)
    bg.save(BG_OUT)
    print(f"{BG_OUT.name}: {bg.size} (from {Image.open(BG_SRC).size})")

    logo_full = key_black(Image.open(LOGO_SRC))
    h = round(TITLE_W * logo_full.height / logo_full.width)
    logo = logo_full.resize((TITLE_W, h), Image.LANCZOS)
    logo.save(LOGO_OUT)
    print(f"{LOGO_OUT.name}: {logo.size} keyed RGBA (from {logo_full.size})")

    # Composite over sky for a sanity check the key is clean over the real bg.
    preview = Image.new("RGB", logo.size, SKY)
    preview.paste(logo, (0, 0), logo)
    preview.save(LOGO_PREVIEW)
    print(f"{LOGO_PREVIEW.name}: wordmark over sky-blue (eyeball the key)")


if __name__ == "__main__":
    main()
