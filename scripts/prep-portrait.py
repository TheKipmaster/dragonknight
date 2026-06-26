#!/usr/bin/env python3
"""
Condition a dropped-in Dialogue Portrait — crop a tall source bust to the square
46x46 the Dialogue box draws (DIALOGUE.portraitSize; src/ui/DialogueBox.ts).

Unlike the Knight's Portrait (scripts/gen-portrait.py paints it procedurally),
the Necromancer is a real piece of art dropped at art/portraits/necromancer.png
(1086x1448, portrait orientation). The Portrait slot is a 46x46 square rendered
NEAREST, so a tall source must be cropped square BEFORE the minify, or the bust
squashes. We crop to a head-and-shoulders square centred on the skull — the one
feature that must stay legible at 46px — then LANCZOS down to 46.

Derived artifacts (re-run after re-dropping the source):
    public/portraits/necromancer.png      46x46 bust, the Portrait slot
    public/portraits/necromancer.x8.png   8x preview for eyeballing (not loaded)

Swapping in finer art means replacing the source PNG and re-running; the speaker
wiring (SPEAKERS.necromancer.portrait -> TEX.necromancerPortrait) doesn't change.
"""

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "art" / "portraits" / "necromancer.png"
OUT_DIR = ROOT / "public" / "portraits"
SIZE = 46

# Head-and-shoulders square within the 1086x1448 source: a 760px box, centred
# horizontally and dropped 90px from the top, frames the skull and hood the way
# the Knight's bust frames his head — close enough that the face carries at 46px.
CROP = 760
CROP_Y = 90


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    src = Image.open(SRC).convert("RGB")
    x0 = (src.width - CROP) // 2
    bust = src.crop((x0, CROP_Y, x0 + CROP, CROP_Y + CROP))

    out = bust.resize((SIZE, SIZE), Image.LANCZOS)
    out.save(OUT_DIR / "necromancer.png")
    out.resize((SIZE * 8, SIZE * 8), Image.NEAREST).save(OUT_DIR / "necromancer.x8.png")
    print(f"wrote {(OUT_DIR / 'necromancer.png').relative_to(ROOT)} ({SIZE}x{SIZE}) from {src.size}")


if __name__ == "__main__":
    main()
