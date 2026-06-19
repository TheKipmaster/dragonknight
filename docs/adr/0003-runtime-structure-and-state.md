# 0003 — Scene layout and a typed GameState as the single source of truth

## Status

accepted

## Decision

The game runs as four Phaser Scenes:

- `Boot` — config, kicks off loading
- `Preload` — loads all assets (shared tileset, sprites, every Room's tilemap JSON per
  ADR 0001) with a progress bar
- `Game` — gameplay: activates Rooms, runs entities and physics
- `UI` — a **parallel** scene layered on top of `Game`, drawing the HUD (Hearts)

Cross-Room state lives in a **dedicated typed `GameState` module** (plain TypeScript) that
is the single source of truth for: current/max Hearts, inventory, the active Room, and
Dungeon progress (keys held, Doors opened, bosses defeated). Scenes import it directly.

Scenes and entities communicate through a small **event bus** (e.g. `player-damaged`,
`room-changed`, `item-picked-up`) so `UI` and `Game` never reach into each other's internals.

## Considered options

- **Phaser's built-in `registry` for state (rejected).** Phaser-native and zero-setup, but
  stringly-typed and unstructured — it degrades into a junk drawer, and game state is the
  most bug-prone area. We chose TypeScript specifically to make this kind of state explicit
  and type-checked, so a typed module wins.
- **HUD drawn inside `Game` (rejected).** Would scroll with the camera and be torn down on
  Room transitions. A parallel `UI` scene keeps the HUD camera-independent and persistent.

## Consequences

A future reader will ask "why not just use the registry?" — this is the answer; don't
migrate state into it. `GameState` must hold everything that has to outlive a Room teardown
(per ADR 0001). The event bus is for *notifications*; `GameState` is for *data* — keep that
split clean (don't stash authoritative state in event payloads).
