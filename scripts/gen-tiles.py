#!/usr/bin/env python3
"""
Generate the rough-stone tileset and the sample Tiled maps.

Everything here is DERIVED — re-run `python3 scripts/gen-tiles.py` after tweaking
a parameter and the art + maps regenerate deterministically. The outputs are the
real artifacts the game loads:

    public/tiles/stone.png     the shared tileset image (one PNG, 16px tiles)
    public/tiles/stone.x8.png  an 8x preview for eyeballing (not loaded by the game)
    public/maps/room-01.tmj    single-screen room (20x15)
    public/maps/room-02.tmj    larger scrolling room (30x20)

Conventions (the contract the game code relies on):
  * TILE = 16px.
  * Tile GIDs (firstgid = 1, row-major over a 4-wide sheet):
        1 floor      2 floor-cracked   3 floor-mossy   4 void
        5 wall       6 wall-cracked    7 rubble        8 wall-top
  * COLLISION = the `walls` tile layer. Any non-empty cell there is solid; the
    code will do wallLayer.setCollisionByExclusion([-1]). Floor/decor never collide.
  * Object layer `objects` holds:
        - point objects named like a spawn id ("start", "from-east", ...)
        - rectangle objects named "door" with custom props targetRoom + targetSpawn
"""

import json
import random
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
TILES_DIR = ROOT / "public" / "tiles"
MAPS_DIR = ROOT / "public" / "maps"
TILE = 16
COLS = 4
ROWS = 2
SHEET_W = COLS * TILE
SHEET_H = ROWS * TILE

# ── Palettes ────────────────────────────────────────────────────────────────
# A few quantized shades per material reads as "pixel art" rather than gradient
# noise. Floor stays dark (recessed); walls are a lighter, blockier stone.
FLOOR = [(33, 33, 44), (38, 38, 50), (28, 28, 38), (44, 44, 58)]
GROUT = (19, 19, 27)                       # dark seam between floor flagstones
WALL = [(92, 92, 112), (104, 104, 126), (80, 80, 100), (72, 72, 90)]
WALL_LIGHT = (124, 124, 148)               # lit bevel (top/left)
WALL_DARK = (50, 50, 64)                   # shadow bevel (bottom/right)
MOSS = [(72, 98, 58), (90, 116, 66)]
RUBBLE = [(96, 96, 116), (110, 110, 130), (66, 66, 84)]
VOID = (9, 9, 13)


def put(img, ox, oy, x, y, color):
    img.putpixel((ox + x, oy + y), color)


def floor_base(img, ox, oy, rnd):
    """Rough flagstone with a darker grout seam on the top/left edges, so a field
    of these reads as a tiled grid rather than mush."""
    for y in range(TILE):
        for x in range(TILE):
            if x == 0 or y == 0:
                put(img, ox, oy, x, y, GROUT)
            else:
                put(img, ox, oy, x, y, rnd.choice(FLOOR))


def wall_base(img, ox, oy, rnd):
    """Solid block with a 1px bevel: lit on top/left, shadowed on bottom/right."""
    for y in range(TILE):
        for x in range(TILE):
            if y == 0 or x == 0:
                put(img, ox, oy, x, y, WALL_LIGHT)
            elif y == TILE - 1 or x == TILE - 1:
                put(img, ox, oy, x, y, WALL_DARK)
            else:
                put(img, ox, oy, x, y, rnd.choice(WALL))


def crack(img, ox, oy, rnd, color=(16, 16, 22)):
    """A jagged near-vertical fracture down the tile."""
    x = rnd.randint(5, 10)
    for y in range(2, TILE - 2):
        put(img, ox, oy, max(1, min(TILE - 2, x)), y, color)
        if rnd.random() < 0.35:
            put(img, ox, oy, max(1, min(TILE - 2, x + 1)), y, color)
        x += rnd.choice((-1, 0, 0, 1))


def speckle(img, ox, oy, rnd, palette, n):
    for _ in range(n):
        put(img, ox, oy, rnd.randint(1, TILE - 2), rnd.randint(1, TILE - 2),
            rnd.choice(palette))


