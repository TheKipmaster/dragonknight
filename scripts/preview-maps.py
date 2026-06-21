#!/usr/bin/env python3
"""Composite each .tmj (floor + walls + object markers) into a 3x preview PNG, so
the assembled rooms can be eyeballed without running the game. Markers: blue
circle = spawn point, yellow box = door rect. Previews are not loaded by the game."""
import json
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
TILE = 16
sheet = Image.open(ROOT / "public/tiles/stone.png").convert("RGBA")


def tile(gid):
    i = gid - 1
    return sheet.crop(((i % 4) * TILE, (i // 4) * TILE, (i % 4) * TILE + TILE, (i // 4) * TILE + TILE))


for tmj in sorted((ROOT / "public/maps").glob("*.tmj")):
    name = tmj.stem
    m = json.loads(tmj.read_text())
    w, h = m["width"], m["height"]
    img = Image.new("RGBA", (w * TILE, h * TILE), (0, 0, 0, 255))
    for layer in m["layers"]:
        if layer["type"] != "tilelayer":
            continue
        for idx, gid in enumerate(layer["data"]):
            if gid == 0:
                continue
            img.paste(tile(gid), ((idx % w) * TILE, (idx // w) * TILE))
    d = ImageDraw.Draw(img)
    for layer in m["layers"]:
        if layer["type"] != "objectgroup":
            continue
        for o in layer["objects"]:
            if o.get("point"):
                x, y = int(o["x"]), int(o["y"])
                d.ellipse([x - 3, y - 3, x + 3, y + 3], outline=(80, 200, 255), width=1)
            else:
                d.rectangle([o["x"], o["y"], o["x"] + o["width"] - 1, o["y"] + o["height"] - 1],
                            outline=(255, 210, 80), width=1)
    out = ROOT / f"public/maps/{name}.preview.png"
    img.resize((w * TILE * 3, h * TILE * 3), Image.NEAREST).save(out)
    print(f"{name}: {w}x{h} tiles -> {out.name}")
