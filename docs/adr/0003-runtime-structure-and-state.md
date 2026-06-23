# 0003 — Scene layout and a typed GameState as the single source of truth

## Status

accepted (scene list amended by ADR 0006: a `Title` entry scene is added — `Boot → Preload → Title → Game (+UI)` — the `UI` scene's remit widens to narrative overlays, and `Game` becomes pausable by a modal presentation)

## Decision

The game runs as four Phaser Scenes:

- `Boot` — config, kicks off loading
- `Preload` — loads all assets (shared tileset, sprites, every Room's tilemap JSON per ADR 0001) with a progress bar
- `Game` — gameplay: activates Rooms, runs entities and physics
- `UI` — a **parallel** scene layered on top of `Game`, drawing the HUD (Hearts)

Cross-Room state lives in a **dedicated typed `GameState` module** (plain TypeScript) that is the single source of truth for: current/max Hearts, inventory, the active Room, and Dungeon progress (keys held, Doors opened, bosses defeated). Scenes import it directly.

Scenes and entities communicate through a small **event bus** (e.g. `player-damaged`, `room-changed`, `item-picked-up`) so `UI` and `Game` never reach into each other's internals.

## Considered options

- **Phaser's built-in `registry` for state (rejected).** Phaser-native and zero-setup, but stringly-typed and unstructured — it degrades into a junk drawer, and game state is the most bug-prone area. We chose TypeScript specifically to make this kind of state explicit and type-checked, so a typed module wins.
- **HUD drawn inside `Game` (rejected).** Would scroll with the camera and be torn down on Room transitions. A parallel `UI` scene keeps the HUD camera-independent and persistent.

## Consequences

A future reader will ask "why not just use the registry?" — this is the answer; don't migrate state into it. `GameState` must hold everything that has to outlive a Room teardown (per ADR 0001). The event bus is for _notifications_; `GameState` is for _data_ — keep that split clean (don't stash authoritative state in event payloads).

**Amendment (Traps, ADR 0008).** `progress` was framed as _progression_ — Keys held, Doors opened, Cutscenes seen. Traps add a second, deliberately broader category: **hazard memory**. A sprung Trap records its `${roomId}#${objId}` in `progress` so it rebuilds _revealed_ (but still live) on Room re-entry instead of getting its hidden first-strike twice. Only the "discovered" bit persists; the re-arm cadence and lit/dimmed phase are transient and recomputed live. So `progress` is now "anything that must survive Room teardown and the respawn-to-entrance loop," not strictly progression — a Trap is the first non-progression resident.