def build_tileset():
    img = Image.new("RGBA", (SHEET_W, SHEET_H), (0, 0, 0, 0))
    # Each tile gets its own seeded RNG so the sheet is fully reproducible.
    def cell(gid):
        idx = gid - 1
        return (idx % COLS) * TILE, (idx // COLS) * TILE

    # 1 floor
    floor_base(img, *cell(1), random.Random(101))
    # 2 floor-cracked
    ox, oy = cell(2); r = random.Random(102); floor_base(img, ox, oy, r); crack(img, ox, oy, r)
    # 3 floor-mossy
    ox, oy = cell(3); r = random.Random(103); floor_base(img, ox, oy, r); speckle(img, ox, oy, r, MOSS, 14)
    # 4 void
    ox, oy = cell(4); r = random.Random(104)
    for y in range(TILE):
        for x in range(TILE):
            put(img, ox, oy, x, y, VOID if r.random() < 0.85 else (14, 14, 19))
    # 5 wall
    wall_base(img, *cell(5), random.Random(105))
    # 6 wall-cracked
    ox, oy = cell(6); r = random.Random(106); wall_base(img, ox, oy, r); crack(img, ox, oy, r, (40, 40, 52))
    # 7 rubble (decor: floor base + a small cairn of stones, NON-solid)
    ox, oy = cell(7); r = random.Random(107); floor_base(img, ox, oy, r)
    for (cx, cy) in [(7, 9), (8, 9), (6, 10), (9, 10), (7, 8), (8, 11), (7, 10)]:
        put(img, ox, oy, cx, cy, r.choice(RUBBLE))
    # 8 wall-top (wall with a brighter lit cap row — for the top edge of a wall run)
    ox, oy = cell(8); r = random.Random(108); wall_base(img, ox, oy, r)
    for x in range(TILE):
        put(img, ox, oy, x, 0, (150, 150, 176))
        put(img, ox, oy, x, 1, WALL_LIGHT)

    TILES_DIR.mkdir(parents=True, exist_ok=True)
    img.save(TILES_DIR / "stone.png")
    img.resize((SHEET_W * 8, SHEET_H * 8), Image.NEAREST).save(TILES_DIR / "stone.x8.png")
    print(f"wrote {TILES_DIR/'stone.png'} ({SHEET_W}x{SHEET_H}, {COLS*ROWS} tiles)")


# ── Tiled map authoring ───────────────────────────────────────────────────────
GID_FLOOR, GID_FLOOR_CRACK, GID_FLOOR_MOSS, GID_VOID = 1, 2, 3, 4
GID_WALL, GID_WALL_CRACK, GID_RUBBLE, GID_WALL_TOP = 5, 6, 7, 8


def embedded_tileset():
    """Tiled supports external .tsx files, but Phaser can't follow that reference
    on load — so we EMBED the tileset in every map. The `image` path is what
    Tiled uses to re-open the map; Phaser ignores it and binds by name instead."""
    return {
        "firstgid": 1,
        "name": "stone",
        "image": "../tiles/stone.png",
        "imagewidth": SHEET_W, "imageheight": SHEET_H,
        "tilewidth": TILE, "tileheight": TILE,
        "columns": COLS, "tilecount": COLS * ROWS,
        "margin": 0, "spacing": 0,
    }


def tile_layer(name, w, h, data, layer_id):
    return {
        "id": layer_id, "name": name, "type": "tilelayer",
        "x": 0, "y": 0, "width": w, "height": h,
        "opacity": 1, "visible": True, "data": data,
    }


def point(obj_id, name, tx, ty):
    """A spawn marker: a Tiled point object at the CENTRE of tile (tx,ty)."""
    return {
        "id": obj_id, "name": name, "type": "spawn", "point": True,
        "x": tx * TILE + TILE / 2, "y": ty * TILE + TILE / 2,
        "width": 0, "height": 0, "rotation": 0, "visible": True,
    }


def door(obj_id, tx, ty, target_room, target_spawn, lock_id=None):
    """A door trigger: a one-tile rectangle carrying where it leads (ADR 0001).
    Pass `lock_id` to make it a locked door — both sides of a doorway should share
    one lockId so opening it from either side opens it for good (ADR 0005)."""
    props = [
        {"name": "targetRoom", "type": "string", "value": target_room},
        {"name": "targetSpawn", "type": "string", "value": target_spawn},
    ]
    if lock_id:
        props.append({"name": "locked", "type": "bool", "value": True})
        props.append({"name": "lockId", "type": "string", "value": lock_id})
    return {
        "id": obj_id, "name": "door", "type": "door",
        "x": tx * TILE, "y": ty * TILE, "width": TILE, "height": TILE,
        "rotation": 0, "visible": True,
        "properties": props,
    }


def key_item(obj_id, tx, ty):
    """A Key pickup: a point object at the CENTRE of tile (tx,ty)."""
    return {
        "id": obj_id, "name": "key", "type": "item", "point": True,
        "x": tx * TILE + TILE / 2, "y": ty * TILE + TILE / 2,
        "width": 0, "height": 0, "rotation": 0, "visible": True,
    }


def make_map(w, h, floor, walls, objects):
    return {
        "type": "map", "version": "1.10", "tiledversion": "1.10.2",
        "orientation": "orthogonal", "renderorder": "right-down",
        "infinite": False, "compressionlevel": -1,
        "width": w, "height": h, "tilewidth": TILE, "tileheight": TILE,
        "tilesets": [embedded_tileset()],
        "layers": [
            tile_layer("floor", w, h, floor, 1),
            tile_layer("walls", w, h, walls, 2),
            {"id": 3, "name": "objects", "type": "objectgroup",
             "opacity": 1, "visible": True, "x": 0, "y": 0, "objects": objects},
        ],
        "nextlayerid": 4,
        "nextobjectid": max((o["id"] for o in objects), default=0) + 1,
    }


# ── Room shape: carve a curved chamber out of the grid ───────────────────────
# Tiles are square, so "round" is really a mask: each cell is FLOOR if it falls
# inside the shape, WALL if it sits on the shape's edge, and VOID (black, out of
# bounds) if it's outside. A *superellipse* gives the dial we want:
#     exponent 2   → a true ellipse (fully round)
#     exponent ~4  → a chamber with gently rounded corners ("round-ish")
#     exponent →∞  → back to a rectangle
def superellipse(cx, cy, rx, ry, exponent):
    """Return inside(x, y): is the CENTRE of cell (x, y) within the superellipse?"""
    def inside(x, y):
        dx = abs((x + 0.5 - cx) / rx)
        dy = abs((y + 0.5 - cy) / ry)
        return dx ** exponent + dy ** exponent <= 1.0
    return inside


def smooth(grid, w, h, passes=2):
    """Cellular-automata cleanup of a boolean mask: rasterising a curve onto a
    coarse grid leaves single-cell spikes (at the shape's apexes) and dents. Each
    pass erases any interior cell with <2 orthogonal interior neighbours (a nub)
    and fills any exterior cell with >=3 (a pinhole), rounding the outline."""
    for _ in range(passes):
        nxt = [row[:] for row in grid]
        for y in range(h):
            for x in range(w):
                n = sum(grid[y + dy][x + dx]
                        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                        if 0 <= x + dx < w and 0 <= y + dy < h)
                if grid[y][x] and n < 2:
                    nxt[y][x] = False
                elif not grid[y][x] and n >= 3:
                    nxt[y][x] = True
        grid = nxt
    return grid


def carve(w, h, inside, seed):
    """Build (floor, walls) for a room masked by `inside`.

    floor layer: a sprinkled floor tile on every interior cell, else empty.
    walls layer (== collision): a stone tile on every edge cell, a void tile on
    every exterior cell — both solid. North-facing edges get the lit wall-top."""
    r = random.Random(seed)
    inside_grid = smooth([[inside(x, y) for x in range(w)] for y in range(h)], w, h)
    floor = [0] * (w * h)
    walls = [0] * (w * h)
    for y in range(h):
        for x in range(w):
            i = y * w + x
            if inside_grid[y][x]:
                roll = r.random()
                floor[i] = (GID_FLOOR_CRACK if roll < 0.06
                            else GID_FLOOR_MOSS if roll < 0.11 else GID_FLOOR)
                continue
            # Edge cell = outside but touching an interior cell (8-neighbourhood,
            # so diagonals are sealed too — no leaks through corners).
            edge = any(
                inside_grid[ny][nx]
                for ny in range(max(0, y - 1), min(h, y + 2))
                for nx in range(max(0, x - 1), min(w, x + 2))
            )
            if edge:
                below_inside = y + 1 < h and inside_grid[y + 1][x]
                walls[i] = GID_WALL_TOP if below_inside else GID_WALL
            else:
                walls[i] = GID_VOID
    return floor, walls, inside_grid


def edge_on_axis(grid, cx, cy, dx, dy, w, h):
    """Walk from the centre outward along (dx, dy) over the *smoothed* inside grid;
    return the first edge cell — the wall that a door is punched through. Must use
    the smoothed grid (not the raw shape) so the opening lands on the real wall:
    smoothing erodes the equator tip, pulling the boundary in by a cell."""
    x, y = int(cx), int(cy)
    while 0 <= x + dx < w and 0 <= y + dy < h and grid[y + dy][x + dx]:
        x, y = x + dx, y + dy
    return x + dx, y + dy


def open_door(floor, walls, w, cell):
    """Turn one edge wall cell into a floor threshold so the door is walkable."""
    x, y = cell
    walls[y * w + x] = 0
    floor[y * w + x] = GID_FLOOR


def pillar(floor, walls, inside_grid, w, x, y):
    """A single solid interior block — only if the cell is actually inside."""
    if inside_grid[y][x]:
        walls[y * w + x] = GID_WALL


def build_maps():
    MAPS_DIR.mkdir(parents=True, exist_ok=True)

    # ── room-01: round-ish single-screen chamber (exp 4). Door EAST → room-02. ─
    w, h = 21, 15
    # radii leave a >=1-cell margin so a wall ring fully encloses the chamber
    inside = superellipse(cx=w / 2, cy=h / 2, rx=w / 2 - 1.5, ry=h / 2 - 1.5, exponent=4)
    floor, walls, grid = carve(w, h, inside, seed=1)
    cx, cy = w // 2, h // 2
    east_door = edge_on_axis(grid, cx, cy, 1, 0, w, h)
    west_door = edge_on_axis(grid, cx, cy, -1, 0, w, h)
    open_door(floor, walls, w, east_door)
    open_door(floor, walls, w, west_door)
    for (px, py) in [(7, 6), (8, 6), (13, 8), (14, 8)]:   # a couple of pillars
        pillar(floor, walls, grid, w, px, py)
    floor[cy * w + cx] = GID_RUBBLE                       # decor near centre
    objects = [
        point(1, "start", 4, cy),                        # new-game start
        point(2, "from-east", east_door[0] - 2, cy),     # arrival from the east door
        point(3, "from-debug", west_door[0] + 2, cy),    # arrival from the debug room
        # East door to room-02 is the locked gate; the Key to open it is in here.
        door(4, east_door[0], east_door[1], "room-02", "from-west", lock_id="gate-1"),
        door(5, west_door[0], west_door[1], "room-debug", "from-room01"),
        key_item(6, 10, 4),
    ]
    (MAPS_DIR / "room-01.tmj").write_text(json.dumps(make_map(w, h, floor, walls, objects), indent=1))
    print(f"wrote {MAPS_DIR/'room-01.tmj'} ({w}x{h}, round-ish)")

    # ── room-02: large, rounder chamber (exp 2.5) → scrolls. Door WEST → room-01. ─
    w, h = 31, 23
    inside = superellipse(cx=w / 2, cy=h / 2, rx=w / 2 - 1.5, ry=h / 2 - 1.5, exponent=2.5)
    floor, walls, grid = carve(w, h, inside, seed=2)
    cx, cy = w // 2, h // 2
    west_door = edge_on_axis(grid, cx, cy, -1, 0, w, h)
    open_door(floor, walls, w, west_door)
    for (px, py) in [(cx, cy), (cx - 6, cy - 4), (cx + 6, cy - 4),
                     (cx - 6, cy + 4), (cx + 6, cy + 4)]:  # a ring of pillars
        pillar(floor, walls, grid, w, px, py)
    objects = [
        point(1, "from-west", west_door[0] + 2, cy),
        # Same gate as room-01's east door; opening it from either side opens both.
        door(2, west_door[0], west_door[1], "room-01", "from-east", lock_id="gate-1"),
    ]
    (MAPS_DIR / "room-02.tmj").write_text(json.dumps(make_map(w, h, floor, walls, objects), indent=1))
    print(f"wrote {MAPS_DIR/'room-02.tmj'} ({w}x{h}, round)")

    # ── room-debug: a Tiled twin of the old PlaceholderRoom — a rectangular 30x22
    #    chamber with the same eight interior pillars. The player spawns here.
    #    "inside" is everything but the 1-tile border, so carve() rings it in wall
    #    (smoothing leaves right-angles untouched). One east door → room-01.
    w, h = 30, 22
    inside = lambda x, y: 1 <= x <= w - 2 and 1 <= y <= h - 2
    floor, walls, grid = carve(w, h, inside, seed=3)
    for (px, py) in [(10, 8), (10, 9), (19, 8), (19, 9),
                     (14, 14), (15, 14), (14, 15), (15, 15)]:
        pillar(floor, walls, grid, w, px, py)
    cx, cy = w // 2, h // 2
    east_door = edge_on_axis(grid, cx, cy, 1, 0, w, h)
    open_door(floor, walls, w, east_door)
    objects = [
        # Spawn dead-centre, matching the old PlaceholderRoom's (widthPx/2, heightPx/2).
        {"id": 1, "name": "start", "type": "spawn", "point": True,
         "x": w * TILE / 2, "y": h * TILE / 2,
         "width": 0, "height": 0, "rotation": 0, "visible": True},
        point(2, "from-room01", east_door[0] - 2, cy),
        door(3, east_door[0], east_door[1], "room-01", "from-debug"),
    ]
    (MAPS_DIR / "room-debug.tmj").write_text(json.dumps(make_map(w, h, floor, walls, objects), indent=1))
    print(f"wrote {MAPS_DIR/'room-debug.tmj'} ({w}x{h}, rectangular debug room)")


if __name__ == "__main__":
    build_tileset()
    build_maps()
